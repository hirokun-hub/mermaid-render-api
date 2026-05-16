#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
API="${MERMAID_RENDER_API:-http://localhost:3100/render}"
CASES="$DIR/scripts/cases.json"
OUT_RENDER="$DIR/renders"
OUT_CASES="$DIR/cases"
mkdir -p "$OUT_RENDER" "$OUT_CASES"

len=$(jq 'length' "$CASES")
for i in $(seq 0 $((len-1))); do
  id=$(jq -r ".[$i].id" "$CASES")
  code=$(jq -r ".[$i].code" "$CASES")
  printf '%s' "$code" > "$OUT_CASES/$id.mmd"
  for fmt in svg png; do
    body=$(jq -n --arg c "$code" --arg f "$fmt" '{code:$c, format:$f, timeout_ms:8000}')
    http_code=$(curl -sS -o "$OUT_RENDER/$id.$fmt" -w "%{http_code}" \
      -X POST "$API" -H "Content-Type: application/json" --data "$body")
    size=$(stat -c %s "$OUT_RENDER/$id.$fmt" 2>/dev/null || echo 0)
    printf "%-30s %s %s  http=%s  bytes=%s\n" "$id" "$fmt" "$(file -b --mime-type "$OUT_RENDER/$id.$fmt")" "$http_code" "$size"
  done
done
