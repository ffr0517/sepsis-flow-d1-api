suppressPackageStartupMessages({
  library(plumber)
})

`%||%` <- function(x, y) if (is.null(x)) y else x

find_api_dir <- function() {
  script_ofile <- tryCatch(sys.frame(1)$ofile, error = function(e) NULL)
  candidates <- unique(c(
    if (!is.null(script_ofile)) dirname(script_ofile) else NULL,
    "api",
    ".",
    "/app"
  ))
  candidates <- normalizePath(candidates, winslash = "/", mustWork = FALSE)

  for (dir in candidates) {
    has_flow <- file.exists(file.path(dir, "R", "flow.R"))
    if (isTRUE(has_flow)) return(dir)
  }

  stop(
    "Could not locate API directory containing R/flow.R. Searched: ",
    paste(candidates, collapse = ", ")
  )
}

api_dir <- find_api_dir()
source(file.path(api_dir, "R", "flow.R"))

day1_api_base_url <- Sys.getenv("DAY1_API_BASE_URL", unset = "https://sepsis-flow-d1-api.onrender.com")
day2_api_base_url <- Sys.getenv("DAY2_API_BASE_URL", unset = "https://sepsis-flow-platform.onrender.com")
request_timeout_seconds <- as.numeric(Sys.getenv("REQUEST_TIMEOUT_SECONDS", unset = "20"))
warmup_timeout_seconds <- as.numeric(Sys.getenv("WARMUP_TIMEOUT_SECONDS", unset = "90"))
warmup_poll_seconds <- as.numeric(Sys.getenv("WARMUP_POLL_SECONDS", unset = "3"))
warmup_request_timeout_seconds <- as.numeric(Sys.getenv(
  "WARMUP_REQUEST_TIMEOUT_SECONDS",
  unset = as.character(min(warmup_timeout_seconds, max(10, request_timeout_seconds)))
))
if (!is.finite(warmup_request_timeout_seconds) || warmup_request_timeout_seconds <= 0) {
  warmup_request_timeout_seconds <- min(warmup_timeout_seconds, max(10, request_timeout_seconds))
}
warmup_request_timeout_seconds <- min(warmup_request_timeout_seconds, warmup_timeout_seconds)
downstream_retry_attempts <- as.integer(Sys.getenv("DOWNSTREAM_RETRY_ATTEMPTS", unset = "3"))
downstream_retry_delay_seconds <- as.numeric(Sys.getenv("DOWNSTREAM_RETRY_DELAY_SECONDS", unset = "2"))
downstream_wake_path <- normalize_http_path(Sys.getenv("DOWNSTREAM_WAKE_PATH", unset = "/"), default = "/")
cors_allow_origins <- trimws(strsplit(Sys.getenv("CORS_ALLOW_ORIGINS", unset = "*"), ",")[[1]])
cors_allow_origins <- cors_allow_origins[nzchar(cors_allow_origins)]

set_cors_headers <- function(req, res) {
  request_origin <- req$HTTP_ORIGIN %||% "*"
  allow_origin <- if ("*" %in% cors_allow_origins) "*" else if (request_origin %in% cors_allow_origins) request_origin else cors_allow_origins[[1]] %||% ""

  if (nzchar(allow_origin)) res$setHeader("Access-Control-Allow-Origin", allow_origin)
  res$setHeader("Vary", "Origin")
  res$setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
  res$setHeader("Access-Control-Max-Age", "86400")
}

extract_baseline_input <- function(payload) {
  if (!is.list(payload)) return(NULL)
  candidate <- payload$data %||% payload$baseline_inputs %||% payload
  if (!is.list(candidate) || is.null(names(candidate))) return(NULL)
  as.list(candidate[baseline_fields])
}

wfaz_tool_first_value <- function(x) {
  if (is.null(x) || length(x) == 0) return(NULL)
  x[[1]]
}

