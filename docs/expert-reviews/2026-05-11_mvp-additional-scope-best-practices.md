# Mermaid API MVP 追加スコープ ベストプラクティス確認(専門家レビューまとめ)

- 作成日: 2026-05-11
- 対象: `beautiful-svg-rendering` 改修における **「MVP に追加すべき項目」** の判定とベストプラクティス
- 前回レビュー(`2026-05-10_mermaid-svg-rendering-best-practices.md`)で確定した方針に加え、spec drafting 中に出てきた追加検討項目 10 件 + 周辺リスクについて、3 名の専門家(O / A / G)から再度回答を取得した
- 質問書には現状の定量情報(レイテンシ約 1600ms、目標 ≤500ms、メモリ 1-2GB、QPS ピーク 10 req/s、バッチ 100 req 連投想定など)を含めて送付

---

## 0. このドキュメントの位置づけ

3 名の回答に対して、本リポジトリ内のコード・公式ドキュメント・GitHub Issue・npm registry で検証し、**信頼性 ≥97%** と判定した事実だけを §1〜§5 に集約する。意見が分かれた箇所は §6 で別扱い。要件定義書(`.kiro/specs/beautiful-svg-rendering/requirements.md`)§2「技術的制約」の追補根拠となる。

専門家ごとの主張差異・推奨値の違いは §5(推奨値レンジ)・§6(MVP 採否) にまとめる。

---

## 1. 依存バージョン管理の確実な事実

### 1.1 mermaid-cli の安定性プロファイル

確認: `@mermaid-js/mermaid-cli` README、npm registry、GitHub Releases、Mermaid 公式 blog

