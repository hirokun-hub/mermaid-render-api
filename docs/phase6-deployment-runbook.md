# Phase 6 デプロイ Runbook (blue/green 切替)

**対象**: `beautiful-svg-rendering` Phase 0〜5 完了後の本番切替作業
**前提**: `npm test` 全 green / Phase 4.5 audit gate pass / Phase 4.6 / 5 完了
**根拠**: `.kiro/specs/beautiful-svg-rendering/{requirements.md,design.md,tasks.md}` Phase 6 (G-1〜G-4) / NFR-01, NFR-03
**初版**: 2026-05-16

---

## 0. 用語

- **prod (3100)**: 既存本番サービス。`docker-compose.yml` の `mermaid-render-api`。
- **test (3101)**: 改修版検証サービス。`docker-compose.yml` の `mermaid-render-api-test`、`profiles: ["test"]`。
- **blue/green**: prod を稼働させたまま test を並走検証してから差し替える方式。本リポジトリはステートレスのため DB マイグレーション等は不要。

---

## 1. 事前準備 (切替の前日まで)

| # | 作業 | コマンド / ファイル | 完了条件 |
|---|---|---|---|
| 1.1 | テスト全 green | `npm test` | exit 0、PROP-1〜18 全 green |
| 1.2 | TypeScript 型検査 | `npm run build` | exit 0 |
| 1.3 | audit pass | `npm audit --omit=dev --audit-level=high` | exit 0 (Phase 4.5 ゲート) |
| 1.4 | Docker build | `docker compose --profile test build mermaid-render-api-test` | エラーなし |
| 1.5 | prod イメージタグ保存 | `docker image tag mermaid-render-api-mermaid-render-api:latest mermaid-render-api-mermaid-render-api:rollback-$(date +%Y%m%d)` | rollback 候補 image が `docker image ls` で確認できる |

---

## 2. test サービス起動と疎通 (G-1.3)

```bash
# 本番 = Windows Docker Desktop 想定。dev-sysadmin overlay を dev/prod 共通で必須適用
# (requirements.md C-P-09 2026-05-17 運用注記、design.md §8.1)
docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml \
  --profile test up -d mermaid-render-api-test
```

ヘルスチェック (全 200 を確認):

```bash
curl -s -o /dev/null -w "/livez=%{http_code}\n" http://localhost:3101/livez
curl -s -o /dev/null -w "/healthz=%{http_code}\n" http://localhost:3101/healthz
curl -s -o /dev/null -w "/readyz=%{http_code}\n" http://localhost:3101/readyz
curl -s -o /dev/null -w "/metrics=%{http_code}\n" http://localhost:3101/metrics
```

期待値: `200 / 200 / 200 / 200`。`/readyz` が 503 のときは BrowserPool 初期化未了または直近 5 分エラー率 ≥ 50%。`docker logs mermaid-render-api-mermaid-render-api-test-1 --tail=50` でエラー詳細を確認。

---

## 3. 性能ゲート (G-3, NFR-01)

### 3.1 before 計測 (現行 prod, 3100)

```bash
npm run perf:check -- \
  --target=http://localhost:3100 \
  --concurrency=1 --iterations=20 \
  --label=before_steady
```

結果は `docs/perf/YYYY-MM-DD_before_steady.json` に保存される。

### 3.2 after 計測 (改修版 test, 3101)

```bash
npm run perf:check -- \
  --target=http://localhost:3101 \
  --concurrency=1 --iterations=20 \
  --label=after_steady
```

### 3.3 比較レポート生成

```bash
npm run perf:compare -- \
  --before=docs/perf/YYYY-MM-DD_before_steady.json \
  --after=docs/perf/YYYY-MM-DD_after_steady.json \
  --out-name=YYYY-MM-DD_compare.md
```

### 3.4 ゲート判定

- **PASS 条件**: `after` の単純 flowchart **p50 ≤ 500ms** (NFR-01)
- **FAIL 時**: Phase 1 (Browser_Pool / Adapter) または Phase 3 (rateLimiter / observability) に戻して原因分析、本 runbook §4 へは進まない
- レポート末尾のゲート結論行を git commit に含め、印象論を排除する根拠とする (memory: 定量計測方針)

---

## 4. 切替手順 (G-4)

### 4.1 切替実行 (5 ステップ)

```bash
# 1. 改修版 (3101) が正常応答することを再確認
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3101/livez   # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3101/readyz  # 200

# 2. perf-check のゲート通過再確認 (compare.md の判定行)
grep "ゲート結論" docs/perf/YYYY-MM-DD_compare.md

# 3. 本番 (3100) のイメージタグを改修版と同じタグに書き換える
#    docker compose build mermaid-render-api でも同等
docker compose build mermaid-render-api

# 4. ローリング再起動 (コンテナ ID 入れ替え)
docker compose up -d mermaid-render-api

# 5. 疎通確認
curl -s -o /dev/null -w "/livez=%{http_code}\n"   http://localhost:3100/livez    # 200
curl -s -o /dev/null -w "/readyz=%{http_code}\n"  http://localhost:3100/readyz   # 200
curl -s -o /dev/null -w "/metrics=%{http_code}\n" http://localhost:3100/metrics  # 200
curl -s -X POST http://localhost:3100/render \
  -H 'content-type: application/json' \
  -d '{"code":"flowchart TD\n  A-->B","format":"svg","timeout_ms":5000}' \
  -o /tmp/swap-smoke.svg \
  -w "/render=%{http_code} size=%{size_download} time=%{time_total}s\n"  # 200 / time < 1s
```

### 4.2 切替後 5 分監視

