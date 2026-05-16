# Phase 6 G-4: 切替後 5 分監視 実施記録

| 項目 | 値 |
|---|---|
| 実施日時 (UTC) | 2026-05-16T15:40:34Z 〜 2026-05-16T15:46:00Z |
| 対象サービス | `mermaid-render-api-test` (port 3101, Phase 6 改修版イメージ) |
| 実施前稼働時間 | 約 2 時間 (起動: 2026-05-16T13:30 頃) |
| 監視対象 | tasks.md L723 / `docs/phase6-deployment-runbook.md` §4.2 / `docs/perf/2026-05-16_compare.md` 末尾 4 監視ポイント |
| 結論 | ✅ **PASS** — 4 監視ポイントすべて異常なし |

## 1. 負荷プロファイル

| パラメータ | 値 |
|---|---|
| 投入リクエスト数 | 60 |
| 間隔 | 5 秒 |
| 計画所要時間 | 300 秒 |
| 実所要時間 | 326 秒 (curl 自体の応答時間込み) |
| シナリオ | simple flowchart 5 ノード (start → 処理 → 判定 → 完了 / 再試行) |
| 並列度 | 1 (直列) |
| HTTP 200 件数 | **60 / 60 (成功率 100%)** |
| HTTP 非 200 件数 | 0 |

走行スクリプト: `/tmp/phase6-5min/loop.sh` (※ 監視専用一時スクリプト、コミット対象外)

## 2. 4 監視ポイント判定

| # | 指標 | t=0 (baseline) | t=5min (after) | 差分 | 判定基準 | 判定 |
|---|---|---|---|---|---|---|
| 1 | `render_total{result="ok",format="svg"}` | 14 | 74 | **+60** (投入数と一致) | 増加していること | ✅ PASS |
| 2 | `render_timeout_total` | 0 (未出現) | 0 (未出現) | 0 | 急増なし | ✅ PASS |
| 3 | `browser_restarts_total{reason="max_age"}` | 1 | 1 | **0 (変化なし)** | 初期 +1〜2 のみ、以降増えない | ✅ PASS |
| 4 | `browser_pool_in_use` | 0 (idle) | 0 (idle) | — | < `POOL_QUEUE_MAX=20` (`BROWSER_POOL_SIZE=4`) | ✅ PASS |

補足:
- 指標 2 / 3 (timeout, restart) は Prometheus が値 0 のラベル組合せを出力しないため "未出現 = 0" と判定。
- 指標 4 は計測タイミングが各リクエスト終了直後のため idle (=0) で観測される。5 秒間隔・並列度 1 の負荷では同時実行数は常に 0 か 1 で、`POOL_QUEUE_MAX=20` に対して十分な余裕を確認。
- `render_duration_ms_count` も 14 → 74 (+60) で `render_total` と一致 (ヒストグラム漏れなし)。

## 3. 副次的観測

- 5 分間で **Chromium プロセス再起動なし** = Browser_Pool の max_age 期限切れ再生は発動せず (再起動間隔より十分短い時間幅)
- メモリリーク兆候の代理指標 (`browser_restarts_total` 増加なし、HTTP 成功率維持) ともに正常
- 実施前すでに 2 時間連続稼働済みで、累計 14 件の正常レンダリングを完了していた事実と矛盾なし

## 4. 結論

Phase 6 受入基準「**切替後 5 分監視で異常なし**」(tasks.md L723) を充足。**Phase 6 全 24 項目完了**。

本記録をもって `phase6-verification-2026-05-16.md` の残課題 R-1 をクローズする。

## 5. 関連ファイル

- `/tmp/phase6-5min/metrics_t0.txt` (※ コミット対象外、再現は本ドキュメント表で代替)
- `/tmp/phase6-5min/metrics_t1.txt` (同上)
- `docs/perf/2026-05-16_compare.md` (NFR-01 ゲート判定、5 分監視の前提)
- `docs/phase6-deployment-runbook.md` §4.2 (本監視の手順原典)
- `.kiro/specs/beautiful-svg-rendering/tasks.md` L723 (チェック対象項目)
