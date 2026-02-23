suppressPackageStartupMessages({
  library(httr2)
  library(jsonlite)
})

`%||%` <- function(x, y) if (is.null(x)) y else x

baseline_fields <- c(
  "age.months", "sex", "adm.recent", "wfaz", "cidysymp",
  "not.alert", "hr.all", "rr.all", "envhtemp", "crt.long", "oxy.ra"
)

day2_treatment_fields <- c(
  "LEVEL1_TREATMENTS_D1_SAFE_0",
  "LEVEL2_TREATMENTS_D1_SAFE_0",
  "LEVEL3_TREATMENTS_D1_SAFE_0",
  "LEVEL4_TREATMENTS_D1_SAFE_0",
  "LEVEL5_TREATMENTS_D1_SAFE_0"
)

day2_required_fields <- c(baseline_fields, day2_treatment_fields)

level_to_day2_field <- c(
  L1 = "LEVEL1_TREATMENTS_D1_SAFE_0",
  L2 = "LEVEL2_TREATMENTS_D1_SAFE_0",
  L3 = "LEVEL3_TREATMENTS_D1_SAFE_0",
  L4 = "LEVEL4_TREATMENTS_D1_SAFE_0",
  L5 = "LEVEL5_TREATMENTS_D1_SAFE_0",
  "Mechanical ventilation, inotropes, or renal replacement therapy" = "LEVEL1_TREATMENTS_D1_SAFE_0",
  "CPAP or IV fluid bolus" = "LEVEL2_TREATMENTS_D1_SAFE_0",
  "ICU admission with clinical reason" = "LEVEL3_TREATMENTS_D1_SAFE_0",
  "O2 via face or nasal cannula" = "LEVEL4_TREATMENTS_D1_SAFE_0",
  "Non-bolused IV fluids" = "LEVEL5_TREATMENTS_D1_SAFE_0"
)

trim_slashes <- function(x) sub("/+$", "", as.character(x %||% ""))

request_id <- function() {
  paste0(
    format(Sys.time(), "%Y%m%dT%H%M%OS3Z", tz = "UTC"),
    "-",
    paste(sample(c(letters, 0:9), size = 6, replace = TRUE), collapse = "")
  )
}

new_trace <- function(endpoint) {
  list(
    request_id = request_id(),
    endpoint = endpoint,
    started_utc = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
  )
}

finalize_trace <- function(trace, started_at, extra = list()) {
  elapsed_ms <- round(as.numeric(difftime(Sys.time(), started_at, units = "secs")) * 1000, 2)
  utils::modifyList(trace, c(
    list(
      finished_utc = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
      elapsed_ms = elapsed_ms
    ),
    extra
  ))
}

envelope_ok <- function(data, warnings = list(), trace = list()) {
  list(
    ok = TRUE,
    data = data,
    warnings = warnings,
    error = NULL,
    trace = trace
  )
}

envelope_error <- function(message, code, trace = list(), details = NULL, warnings = list()) {
  list(
    ok = FALSE,
    data = NULL,
    warnings = warnings,
    error = list(
      message = message,
      code = code,
      details = details
    ),
    trace = trace
  )
}

read_json_body <- function(req) {
  tryCatch(
    jsonlite::fromJSON(req$postBody, simplifyVector = FALSE),
    error = function(e) NULL
  )
}

validate_required_fields <- function(x, required_fields) {
  if (!is.list(x) || is.null(names(x))) return(required_fields)
  setdiff(required_fields, names(x))
}

normalize_optional_scalar <- function(x) {
  if (is.null(x) || length(x) == 0) return(NULL)
  val <- trimws(as.character(x[[1]]))
  if (!nzchar(val)) return(NULL)
  val
}

extract_optional_strata <- function(payload) {
  payload_strata <- if (is.list(payload$strata)) payload$strata else list()
  country <- normalize_optional_scalar(payload$country %||% payload_strata$country %||% NULL)
  inpatient_status <- normalize_optional_scalar(payload$inpatient_status %||% payload_strata$inpatient_status %||% NULL)

  list(
    country = country,
    inpatient_status = inpatient_status,
    has_any = !is.null(country) || !is.null(inpatient_status)
  )
}