wfaz_tool_parse_double <- function(x, field_label) {
  value <- wfaz_tool_first_value(x)
  if (is.null(value)) stop(sprintf("Missing required field: %s.", field_label), call. = FALSE)
  if (is.character(value) && !nzchar(trimws(value))) {
    stop(sprintf("Missing required field: %s.", field_label), call. = FALSE)
  }
  num <- suppressWarnings(as.numeric(value))
  if (!is.finite(num)) stop(sprintf("Invalid numeric value for %s.", field_label), call. = FALSE)
  num
}

wfaz_tool_parse_sex <- function(x) {
  value <- wfaz_tool_first_value(x)
  if (is.null(value)) stop("Missing required field: sex.", call. = FALSE)

  if (is.numeric(value) || is.integer(value) || is.logical(value)) {
    sex_num <- suppressWarnings(as.integer(value))
    if (identical(sex_num, 1L)) return(list(anthro_code = 1L, label = "male"))
    if (identical(sex_num, 0L) || identical(sex_num, 2L)) return(list(anthro_code = 2L, label = "female"))
  }

  sex_chr <- tolower(trimws(as.character(value)))
  if (sex_chr %in% c("1", "m", "male")) return(list(anthro_code = 1L, label = "male"))
  if (sex_chr %in% c("0", "2", "f", "female")) return(list(anthro_code = 2L, label = "female"))

  stop("Invalid sex value. Expected app encoding (1=male, 0=female) or male/female.", call. = FALSE)
}

wfaz_tool_parse_weight_unit <- function(x) {
  value <- wfaz_tool_first_value(x)
  if (is.null(value)) stop("Missing required field: weight unit.", call. = FALSE)

  if (is.numeric(value) || is.integer(value) || is.logical(value)) {
    unit_num <- suppressWarnings(as.integer(value))
    if (identical(unit_num, 1L)) return("kg")
    if (identical(unit_num, 0L)) return("lbs")
  }

  unit_chr <- tolower(trimws(as.character(value)))
  if (unit_chr %in% c("kg", "kgs", "kilogram", "kilograms")) return("kg")
  if (unit_chr %in% c("lb", "lbs", "pound", "pounds")) return("lbs")

  stop("Invalid weight unit. Expected kg or lbs.", call. = FALSE)
}

compute_wfaz_from_anthro <- function(sex, age_months, weight, weight_unit, days_per_month = 28) {
  if (!requireNamespace("anthro", quietly = TRUE)) {
    stop(
      "R package 'anthro' is not installed in the local orchestrator environment. Install it with install.packages('anthro').",
      call. = FALSE
    )
  }

  sex_parsed <- wfaz_tool_parse_sex(sex)
  age_months_num <- wfaz_tool_parse_double(age_months, "age.months")
  weight_num <- wfaz_tool_parse_double(weight, "weight")
  unit <- wfaz_tool_parse_weight_unit(weight_unit)

  if (age_months_num < 0) stop("Age (months) must be >= 0.", call. = FALSE)
  if (weight_num <= 0) stop("Weight must be > 0.", call. = FALSE)

  age_days <- as.integer(round(age_months_num * days_per_month))
  weight_kg <- if (identical(unit, "lbs")) weight_num * 0.45359237 else weight_num

  anthro_result <- suppressWarnings(anthro::anthro_zscores(
    sex = sex_parsed$anthro_code,
    age = age_days,
    is_age_in_month = FALSE,
    weight = weight_kg
  ))

  if (!is.data.frame(anthro_result) || nrow(anthro_result) < 1) {
    stop("anthro did not return a valid result.", call. = FALSE)
  }

  wfaz <- suppressWarnings(as.numeric(anthro_result$zwei[[1]] %||% NA_real_))
  if (!is.finite(wfaz)) {
    stop(
      "anthro could not calculate weight-for-age z-score for the provided inputs (check age range and values).",
      call. = FALSE
    )
  }

  list(
    wfaz = wfaz,
    age_months = age_months_num,
    age_days = age_days,
    weight_input = list(value = weight_num, unit = unit),
    weight_kg = weight_kg,
    sex = list(app_value = wfaz_tool_first_value(sex), anthro_code = sex_parsed$anthro_code, label = sex_parsed$label),
    anthro_flags = list(
      fwei = if ("fwei" %in% names(anthro_result)) anthro_result$fwei[[1]] else NULL
    )
  )
}

