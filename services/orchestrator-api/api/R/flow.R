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
  url <- paste0(trim_slashes(base_url), "/health")
  resp <- tryCatch(
    {
      httr2::request(url) |>
        httr2::req_timeout(timeout_sec) |>
        httr2::req_perform()
    },
    error = function(e) e
  )

  if (inherits(resp, "error")) {
    return(list(ok = FALSE, status = NA_integer_, error = resp$message))
  }

  status <- httr2::resp_status(resp)
  body <- tryCatch(httr2::resp_body_json(resp, simplifyVector = FALSE), error = function(e) NULL)
  list(ok = status < 400, status = status, body = body)
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
