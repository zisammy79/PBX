#!/usr/bin/env bash
set -euo pipefail

ensure_process() {
  local name="$1"
  local port="$2"
  local start_cmd="$3"
  local health_url="${4:-}"
  local pid_file="${5:-}"

  if [[ -n "$health_url" ]] && curl -sf "$health_url" >/dev/null 2>&1; then
    return 0
  fi
  if [[ -n "$port" ]] && ss -ltn 2>/dev/null | grep -q ":${port} "; then
    if [[ -n "$health_url" ]]; then
      for _ in $(seq 1 20); do
        if curl -sf "$health_url" >/dev/null 2>&1; then
          return 0
        fi
        sleep 0.5
      done
    else
      return 0
    fi
  fi

  fuser -k "${port}/tcp" 2>/dev/null || true
  sleep 0.5

  mkdir -p .local/demo
  # shellcheck disable=SC2086
  eval "$start_cmd" >/dev/null 2>&1 &
  local pid=$!
  if [[ -n "$pid_file" ]]; then
    echo "$pid" >"$pid_file"
  fi
  sleep 2

  if [[ -z "$health_url" ]]; then
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    echo "FAIL: ${name} process exited immediately" >&2
    return 1
  fi

  for _ in $(seq 1 80); do
    if [[ -n "$health_url" ]] && curl -sf "$health_url" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "FAIL: ${name} process exited before becoming ready" >&2
      return 1
    fi
    sleep 0.5
  done

  echo "FAIL: ${name} did not become ready" >&2
  return 1
}

stop_demo_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    kill "$pid" 2>/dev/null || true
    rm -f "$pid_file"
  fi
}