#* @filter cors
function(req, res) {
  set_cors_headers(req, res)

  if (identical(req$REQUEST_METHOD, "OPTIONS")) {
    res$status <- 200
    return(list(ok = TRUE))
  }

  plumber::forward()
}

#* @apiTitle Sepsis Flow Orchestrator API
#* @apiDescription Chains Day 1 and Day 2 prediction APIs for two-step web flows.

#* Health check with downstream reachability
#* @get /health
#* @serializer json list(auto_unbox = TRUE, digits = 10)
function() {
  day1 <- call_health(day1_api_base_url, timeout_sec = 5)
  day2 <- call_health(day2_api_base_url, timeout_sec = 5)
  list(
    status = "ok",
    orchestrator = list(
      day1_api_base_url = day1_api_base_url,
      day2_api_base_url = day2_api_base_url,
      request_timeout_seconds = request_timeout_seconds,
      warmup_timeout_seconds = warmup_timeout_seconds,
      warmup_poll_seconds = warmup_poll_seconds,
      warmup_request_timeout_seconds = warmup_request_timeout_seconds,
      downstream_retry_attempts = downstream_retry_attempts,
      downstream_retry_delay_seconds = downstream_retry_delay_seconds
    ),
    downstream = list(day1 = day1, day2 = day2)
  )
}

#* Warm up downstream APIs and wait until both are ready
#* @get /warmup
#* @post /warmup
#* @serializer json list(auto_unbox = TRUE, digits = 10)
function(res) {
  started <- Sys.time()
  trace <- new_trace("/warmup")
  message(sprintf(
    "[warmup] received request day1=%s day2=%s timeout=%.1fs poll=%.1fs per_request_timeout=%.1fs wake_path=%s",
    day1_api_base_url, day2_api_base_url, warmup_timeout_seconds, warmup_poll_seconds, warmup_request_timeout_seconds, downstream_wake_path
  ))

  per_target_warmup_timeout_seconds <- max(30, floor(warmup_timeout_seconds / 2))
  message(sprintf(
    "[warmup] sequential warmup enabled per_target_timeout=%.1fs",
    per_target_warmup_timeout_seconds
  ))

  day1 <- wait_for_downstream_ready(
    base_url = day1_api_base_url,
    timeout_sec = per_target_warmup_timeout_seconds,
    poll_every_sec = warmup_poll_seconds,
    per_request_timeout_sec = warmup_request_timeout_seconds,
    wake_path = downstream_wake_path
  )
  day2 <- wait_for_downstream_ready(
    base_url = day2_api_base_url,
    timeout_sec = per_target_warmup_timeout_seconds,
    poll_every_sec = warmup_poll_seconds,
    per_request_timeout_sec = warmup_request_timeout_seconds,
    wake_path = downstream_wake_path
  )

  if (!isTRUE(day1$ok) || !isTRUE(day2$ok)) {
    message(sprintf(
      "[warmup] failed day1_ok=%s day1_attempts=%d day2_ok=%s day2_attempts=%d",
      isTRUE(day1$ok), as.integer(day1$attempts %||% 0L), isTRUE(day2$ok), as.integer(day2$attempts %||% 0L)
    ))
    res$status <- 502
    return(envelope_error(
      message = "One or more downstream APIs did not become ready within warm-up timeout.",
      code = "DOWNSTREAM_WARMUP_TIMEOUT",
      details = list(day1 = day1, day2 = day2),
      trace = finalize_trace(trace, started)
    ))
  }

  message(sprintf(
    "[warmup] success day1_attempts=%d day2_attempts=%d",
    as.integer(day1$attempts %||% 0L), as.integer(day2$attempts %||% 0L)
  ))
  envelope_ok(
    data = list(day1 = day1, day2 = day2),
    warnings = list(),
    trace = finalize_trace(trace, started)
  )
}