normalize_binary_int <- function(x) {
  if (is.logical(x)) return(as.integer(isTRUE(x)))
  if (is.numeric(x)) return(as.integer(x > 0.5))
  if (is.character(x) && length(x) == 1) {
    v <- tolower(trimws(x))
    if (v %in% c("1", "true", "yes", "y")) return(1L)
    if (v %in% c("0", "false", "no", "n")) return(0L)
  }
  0L
}

normalize_optional_double <- function(x) {
  if (is.null(x) || length(x) == 0) return(NULL)
  if (is.character(x) && length(x) == 1 && !nzchar(trimws(x))) return(NULL)
  num <- suppressWarnings(as.numeric(x[[1]]))
  if (!is.finite(num)) return(NULL)
  num
}

normalize_day2_prefill <- function(prefill) {
  out <- setNames(as.list(rep(0L, length(day2_treatment_fields))), day2_treatment_fields)
  if (!is.list(prefill) || is.null(names(prefill))) return(out)
  for (nm in intersect(names(prefill), day2_treatment_fields)) {
    out[[nm]] <- normalize_binary_int(prefill[[nm]])
  }
  out
}

compose_query_string <- function(query = list()) {
  if (length(query) == 0) return("")
  keys <- names(query)
  if (is.null(keys)) return("")

  parts <- c()
  for (k in keys) {
    v <- query[[k]]
    if (is.null(v) || length(v) == 0) next
    vals <- as.character(v)
    for (val in vals) {
      parts <- c(parts, paste0(utils::URLencode(k, reserved = TRUE), "=", utils::URLencode(val, reserved = TRUE)))
    }
  }

  if (length(parts) == 0) "" else paste0("?", paste(parts, collapse = "&"))
}

normalize_http_path <- function(path, default = "/") {
  val <- trimws(as.character(path %||% ""))
  if (!nzchar(val)) val <- default
  if (!startsWith(val, "/")) val <- paste0("/", val)
  val
}

format_health_probe_log <- function(health) {
  status <- if (is.null(health$status) || isTRUE(is.na(health$status))) "NA" else as.character(health$status)
  err <- gsub("[\r\n]+", " ", as.character(health$error %||% ""))
  if (!nzchar(trimws(err))) err <- "-"
  paste0("ok=", isTRUE(health$ok), " status=", status, " error=", err)
}

call_http_get <- function(base_url, path = "/", timeout_sec = 5, accept = "*/*", parse_json = FALSE) {
  normalized_path <- normalize_http_path(path)
  url <- paste0(trim_slashes(base_url), normalized_path)

  resp <- tryCatch(
    {
      httr2::request(url) |>
        httr2::req_headers("Accept" = accept) |>
        httr2::req_timeout(timeout_sec) |>
        httr2::req_error(is_error = function(resp) FALSE) |>
        httr2::req_perform()
    },
    error = function(e) e
  )

  if (inherits(resp, "error")) {
    return(list(ok = FALSE, status = NA_integer_, url = url, error = resp$message))
  }

  status <- httr2::resp_status(resp)
  text_body <- tryCatch(httr2::resp_body_string(resp), error = function(e) NULL)
  parsed_body <- NULL
  if (isTRUE(parse_json) && !is.null(text_body) && nzchar(text_body)) {
    parsed_body <- tryCatch(jsonlite::fromJSON(text_body, simplifyVector = FALSE), error = function(e) NULL)
  }

  out <- list(
    ok = status < 400,
    status = status,
    url = url,
    body = parsed_body
  )

  if (!isTRUE(out$ok)) {
    body_snippet <- if (is.null(text_body)) NULL else substr(gsub("[\r\n]+", " ", text_body), 1, 240)
    if (!is.null(body_snippet) && nzchar(trimws(body_snippet))) out$error <- body_snippet
  }

  out
}

