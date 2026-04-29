#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.runtime"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"

stop_process() {
  local pid_file="$1"
  local name="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name is not running"
    return
  fi

  local pid
  pid="$(cat "$pid_file")"

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "Stopped $name (PID $pid)"
  else
    echo "$name PID file exists but process is not running"
  fi

  rm -f "$pid_file"
}

stop_process "$BACKEND_PID_FILE" "backend"
stop_process "$FRONTEND_PID_FILE" "frontend"