#* Calculate WHO weight-for-age z-score (WFAZ) using the anthro package
#* @post /tools/wfaz
#* @body raw JSON payload with sex, age.months (or age_months), weight, and weight unit (kg/lbs)
#* @serializer json list(auto_unbox = TRUE, digits = 10)
function(req, res) {
  started <- Sys.time()
  trace <- new_trace("/tools/wfaz")

  payload <- read_json_body(req)
  if (is.null(payload)) {
    res$status <- 400
    return(envelope_error(
      message = "Invalid JSON body.",
      code = "INVALID_JSON",
      trace = finalize_trace(trace, started)
    ))
  }

  candidate <- payload$data %||% payload
  if (!is.list(candidate)) {
    res$status <- 400
    return(envelope_error(
      message = "Body must be a JSON object.",
      code = "INVALID_WFAZ_INPUT",
      trace = finalize_trace(trace, started)
    ))
  }

  sex_input <- candidate$sex %||% candidate[["sex"]]
  age_months_input <- candidate[["age.months"]] %||% candidate[["age_months"]]
  weight_input <- candidate[["weight"]] %||% candidate[["weight.value"]] %||% candidate[["weight_value"]]
  weight_unit_input <- candidate[["weight_unit"]] %||% candidate[["weight.unit"]]

  wfaz_result <- tryCatch(
    compute_wfaz_from_anthro(
      sex = sex_input,
      age_months = age_months_input,
      weight = weight_input,
      weight_unit = weight_unit_input,
      days_per_month = 28
    ),
    error = function(e) e
  )

  if (inherits(wfaz_result, "error")) {
    err_msg <- conditionMessage(wfaz_result)
    is_missing_pkg <- grepl("package 'anthro' is not installed", err_msg, fixed = TRUE)
    res$status <- if (is_missing_pkg) 503 else 422
    return(envelope_error(
      message = err_msg,
      code = if (is_missing_pkg) "ANTHRO_NOT_INSTALLED" else "WFAZ_CALC_FAILED",
      details = list(days_per_month = 28),
      trace = finalize_trace(trace, started)
    ))
  }

  envelope_ok(
    data = wfaz_result,
    warnings = list(),
    trace = finalize_trace(trace, started)
  )
}

