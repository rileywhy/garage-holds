#!/usr/bin/env bash
# Run from the repository root with the Python requirements and Chromium installed.
set -euo pipefail

export NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= SUPABASE_SECRET_KEY=
export R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET_NAME=
export NEXT_TELEMETRY_DISABLED=1
export LAB_E2E_URL=http://127.0.0.1:3093
export PYTHON="${PYTHON:-python3}"

logs=$(mktemp -d)
pids=()
cleanup() {
  local status=$?
  if (( status != 0 )); then
    tail -n 30 "$logs"/*.log
  fi
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait || true
  rm -rf "$logs"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

start() {
  local name=$1
  shift
  "$@" >"$logs/$name.log" 2>&1 &
  pids+=("$!")
}

wait_for_http() {
  local url=$1
  local pid=$2
  for ((attempt = 0; attempt < 100; attempt++)); do
    if curl --silent --max-time 1 --output /dev/null "$url"; then return; fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
  echo "Service failed to start at $url" >&2
  return 1
}

urls=()
for entry in crimp:8766 sloper:8771 jug:8781 foot:8785 pocket:8795 pinch:8796 roundpinch:8798 crack:8797; do
  kind=${entry%:*}
  port=${entry#*:}
  base="http://127.0.0.1:$port"
  export "${kind^^}_API_URL=$base"
  tool=$kind
  if [[ $kind == roundpinch ]]; then tool=round-pinch; fi
  start "$kind" "$PYTHON" "tools/$tool-generator/serve_api.py" --port "$port"
  urls+=("$base/api/$kind")
done
export CUSTOM_SHAPE_API_URL=http://127.0.0.1:8791
start custom-shape "$PYTHON" api/custom_shape.py
urls+=("$CUSTOM_SHAPE_API_URL/api/custom_shape")

for i in "${!urls[@]}"; do wait_for_http "${urls[i]}" "${pids[i]}"; done

npm run build
start next node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3093
wait_for_http "$LAB_E2E_URL/api/health" "${pids[-1]}"
npm run test:browser-e2e
npm run test:e2e