call_json_post <- function(base_url, path, body, query = list(), timeout_sec = 15) {
  url <- paste0(trim_slashes(base_url), path, compose_query_string(query))
  started <- Sys.time()

  resp <- tryCatch(
    {
      httr2::request(url) |>
        httr2::req_headers("Content-Type" = "application/json", "Accept" = "application/json") |>
        httr2::req_body_json(body, auto_unbox = TRUE) |>
        httr2::req_timeout(timeout_sec) |>
        httr2::req_perform()
    },
    error = function(e) e
  )

  elapsed_ms <- round(as.numeric(difftime(Sys.time(), started, units = "secs")) * 1000, 2)

  if (inherits(resp, "error")) {
    return(list(
      ok = FALSE,
      status = NA_integer_,
      url = url,
      elapsed_ms = elapsed_ms,
      error_type = "network",
      error_message = resp$message
    ))
  }

  status <- httr2::resp_status(resp)
  text_body <- httr2::resp_body_string(resp)
  parsed <- tryCatch(jsonlite::fromJSON(text_body, simplifyVector = FALSE), error = function(e) text_body)

  if (status >= 400) {
    return(list(
      ok = FALSE,
      status = status,
      url = url,
      elapsed_ms = elapsed_ms,
      error_type = "http",
      error_message = "Downstream API returned an error status.",
      response_body = parsed
    ))
  }

  list(
    ok = TRUE,
    status = status,
    url = url,
    elapsed_ms = elapsed_ms,
    body = parsed
  )
}

call_health <- function(base_url, timeout_sec = 5) {
  resp <- call_http_get(
    base_url = base_url,
    path = "/health",
    timeout_sec = timeout_sec,
    accept = "application/json, text/plain, */*",
    parse_json = TRUE
  )
  list(
    ok = resp$ok,
    status = resp$status,
    body = resp$body,
    error = resp$error %||% NULL,
    url = resp$url
  )
}

call_wake_probe <- function(base_url, timeout_sec = 10, path = "/") {
  call_http_get(
    base_url = base_url,
    path = path,
    timeout_sec = timeout_sec,
    accept = "text/html,application/json,text/plain,*/*",
    parse_json = FALSE
  )
}

wait_for_downstream_ready <- function(base_url, timeout_sec = 90, poll_every_sec = 3, per_request_timeout_sec = 8, wake_path = "/") {
  started <- Sys.time()
  attempts <- 0L
  last <- list(ok = FALSE, status = NA_integer_, error = "No attempts made.")
  target_label <- trim_slashes(base_url)
  wake_path_norm <- normalize_http_path(wake_path, default = "/")
  use_wake_probe <- !identical(wake_path_norm, "/health")
  wake_timeout_sec <- min(per_request_timeout_sec, max(10, poll_every_sec + 5))

  repeat {
    attempts <- attempts + 1L
    if (isTRUE(use_wake_probe)) {
      message(sprintf(
        "[warmup] wake target=%s path=%s attempt=%d timeout=%.1fs",
        target_label, wake_path_norm, attempts, wake_timeout_sec
      ))
      wake <- call_wake_probe(base_url, timeout_sec = wake_timeout_sec, path = wake_path_norm)
      message(sprintf(
        "[warmup] wake target=%s path=%s attempt=%d %s",
        target_label, wake_path_norm, attempts, format_health_probe_log(wake)
      ))
    }
    message(sprintf(
      "[warmup] probing target=%s attempt=%d per_request_timeout=%.1fs",
      target_label, attempts, per_request_timeout_sec
    ))
    health <- call_health(base_url, timeout_sec = per_request_timeout_sec)
    last <- health
    message(sprintf(
      "[warmup] target=%s attempt=%d %s",
      target_label, attempts, format_health_probe_log(health)
    ))
    if (isTRUE(health$ok)) {
      return(list(ok = TRUE, attempts = attempts, last = health))
    }

    elapsed <- as.numeric(difftime(Sys.time(), started, units = "secs"))
    if (elapsed >= timeout_sec) {
      return(list(ok = FALSE, attempts = attempts, last = last, elapsed_seconds = round(elapsed, 2)))
    }

    Sys.sleep(poll_every_sec)
  }
}