#* Run Day 1 and return Day 2 prefill derived from Day 1 outputs
#* @post /flow/day1
#* @param format:string Optional. "long" or "wide" (default "long")
#* @param vote_threshold:double Optional. Threshold passed to Day 1 API.
#* @body raw JSON payload containing Day 1 baseline fields (optionally nested in data) and optional prevalence strata via `country`, `inpatient_status`, or nested `strata`.
#* @serializer json list(auto_unbox = TRUE, digits = 10)
function(req, res, format = "long", vote_threshold = NA_real_) {
  started <- Sys.time()
  trace <- new_trace("/flow/day1")
  vote_threshold <- normalize_optional_double(vote_threshold)

  payload <- read_json_body(req)
  if (is.null(payload)) {
    res$status <- 400
    return(envelope_error(
      message = "Invalid JSON body.",
      code = "INVALID_JSON",
      trace = finalize_trace(trace, started)
    ))
  }

  baseline_input <- extract_baseline_input(payload)
  strata <- extract_optional_strata(payload)
  missing <- validate_required_fields(baseline_input, baseline_fields)
  if (length(missing) > 0) {
    res$status <- 400
    return(envelope_error(
      message = paste("Missing required Day 1 fields:", paste(missing, collapse = ", ")),
      code = "MISSING_DAY1_FIELDS",
      details = list(required_fields = baseline_fields),
      trace = finalize_trace(trace, started)
    ))
  }

  levels_day1 <- payload$levels_day1 %||% payload$levels %||% NULL

  day1_query <- list(
    format = format %||% "long",
    vote_threshold = vote_threshold
  )
  day1_body <- list(
    data = baseline_input,
    levels = levels_day1,
    country = strata$country,
    inpatient_status = strata$inpatient_status
  )
  day1_body <- day1_body[!vapply(day1_body, is.null, logical(1))]

  day1_warm <- wait_for_downstream_ready(
    base_url = day1_api_base_url,
    timeout_sec = warmup_timeout_seconds,
    poll_every_sec = warmup_poll_seconds,
    per_request_timeout_sec = warmup_request_timeout_seconds,
    wake_path = downstream_wake_path
  )
  if (!isTRUE(day1_warm$ok)) {
    res$status <- 502
    return(envelope_error(
      message = "Day 1 API did not become ready within warm-up timeout.",
      code = "DOWNSTREAM_DAY1_WARMUP_TIMEOUT",
      details = list(
        endpoint = paste0(day1_api_base_url, "/health"),
        warmup_attempts = day1_warm$attempts,
        warmup_elapsed_seconds = day1_warm$elapsed_seconds %||% NA_real_,
        last_health = day1_warm$last
      ),
      trace = finalize_trace(trace, started)
    ))
  }

  day1_resp <- call_json_post_with_retry(
    base_url = day1_api_base_url,
    path = "/predict/day1",
    body = day1_body,
    query = day1_query,
    timeout_sec = request_timeout_seconds,
    attempts = downstream_retry_attempts,
    delay_sec = downstream_retry_delay_seconds
  )

  if (!isTRUE(day1_resp$ok)) {
    res$status <- 502
    return(envelope_error(
      message = "Failed to get Day 1 predictions from downstream API.",
      code = "DOWNSTREAM_DAY1_ERROR",
      details = list(
        endpoint = day1_resp$url %||% paste0(day1_api_base_url, "/predict/day1"),
        downstream_status = day1_resp$status,
        downstream_attempt = day1_resp$attempt %||% NA_integer_,
        downstream_error_type = day1_resp$error_type,
        downstream_message = day1_resp$error_message,
        downstream_body = day1_resp$response_body %||% NULL
      ),
      trace = finalize_trace(trace, started, list(downstream_elapsed_ms = day1_resp$elapsed_ms))
    ))
  }

  derived <- derive_day2_prefill(day1_resp$body)
  if (!isTRUE(derived$ok)) {
    res$status <- 500
    return(envelope_error(
      message = "Day 1 succeeded, but Day 2 prefill mapping failed.",
      code = "DAY2_PREFILL_MAPPING_FAILED",
      details = list(cause = derived$error %||% "Unknown mapping failure."),
      trace = finalize_trace(trace, started, list(downstream_elapsed_ms = day1_resp$elapsed_ms))
    ))
  }

  out <- list(
    day1_result = day1_resp$body,
    day2_prefill = derived$prefill,
    baseline_inputs = baseline_input,
    strata = if (isTRUE(strata$has_any)) list(
      country = strata$country,
      inpatient_status = strata$inpatient_status
    ) else NULL
  )

  envelope_ok(
    data = out,
    warnings = list(),
    trace = finalize_trace(trace, started, list(downstream_elapsed_ms = day1_resp$elapsed_ms))
  )
}

