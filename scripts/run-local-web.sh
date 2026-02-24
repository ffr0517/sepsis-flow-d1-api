#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DAY1_PORT="${DAY1_PORT:-8001}"
DAY2_PORT="${DAY2_PORT:-8002}"
ORCH_PORT="${ORCH_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

DAY1_DIR="$ROOT_DIR/services/day1-api/api"
DAY2_DIR="$ROOT_DIR/services/day2-api/api"
ORCH_DIR="$ROOT_DIR/services/orchestrator-api/api"
WEB_DIR="$ROOT_DIR/services/web-app"

LOG_DIR="${SEPSIS_FLOW_LOG_DIR:-${TMPDIR:-/tmp}/sepsis-flow-local-$(date +%Y%m%d-%H%M%S)}"
RUN_WARMUP="${SEPSIS_FLOW_RUN_WARMUP:-1}"

PIDS=()
NAMES=()
LOGS=()

usage() {
  cat <<EOF
Usage: $(basename "$0")

Starts the local Day 1 API, Day 2 API, orchestrator API, and static web app server.
Waits for health checks, then prints the local UI URL.

Environment overrides (optional):
  DAY1_PORT (default: 8001)
  DAY2_PORT (default: 8002)
  ORCH_PORT (default: 8000)
  WEB_PORT  (default: 5173)
  SEPSIS_FLOW_LOG_DIR (default: temp directory)
  SEPSIS_FLOW_RUN_WARMUP=0 to skip POST /warmup after health checks
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_dir() {
  if [[ ! -d "$1" ]]; then
    echo "Missing required directory: $1" >&2
    exit 1
  fi
}

require_cmd R
require_cmd python3
require_cmd curl
require_dir "$DAY1_DIR"
require_dir "$DAY2_DIR"
require_dir "$ORCH_DIR"
require_dir "$WEB_DIR"

mkdir -p "$LOG_DIR"

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ ${#PIDS[@]} -gt 0 ]]; then
    echo
    echo "Stopping local services..."
    local i
    for (( i=${#PIDS[@]}-1; i>=0; i-- )); do
      if kill -0 "${PIDS[$i]}" 2>/dev/null; then
        kill "${PIDS[$i]}" 2>/dev/null || true
      fi
    done

    sleep 1

    for (( i=${#PIDS[@]}-1; i>=0; i-- )); do
      if kill -0 "${PIDS[$i]}" 2>/dev/null; then
        kill -9 "${PIDS[$i]}" 2>/dev/null || true
      fi
    done
  fi

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

start_service() {
  local name="$1"
  local workdir="$2"
  local log_file="$3"
  shift 3

  echo "Starting $name..."
  (
    cd "$workdir"
    exec "$@"
  ) >"$log_file" 2>&1 &

  local pid=$!
  PIDS+=("$pid")
  NAMES+=("$name")
  LOGS+=("$log_file")

  echo "  pid=$pid"
  echo "  log=$log_file"
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local timeout_seconds="$3"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      echo "$name is ready: $url"
      return 0
    fi

    local now
    now="$(date +%s)"
    if (( now - started_at >= timeout_seconds )); then
      echo "Timed out waiting for $name: $url" >&2
      return 1
    fi

    local i
    for i in "${!PIDS[@]}"; do
      if ! kill -0 "${PIDS[$i]}" 2>/dev/null; then
        echo "$name did not become ready because '${NAMES[$i]}' exited." >&2
        echo "See log: ${LOGS[$i]}" >&2
        return 1
      fi
    done

    sleep 2
  done
}

run_orchestrator_warmup() {
  local url="$1"
  echo "Running orchestrator warmup (POST $url)..."
  if curl -fsS --max-time 180 -X POST "$url" >/dev/null; then
    echo "Orchestrator warmup completed."
    return 0
  fi

  echo "Orchestrator warmup failed: $url" >&2
  return 1
}

monitor_processes() {
  while true; do
    local i
    for i in "${!PIDS[@]}"; do
      if ! kill -0 "${PIDS[$i]}" 2>/dev/null; then
        echo
        echo "Process exited unexpectedly: ${NAMES[$i]} (pid ${PIDS[$i]})" >&2
        echo "See log: ${LOGS[$i]}" >&2
        return 1
      fi
    done
    sleep 2
  done
}

echo "Logs will be written to: $LOG_DIR"

start_service \
  "Day 1 API" \
  "$DAY1_DIR" \
  "$LOG_DIR/day1-api.log" \
  R -e "pr <- plumber::plumb('plumber.R'); pr\$run(host='0.0.0.0', port=${DAY1_PORT})"

start_service \
  "Day 2 API" \
  "$DAY2_DIR" \
  "$LOG_DIR/day2-api.log" \
  R -e "pr <- plumber::plumb('plumber.R'); pr\$run(host='0.0.0.0', port=${DAY2_PORT})"

start_service \
  "Orchestrator API" \
  "$ORCH_DIR" \
  "$LOG_DIR/orchestrator-api.log" \
  env \
  DAY1_API_BASE_URL="http://localhost:${DAY1_PORT}" \
  DAY2_API_BASE_URL="http://localhost:${DAY2_PORT}" \
  CORS_ALLOW_ORIGINS="http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}" \
  R -e "pr <- plumber::plumb('plumber.R'); pr\$run(host='0.0.0.0', port=${ORCH_PORT})"

start_service \
  "Web App" \
  "$WEB_DIR" \
  "$LOG_DIR/web-app.log" \
  python3 -m http.server "${WEB_PORT}"

wait_for_http "Day 1 API" "http://localhost:${DAY1_PORT}/health" 120
wait_for_http "Day 2 API" "http://localhost:${DAY2_PORT}/health" 120
wait_for_http "Orchestrator API" "http://localhost:${ORCH_PORT}/health" 120
wait_for_http "Web App" "http://localhost:${WEB_PORT}/index.local.html" 20

if [[ "$RUN_WARMUP" != "0" ]]; then
  run_orchestrator_warmup "http://localhost:${ORCH_PORT}/warmup"
else
  echo "Skipping orchestrator warmup (SEPSIS_FLOW_RUN_WARMUP=0)."
fi

echo
echo "Local Sepsis Flow stack is ready."
echo "Open: http://localhost:${WEB_PORT}/index.local.html"
echo "Logs: $LOG_DIR"
echo "Press Ctrl+C to stop all services."

monitor_processes
