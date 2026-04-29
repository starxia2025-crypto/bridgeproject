#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.runtime"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"

mkdir -p "$LOG_DIR"

if [[ ! -f "$ROOT_DIR/.env.local" ]]; then
  echo "Missing $ROOT_DIR/.env.local"
  exit 1
fi

if [[ ! -f "$ROOT_DIR/artifacts/api-server/dist/index.mjs" ]]; then
  echo "Backend build not found. Run: pnpm --filter @workspace/api-server run build"
  exit 1
fi

if [[ ! -f "$ROOT_DIR/artifacts/helpdesk/dist/public/index.html" ]]; then
  echo "Frontend build not found. Run: pnpm --filter @workspace/helpdesk run build"
  exit 1
fi

if [[ -f "$BACKEND_PID_FILE" ]] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
  echo "Backend already running with PID $(cat "$BACKEND_PID_FILE")"
  exit 1
fi

if [[ -f "$FRONTEND_PID_FILE" ]] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
  echo "Frontend already running with PID $(cat "$FRONTEND_PID_FILE")"
  exit 1
fi

set -a
. "$ROOT_DIR/.env.local"
set +a

: "${PORT:=3001}"

nohup node "$ROOT_DIR/artifacts/api-server/dist/index.mjs" >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

nohup pnpm --filter @workspace/helpdesk exec vite preview --host 0.0.0.0 --port 4173 >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

sleep 2

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Backend failed to start. Check $BACKEND_LOG"
  exit 1
fi

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo "Frontend failed to start. Check $FRONTEND_LOG"
  exit 1
fi

echo "Backend running on port $PORT (PID $BACKEND_PID)"
echo "Frontend preview running on port 4173 (PID $FRONTEND_PID)"
echo "Backend log: $BACKEND_LOG"
echo "Frontend log: $FRONTEND_LOG"