- **F-V-01**: `@mermaid-js/mermaid-cli` の Node.js API(`run()` / `renderMermaid()`)は README で **semver 対象外**と明示されている(前回 C-M-07 で既出)
- **F-V-02**: 過去 12 ヶ月で実際に観測された API ブレイク履歴(専門家 A 指摘、PR 番号/日付確認可能):
  - **v11.3.0 (2024-11-01)**: `renderMermaid` の戻り値 `data: Buffer → Uint8Array` への破壊的変更(PR #767)。`Buffer.from(result.data)` 前提のコードは破綻
  - **v11.3.0 (2024-11-01)**: `renderMermaid` 第 1 引数型を `Browser | BrowserContext` に拡張(PR #768、互換側拡張)
- **F-V-03**: Mermaid 本体 **v11.13.0 (2026-03-09)** でプレーンテキストラベルの自動 Markdown 解釈が v10 互換へ巻き戻し。**SVG 出力の見た目が変わる**種類の変更が minor リリースで発生し得る(API 形状は不変、ただし回帰テストの ground truth が変動)
- **F-V-04**: 2026-05 時点での最新は `@mermaid-js/mermaid-cli@11.14.0` および `mermaid@11.14.0`。caret `^11.12.0` のままだと minor/patch 自動受入で v11.13.0 系の挙動変更が **CI 通過時点で取り込まれる**
- **F-V-05**: `@mermaid-js/mermaid-cli` の peerDependencies は `puppeteer ^23`(あるいはそれより新しい)。Puppeteer 側のバージョンも同期管理が必要

→ **推奨運用**: `package.json` で exact pin(caret/tilde なし)、`package-lock.json` 必ずコミット、CI は `npm ci`、Renovate/Dependabot は **自動マージ禁止**、更新 PR で **画像差分 + property test + 性能ベンチ**を必須化。

### 1.2 mermaid-cli の代替アプローチ(参考情報)

- **F-V-06**(参考、MVP 採否は議論中): `mermaid` パッケージを直接 Puppeteer page に注入する事例が存在(`mermaid-isomorphic`、`mermaid-render` 等)。mermaid 本体は semver が機能している(mermaid-cli の Node.js API との差異)。`mermaid-cli` の独自ロジック・peerDependency 更新サイクルから切り離せるメリットあり

---

## 2. リソース管理アーキテクチャの確実な事実

### 2.1 RateLimiter と BrowserPool は概念上の別物

- **F-R-01**: **RateLimiter** = HTTP 層の「受付/即時拒否」(token bucket / leaky bucket、即時 **429** を返す)
- **F-R-02**: **BrowserPool** = OS 層リソース(Chromium プロセス・page インスタンス)の「在庫管理」(semaphore、acquire は wait 可、超過時 **503**)
- **F-R-03**: 両者を単一概念に統合(検討項目 #7 の案 a)すると、AI クライアントの 100 req 連投時に **全リクエストが queue に積まれ tail latency が破綻**(retry が機能不全)
- **F-R-04**: `Retry-After` ヘッダを 429 と 503 双方で返すと、AI クライアントの指数バックオフが事実上の標準として正しく機能する

→ **推奨構成**:

```
HTTP request → request_id → validation → RateLimiter (即時 429)
             → BrowserPool.acquire (queue, timeout 後 503) → render → release
```

### 2.2 Puppeteer / Chromium 運用上の制約

確認: Puppeteer 公式 troubleshooting、本番運用事例(複数のテックブログ・Issue)

- **F-P-01**: Puppeteer 公式は **`--no-sandbox` を strongly discouraged** と明記。本番では sandbox 維持または同等のコンテナ隔離(`seccomp`、`AppArmor`、`read-only filesystem`、Linux capability drop、egress 制限、`/tmp` サイズ制限)が必須
- **F-P-02**: Puppeteer の page インスタンスを長期間再利用するとメモリリークが発生(複数の本番事例で報告)。**page 単位の recycle policy(`maxUses`)** が必要
- **F-P-03**: Node.js を Docker PID 1 で実行すると、クラッシュした Chromium のゾンビプロセスが回収されない。Dockerfile に **init(`tini` / `dumb-init`)** または `docker run --init` が必須
- **F-P-04**: Mermaid コードを page に評価させる構成では **untrusted JS 評価相当のリスク**があるため、Puppeteer の **request interception で外部ネットワーク通信を遮断**すべき(`data:` / `about:` / `blob:` のみ allow、`http:` / `https:` / `file:` は abort)。SSRF 対策(クラウドメタデータエンドポイント等への到達防止)
- **F-P-05**: `headless: 'shell'`(chrome-headless-shell)が Mermaid 用途では軽量で十分。`--disable-dev-shm-usage`、`--disable-gpu`、`--disable-extensions` 等の最小化オプションが標準

### 2.3 入力 deep merge のセキュリティ

確認: Snyk Advisory、OWASP、CVE database

- **F-S-01**: ユーザー入力 JSON とサーバデフォルト設定の deep merge は **Prototype Pollution の典型的入口**
  - CVE-2019-10744: `lodash.defaultsDeep` で **CVSS 9.1** の脆弱性実績
  - CVE-2018-16487: `lodash.merge` でも同様の脆弱性
- **F-S-02**: 必須対策:
  - 禁止キー `__proto__` / `constructor` / `prototype` を再帰的に拒否
  - マージ対象の base は `Object.create(null)` で開始
  - `for...in` ではなく `Object.keys()` / `Object.entries()` を使用
  - `SERVER_LOCKED_SETTINGS` の最終強制適用は維持(現行設計どおり)
- **F-S-03**: Node.js 起動オプション `NODE_OPTIONS="--disable-proto=delete"` の併用が defense in depth として OWASP 推奨

---

## 3. 観測可能性の確実な事実

### 3.1 最低限の構造化ログ・メトリクス

- **F-O-01**: 性能改善が主目的の改修で、計測なしの本番投入は危険(中央値 ≤500ms 達成しても p95/p99/queue 詰まりが見えない)
- **F-O-02**: 必須メトリクス(Prometheus 命名規約準拠):
  - `render_total{result,format}` (counter)
  - `render_duration_ms` (histogram)
  - `queue_wait_ms` (histogram)
  - `browser_pool_in_use` (gauge)
  - `browser_pool_queue_size` (gauge)
  - `render_timeout_total` (counter)
  - `browser_restarts_total` (counter)
  - `validation_error_total{field}` (counter)
- **F-O-03**: 必須ログフィールド(構造化 JSON): `request_id` / `format` / `code_bytes` / `queue_ms` / `render_ms` / `post_process_ms` / `total_ms` / `pool_in_use` / `pool_waiting` / `result`
- **F-O-04**: `/healthz` は単純 200 ではなく、BrowserPool 健全性 + 直近エラー率を反映するのが望ましい。Liveness と Readiness を分けるなら `/livez` と `/readyz`

---

## 4. その他の確実な事実

### 4.1 SVG 後処理

- **F-X-01**: SVG の `id` / `url(#id)` / `href="#id"` / `xlink:href="#id"` / CSS 内 `url(#id)` の rewrite は **正規表現ではなく DOM/XML パーサ**で行うべき(属性順序・quote・namespace の揺れ、属性値内の `#` 色名誤爆を回避するため)
- **F-X-02**: `strip_max_width` の対象は **ルート `<svg>` の `style` 属性のみ**に限定すべき(子要素まで触ると Mermaid レイアウトを壊す)

### 4.2 Express body parser

- **F-X-03**: `express.json()` の `limit` デフォルトは **`'100kb'`**。本リポの 128kb 指定は明示的。`limit` 超過時は **HTTP 413**(構造化エラーになる前)で返るため、`MAX_CODE_SIZE` 上昇時の整合性確保のためにも導出式が望ましい
- **F-X-04**: `express.json({ strict: true })` を必ず付与(プリミティブ送付の拒否、JSON 仕様準拠)
- **F-X-05**: deeply nested object による JSON Bomb 対策として、パース後に **ネスト深度上限(例: 8)** をバリデータで弾くのが望ましい

### 4.3 Mermaid 設定の allowlist

- **F-X-06**: `mermaid_config` を「Mermaid 公式 schema 準拠なら何でも許可」にすると、将来の Mermaid 追加設定でリスクが増える。**ユーザー上書きを許すキーを allowlist 化**するのが堅い
- **F-X-07**: locked / reject 推奨キー: `securityLevel` / `maxTextSize` / `maxEdges` / `secure` / `startOnLoad`
- **F-X-08**: 許可候補(allowlist 上限): `theme` / `themeVariables` / `themeCSS` / `htmlLabels` / `flowchart` / `sequence` / `gantt` / `er` / `class` / `state` / `mindmap`

---

## 5. 推奨パラメータ値(専門家の合意レンジ)

| パラメータ | 専門家 O | 専門家 A | 専門家 G | 採用推奨 |
|---|---|---|---|---|
| `MAX_TIMEOUT_MS`(上限) | 15000-30000 | 30000 | 30000 | **30000**(default `8000` 維持) |
| `MIN_TIMEOUT_MS` | 1000 | 1000 | (記載なし) | **1000** |
| `BROWSER_POOL_SIZE` | 1-4(browser) | 3-5(page) | 3-5 | **3-4 page**(メモリ 1-2GB 想定) |
| Pool queue 上限 | 20-50 | 16 | (記載なし) | **16-20** |
| Pool queue wait timeout | 1000-3000ms | 10000ms | (記載なし) | **3000ms** |
| RateLimiter 同時受付上限 | (記載なし) | 10-15 | 10-15 | **10-15** |
| Body limit 余裕代 | 16KB | `code × 2 + 16KB` | 16KB | **`MAX_CODE_SIZE × 2 + 16KB` ≈ 116KB** |
| Page recycle(`maxUses`) | 50-100 | 100 | 100 | **100** |
| Browser recycle | 500-1000 / 30-60min | (記載なし) | (記載なし) | **1000 or 60 min** |
| themeCSS 上限 | 既存 4096 維持 | (記載なし) | (記載なし) | **4096**(現行維持) |

---

## 6. 意見が分かれた箇所(MVP 採否の議論点)

### 6.1 SVG 内部 ID 完全 rewrite(検討項目 #9)の MVP 採否

| 専門家 | 判定 | 根拠 |
|---|---|---|
| O | **別票** | SVG AST 処理は MVP 主目的外、root id rewrite で当面十分 |
| **A** | **MVP 必須に格上げ** | 配布 HTML 直接 embed 想定で「最初のバッチで顕在化する」確率が高い |
| G | **別票** | 単純な正規表現では SVG 構造を破壊するリスク、DOM パーサは性能低下 |

**判定**: 2:1 で **別票継続**。ただし専門家 A の懸念(複数 SVG embed の問題顕在化は時間問題)は記録し、将来別票で対応。MVP では root id 一意化のみ実施(現行 spec 通り)。

### 6.2 `mermaid` 直接利用への移行

- 3 名とも MVP 必須とはしていない
- O, A: **PoC として並行計測**することを推奨
- G: 中長期視野での負債回避策として提示

**判定**: MVP は mermaid-cli 経由のまま。代わりに **adapter 層で隔離 + CLI fallback flag** で破壊的変更を吸収する設計を採用(§7 参照)。

### 6.3 mermaid-cli の公開 API は `run()` か `renderMermaid()` か

- O: README 上の公開 API は `run()`、`renderMermaid()` は **内部寄り API**として README 上では確認できない
- A: `renderMermaid()` の breaking change 実例(v11.3.0 PR #767)を提示。つまり API として実在し、利用者もいる

**判定**: 両者矛盾しない。`renderMermaid()` は存在するが README 上の安定 API として保証されていない(C-M-07 に包含済)。実装時は **adapter で隔離**して破壊的変更を吸収可能にする。

### 6.4 `MAX_TIMEOUT_MS` の上限

- O: 15000ms 第一候補、社内重い図対応で 30000 まで拡張可
- A: 30000ms(mermaid-cli の Jest test suite が 60s timeout 採用、半分が現実的)
- G: 30000ms(Puppeteer のタイムアウト既定値)

**判定**: **30000ms を絶対上限**として採用。default は現行 `8000` を維持。

---

## 7. 防御的設計の推奨事項(MVP 必須レベル、複数専門家が異口同音)

現行 spec に **未反映**で、3 名のうち 2 名以上が MVP に含めるべきと判定した防御策:

| ID | 項目 | 提唱 |
|---|---|---|
| D-01 | `safeDeepMerge`(Prototype Pollution 対策) | O / A / G 全員 |
| D-02 | Puppeteer request interception で外部通信遮断 | O / A / G 全員 |
| D-03 | Page recycle policy(`maxUses`) | O / A / G 全員 |
| D-04 | Docker init(`tini` / `dumb-init`) | A / G(O は暗に前提) |
| D-05 | 構造化ログ + 最低限メトリクス | O / A 全員 |
| D-06 | renderMermaid adapter 層 + CLI fallback flag | O 強推奨(他は暗に前提) |
| D-07 | Graceful shutdown(SIGTERM で queue close + browser close) | O / A |
| D-08 | `mermaid_config` の allowlist 方式 | O / A |

---

## 8. 採用しない / 別票送りの推奨事項(根拠付き)

- **Web フォント同梱・サブセット化(検討項目 #10)**: 配布物肥大・ライセンス・CSP 検証コスト、MVP 主目的外 → **全員一致で別票**
- **`mermaid` 直接利用への全面移行**: PoC は推奨されたが MVP 必須ではない → **別票**(PoC は perf-check と同タイミングで実施可)
- **SVG 内部 ID 完全 rewrite(検討項目 #9)**: 2:1 で別票 → **別票**(将来の同一ページ複数 SVG embed 顕在化時に対応)

---

## 9. 参照ソース

### 公式ドキュメント

- mermaid-cli README (Node.js API semver 対象外): https://github.com/mermaid-js/mermaid-cli/blob/master/README.md
- mermaid-cli releases: https://github.com/mermaid-js/mermaid-cli/releases
- mermaid releases: https://github.com/mermaid-js/mermaid/releases
- Mermaid blog v11.13.0: https://mermaid.ai/blog/posts/mermaid-v11-13-0-two-new-diagram-types-and-our-most-polished-release-yet
- Mermaid config schema: https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/schemas/config.schema.yaml
- Puppeteer troubleshooting(sandbox): https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md
- Express body-parser: https://github.com/expressjs/body-parser

### CVE / セキュリティ Advisory

- Snyk CVE-2019-10744 (lodash.defaultsDeep prototype pollution): https://security.snyk.io/vuln/SNYK-JS-LODASH-450202
- Snyk CVE-2018-16487 (lodash.merge prototype pollution): https://security.snyk.io/vuln/SNYK-JS-LODASHMERGE-173732
- OWASP Prototype Pollution Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html
- MDN Object.prototype: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/proto

### 個別 PR / Issue

- mermaid-cli PR #767 (renderMermaid return type Buffer → Uint8Array): https://github.com/mermaid-js/mermaid-cli/pull/767
- mermaid-cli PR #768 (renderMermaid first arg type extension): https://github.com/mermaid-js/mermaid-cli/pull/768

### 設計・運用ノウハウ

- Jim Nielsen: Multiple inline SVGs ID 衝突: https://blog.jim-nielsen.com/2022/multiple-inline-svgs/
- npm rate-limiter-flexible: https://www.npmjs.com/package/rate-limiter-flexible
- npm generic-pool: https://www.npmjs.com/package/generic-pool
- Puppeteer メモリリーク本番運用記: https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367
- Puppeteer ゾンビプロセス本番運用記: https://medium.com/@TheTechDude/puppeteer-memory-leaks-crashes-and-zombie-processes-6-months-of-screenshots-in-production-b2ae7e65df3f
- Rate Limiter vs Semaphore 概念整理: https://medium.com/@sonishubham65/rate-limiter-vs-semaphore-similar-goals-very-different-problems-0466523f5da3

### 代替実装事例(参考)

- mermaid-render (mermaid 直接利用 + Puppeteer): https://github.com/Zemnmez/mermaid-render
- mermaid-isomorphic: https://github.com/remcohaszing/mermaid-isomorphic
