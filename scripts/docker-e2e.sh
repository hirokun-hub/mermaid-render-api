#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null; then
  echo "docker is required for this helper" >&2
  exit 1
fi

docker compose up --build -d
cleanup() {
  docker compose down
}
trap cleanup EXIT

sleep 5

echo "==> GET /healthz"
curl -i http://localhost:3000/healthz

echo "\n==> POST /render"
curl -i -X POST http://localhost:3000/render -H "Content-Type: application/json" -d '{"code":"graph TD\nA-->B","format":"svg"}'