wait_for_multiple_downstreams_ready <- function(base_urls, timeout_sec = 90, poll_every_sec = 3, per_request_timeout_sec = 8) {
  urls <- as.list(base_urls)
  if (length(urls) == 0) return(list())

  if (is.null(names(urls))) {
    names(urls) <- paste0("target_", seq_along(urls))
  }

  state <- lapply(urls, function(x) list(
    ok = FALSE,
    attempts = 0L,
    last = list(ok = FALSE, status = NA_integer_, error = "No attempts made.")
  ))

  started <- Sys.time()

  repeat {
    for (nm in names(urls)) {
      if (isTRUE(state[[nm]]$ok)) next
      state[[nm]]$attempts <- state[[nm]]$attempts + 1L
      message(sprintf(
        "[warmup] probing target=%s url=%s attempt=%d per_request_timeout=%.1fs",
        nm, trim_slashes(urls[[nm]]), state[[nm]]$attempts, per_request_timeout_sec
      ))
      health <- call_health(urls[[nm]], timeout_sec = per_request_timeout_sec)
      state[[nm]]$last <- health
      if (isTRUE(health$ok)) state[[nm]]$ok <- TRUE
      message(sprintf(
        "[warmup] target=%s attempt=%d %s",
        nm, state[[nm]]$attempts, format_health_probe_log(health)
      ))
    }

    if (all(vapply(state, function(x) isTRUE(x$ok), logical(1)))) {
      return(lapply(state, function(x) {
        list(ok = TRUE, attempts = x$attempts, last = x$last)
      }))
    }

    elapsed <- as.numeric(difftime(Sys.time(), started, units = "secs"))
    if (elapsed >= timeout_sec) {
      return(lapply(state, function(x) {
        list(
          ok = isTRUE(x$ok),
          attempts = x$attempts,
          last = x$last,
          elapsed_seconds = round(elapsed, 2)
        )
      }))
    }

    Sys.sleep(poll_every_sec)
  }
}

is_retryable_downstream_failure <- function(resp) {
  if (isTRUE(resp$ok)) return(FALSE)
  if (is.na(resp$status)) return(TRUE)
  as.integer(resp$status) >= 500
}

call_json_post_with_retry <- function(base_url, path, body, query = list(), timeout_sec = 15, attempts = 3, delay_sec = 2) {
  attempt <- 0L
  last <- NULL

  while (attempt < attempts) {
    attempt <- attempt + 1L
    resp <- call_json_post(base_url = base_url, path = path, body = body, query = query, timeout_sec = timeout_sec)
    resp$attempt <- attempt
    last <- resp

    if (isTRUE(resp$ok) || !is_retryable_downstream_failure(resp)) {
      break
    }

    if (attempt < attempts) Sys.sleep(delay_sec)
  }

  last
}

derive_day2_prefill <- function(day1_result) {
  out <- setNames(as.list(rep(0L, length(day2_treatment_fields))), day2_treatment_fields)

  if (!is.list(day1_result)) {
    return(list(ok = FALSE, error = "Day 1 result must be a list of treatment rows."))
  }

  for (row in day1_result) {
    if (!is.list(row)) next
    level <- as.character(row$level %||% "")
    field <- unname(level_to_day2_field[[level]] %||% "")
    if (!nzchar(field)) next
    vote <- row$predicted_treatment_by_majority_vote %||% 0
    out[[field]] <- normalize_binary_int(vote)
  }

  list(ok = TRUE, prefill = out)
}

merge_day2_input <- function(baseline_inputs, day2_prefill) {
  pref <- normalize_day2_prefill(day2_prefill)
  out <- utils::modifyList(baseline_inputs, pref)
  out
}