```bash
# 1 分おきに 5 回実行して推移を見る
for i in 1 2 3 4 5; do
  echo "=== minute $i ==="
  curl -s http://localhost:3100/metrics | grep -E '^(render_total|render_timeout_total|browser_restarts_total|browser_pool_in_use|browser_pool_queue_size)'
  sleep 60
done
```

| 監視対象 | 期待挙動 | アラート閾値 |
|---|---|---|
| `render_total{result="ok"}` | 単調増加 (リクエスト流入確認) | 流入があるのに増えない場合は要調査 |
| `render_timeout_total` | 急増なし | 1 分あたり +5 件以上は要調査 |
| `browser_restarts_total{reason="*"}` | 初期 +1〜2 のみ、以降は緩やか | 1 分あたり複数回 +1 なら要調査 |
| `browser_pool_in_use` | ピーク時も `POOL_QUEUE_MAX (20)` 未満 | `POOL_QUEUE_MAX` に張り付くなら要調査 |
| `browser_pool_queue_size` | 平常時 0、バースト時に一時的に上昇 | ≥ 10 が継続するなら要調査 |

異常検知時は §5 ロールバックへ進む。

---

## 5. ロールバック手順

### 5.1 ロールバック実行

```bash
# 1. docker-compose.yml の mermaid-render-api サービスを編集:
#    build: 行をコメントアウトし、代わりに
#      image: mermaid-render-api-mermaid-render-api:rollback-YYYYMMDD
#    を追記 (§1.5 で `docker image tag ... :rollback-YYYYMMDD` として
#    保存した旧 image tag を指定する)。
$EDITOR docker-compose.yml

# 2. 旧 image で再生成 (ローリング再起動)
docker compose stop mermaid-render-api
docker compose up -d --no-build mermaid-render-api

# 3. 疎通確認
curl -s -o /dev/null -w "/livez=%{http_code}\n" http://localhost:3100/livez
curl -s -o /dev/null -w "/readyz=%{http_code}\n" http://localhost:3100/readyz
curl -s -X POST http://localhost:3100/render \
  -H 'content-type: application/json' \
  -d '{"code":"flowchart TD\n  A-->B","format":"svg","timeout_ms":5000}' \
  -o /tmp/rollback-smoke.svg \
  -w "/render=%{http_code} size=%{size_download}\n"

# 4. 状態なし (stateless) を利用、データ復旧不要
```

> **手順検証ステータス**: 上記 step 2 の `stop` → `up -d` フローは 2026-05-16 のロールバック試走 (G-4.2) で実走済 (test サービスで `livez` 200、`readyz` 200、`render` 200 = 15500 bytes を確認、復旧時間 9 秒)。step 1 の `image:` 行書き換えは本番切替時に初実走となるため、切替前に dry-run 用の copy で確認することを推奨。

### 5.2 試走 (G-4.2、本番影響なし)

test サービス (3101) で同じ手順を試走する (本番影響ゼロ):

```bash
# test を停止
docker compose --profile test stop mermaid-render-api-test
# 再起動 (= 切戻し相当の動作確認)
docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml \
  --profile test up -d mermaid-render-api-test
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3101/livez  # 200
```

---

## 6. 配布 HTML embed 最終目視確認 (G-4.3)

AI 駆動テスト方針 (memory: `feedback_development_methodology.md`) の**唯一の目視例外**。本ゲートでのみ実施。

```bash
# 1. Case 10 相当 (CJK + 半角混在ラベル) の SVG を取得
curl -s -X POST http://localhost:3100/render \
  -H 'content-type: application/json' \
  -d '{"code":"flowchart TD\n  A[\"集める ✓<br>(PrimeDrive 自動)\"] --> B[\"整理する<br>(手動 + ✓)\"]","format":"svg","timeout_ms":5000}' \
  -o /tmp/case10_swap.svg

# 2. <img> モード描画用の HTML を生成
cat > /tmp/case10_img.html <<EOF
<!doctype html>
<html><head><meta charset="utf-8"><title>case10</title></head>
<body><img src="case10_swap.svg" alt="case10" style="border:1px solid #ccc"></body></html>
EOF
cp /tmp/case10_swap.svg /tmp/case10_swap.svg

# 3. playwright-cli で <img> モード描画スクリーンショット (CLAUDE.md 共通設定遵守)
playwright-cli -s=phase6-swap --headed --config ~/.playwright/cli.config.json \
  open file:///tmp/case10_img.html
playwright-cli -s=phase6-swap screenshot /tmp/case10_img_mode.png
# Node A「集める ✓(PrimeDrive 自動)」・Node B「整理する(手動 + ✓)」の両テキストが
# 完全表示されている (クリップなし) ことを目視確認
```

確認項目:

- [ ] テキストが `<foreignObject>` 境界でクリップされない (REQ-U-09 効果)
- [ ] SVG ルートの `style="max-width:..."` が無く配布 HTML の responsive CSS と干渉しない (US-04)
- [ ] ノード内側余白が圧縮されている (US-03)

---

## 7. 完了条件

- [x] §2 test サービスの全ヘルスチェック 200
- [x] §3 NFR-01 ゲート PASS、`docs/perf/YYYY-MM-DD_compare.md` が commit 済
- [ ] §4.1 切替後 prod (3100) の全ヘルスチェック 200 + render smoke 成功
- [ ] §4.2 5 分監視で異常なし
- [ ] §5.2 ロールバック試走成功
- [ ] §6 配布 HTML embed 目視で clip / max-width 干渉 / 余白 3 課題が解消

§7 末尾の §4.1 以降は本番切替を実施する日に埋める。本 runbook は MVP 受入として §2 / §3 / §5.2 (試走) を最低限完了させる。