#* Run Day 2 using baseline fields + editable Day 2 prefill fields
#* @post /flow/day2
#* @param format:string Optional. "long" or "wide" (default "long")
#* @param vote_threshold:double Optional. Threshold passed to Day 2 API.
#* @body raw JSON payload with baseline_inputs and day2_prefill, or a complete data object, plus optional prevalence strata via `country`, `inpatient_status`, or nested `strata`.
#* @serializer json list(auto_unbox = TRUE, digits = 10)
function(req, res, format = "long", vote_threshold = NA_real_) {
  started <- Sys.time()
  trace <- new_trace("/flow/day2")
  vote_threshold <- normalize_optional_double(vote_threshold)

  payload <- read_json_body(req)
  if (is.null(payload)) {
    res$status <- 400
    return(envelope_error(
      message = "Invalid JSON body.",
      code = "INVALID_JSON",
      trace = finalize_trace(trace, started)
    ))
  }

  levels_day2 <- payload$levels_day2 %||% payload$levels %||% NULL
  strata <- extract_optional_strata(payload)

  has_full_data <- is.list(payload$data) && !is.null(names(payload$data))
  if (isTRUE(has_full_data)) {
    day2_input <- payload$data
  } else {
    baseline_input <- payload$baseline_inputs %||% NULL
    prefill_input <- payload$day2_prefill %||% NULL
    day2_input <- merge_day2_input(baseline_input, prefill_input)
  }

  missing <- validate_required_fields(day2_input, day2_required_fields)
  if (length(missing) > 0) {
    res$status <- 400
    return(envelope_error(
      message = paste("Missing required Day 2 fields:", paste(missing, collapse = ", ")),
      code = "MISSING_DAY2_FIELDS",
      details = list(required_fields = day2_required_fields),
      trace = finalize_trace(trace, started)
    ))
  }

  for (nm in day2_treatment_fields) {
    day2_input[[nm]] <- normalize_binary_int(day2_input[[nm]])
  }

  day2_query <- list(
    format = format %||% "long",
    vote_threshold = vote_threshold
  )
  day2_body <- list(
    data = day2_input,
    levels = levels_day2,
    country = strata$country,
    inpatient_status = strata$inpatient_status
  )
  day2_body <- day2_body[!vapply(day2_body, is.null, logical(1))]

  day2_warm <- wait_for_downstream_ready(
    base_url = day2_api_base_url,
    timeout_sec = warmup_timeout_seconds,
    poll_every_sec = warmup_poll_seconds,
    per_request_timeout_sec = warmup_request_timeout_seconds,
    wake_path = downstream_wake_path
  )
  if (!isTRUE(day2_warm$ok)) {
    res$status <- 502
    return(envelope_error(
      message = "Day 2 API did not become ready within warm-up timeout.",
      code = "DOWNSTREAM_DAY2_WARMUP_TIMEOUT",
      details = list(
        endpoint = paste0(day2_api_base_url, "/health"),
        warmup_attempts = day2_warm$attempts,
        warmup_elapsed_seconds = day2_warm$elapsed_seconds %||% NA_real_,
        last_health = day2_warm$last
      ),
      trace = finalize_trace(trace, started)
    ))
  }

  day2_resp <- call_json_post_with_retry(
    base_url = day2_api_base_url,
    path = "/predict/day2",
    body = day2_body,
    query = day2_query,
    timeout_sec = request_timeout_seconds,
    attempts = downstream_retry_attempts,
    delay_sec = downstream_retry_delay_seconds
  )

  if (!isTRUE(day2_resp$ok)) {
    res$status <- 502
    return(envelope_error(
      message = "Failed to get Day 2 predictions from downstream API.",
      code = "DOWNSTREAM_DAY2_ERROR",
      details = list(
        endpoint = day2_resp$url %||% paste0(day2_api_base_url, "/predict/day2"),
        downstream_status = day2_resp$status,
        downstream_attempt = day2_resp$attempt %||% NA_integer_,
        downstream_error_type = day2_resp$error_type,
        downstream_message = day2_resp$error_message,
        downstream_body = day2_resp$response_body %||% NULL
      ),
      trace = finalize_trace(trace, started, list(downstream_elapsed_ms = day2_resp$elapsed_ms))
    ))
  }

  out <- list(
    day2_result = day2_resp$body,
    final_day2_input_used = day2_input,
    strata = if (isTRUE(strata$has_any)) list(
      country = strata$country,
      inpatient_status = strata$inpatient_status
    ) else NULL
  )

  envelope_ok(
    data = out,
    warnings = list(),
    trace = finalize_trace(trace, started, list(downstream_elapsed_ms = day2_resp$elapsed_ms))
  )
}
