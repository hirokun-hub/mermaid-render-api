# Phase 4.5 Dependency Overrides 記録

本ドキュメントは `package.json` の `overrides` フィールドに追加した各エントリの advisory / 理由 / 解除条件 / 再評価期限を C-D-08 に従い記録する。

---

## 1. `@mermaid-js/mermaid-cli` バージョン更新

| 項目 | 内容 |
|---|---|
| 変更前 | `11.12.0` |
| 変更後 | `11.14.0` |
| 理由 | bundled mermaid を 11.12.x から 11.14.0 へ更新し、Mermaid / DOMPurify / lodash-es 系の advisory を解消する (C-D-09) |
| Puppeteer peerDep | `^23 \|\| ^24`（`puppeteer: 23.11.1` は互換範囲内） |
| 確認事項 | Programmatic API (`renderMermaid`) の import path / 戻り値 shape は既存テスト（`test/integration/programmaticAdapter.test.ts` など）で継続検証 |
| 解除条件 | 次回 security remediation 時に改めて評価 |

---

## 2. `overrides` エントリ

### 2.1 `basic-ftp: "6.0.1"`

| 項目 | 内容 |
|---|---|
| 対象 package | `basic-ftp` (transitive: `puppeteer → @puppeteer/browsers → proxy-agent → pac-proxy-agent → get-uri → basic-ftp`) |
| 修正 version | `6.0.1` |
| Advisory / CVE | GHSA-5rq4-664w-9x2c (Path Traversal), GHSA-6v7q-wjvx-w8wg (CRLF Injection), GHSA-rp42-5vxx-qpwr (DoS unbounded memory), GHSA-rpmf-866q-6p89 (DoS multiline buffer) |
| Severity | critical |
| 追加理由 | `puppeteer@23.x` が `@puppeteer/browsers` 経由で `basic-ftp@5.1.0` を引き込む。本番では `PUPPETEER_SKIP_DOWNLOAD=true` + Debian chromium のため `basic-ftp` の実行到達性は低いが、critical CVE を production tree に残すことは C-D-03 に反するため override で修正 |
| 想定影響範囲 | `@puppeteer/browsers` の HTTP 経由ブラウザダウンロード機能（本番では未使用） |
| 解除条件 | `puppeteer` または `@puppeteer/browsers` が `basic-ftp >= 5.2.0` を依存する版へ更新されたとき、本 override を削除して `npm ls basic-ftp` で確認 |
| 再評価期限 | 2026-11-13 |

### 2.2 `lodash: "4.18.1"`

| 項目 | 内容 |
|---|---|
| 対象 package | `lodash` (transitive: `@mermaid-js/mermaid-cli → @mermaid-js/mermaid-zenuml → @zenuml/core@3.45.2 → lodash@4.17.21`) |
| 修正 version | `4.18.1` |
| Advisory / CVE | GHSA-xxjr-mmjv-4gpg (Prototype Pollution via `_.unset`/`_.omit`), GHSA-r5fr-rjxr-66jc (Code Injection via template), GHSA-f23m-r3pf-42rh (Prototype Pollution array path bypass) |
| Severity | high |
| 追加理由 | `@zenuml/core` が `lodash@^4.17.21` を指定し `4.17.21` が解決される。`4.18.1` は同一 major/minor 内の修正版 |
| 想定影響範囲 | ZenUML ダイアグラムの内部ユーティリティ。`lodash` の `_.unset`/`_.omit`/`_.template` API を利用している箇所への影響はあるが、テスト・smoke で確認済み |
| 解除条件 | `@zenuml/core` または `@mermaid-js/mermaid-zenuml` が `lodash >= 4.18.0` を依存する版へ更新されたとき |
| 再評価期限 | 2026-11-13 |

### 2.3 `lodash-es: "4.18.1"`

| 項目 | 内容 |
|---|---|
| 対象 package | `lodash-es` (transitive: `mermaid@11.x → chevrotain → langium → @mermaid-js/parser`, `dagre-d3-es` など) |
| 修正 version | `4.18.1` |
| Advisory / CVE | GHSA-xxjr-mmjv-4gpg, GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh（lodash と同一） |
| Severity | high |
| 追加理由 | mermaid の parser / chevrotain 系が `lodash-es@^4.17.x` を引き込む。`4.18.1` で修正済み |
| 想定影響範囲 | Mermaid パーサのユーティリティ。ダイアグラム regression テストで確認済み |
| 解除条件 | `mermaid` または `@mermaid-js/parser` が `lodash-es >= 4.18.0` を依存する版へ更新されたとき |
| 再評価期限 | 2026-11-13 |

### 2.4 `path-to-regexp: "8.4.2"`

| 項目 | 内容 |
|---|---|
| 対象 package | `path-to-regexp` (transitive: `express@5.x → router@2.x → path-to-regexp@8.3.0`) |
| 修正 version | `8.4.2` |
| Advisory / CVE | GHSA-j3q9-mxjg-w52f (ReDoS via sequential optional groups), GHSA-27v5-c462-wpq7 (ReDoS via multiple wildcards) |
| Severity | high |
| 追加理由 | Express が `path-to-regexp@8.3.0` を引き込む。C-D-06 に従い production high advisory を排除 |
| 想定影響範囲 | Express のルート解析。本 API の固定ルート (`/render`, `/healthz`, `/livez`, `/readyz`, `/metrics`) では実リスクは低いが high 評価のため修正 |
| 解除条件 | `express` / `router` が `path-to-regexp >= 8.4.0` を依存する版へ更新されたとき |
| 再評価期限 | 2026-11-13 |

### 2.5 `anymatch/readdirp/micromatch > picomatch: "2.3.2"`

| 項目 | 内容 |
|---|---|
| 対象 package | `picomatch@2.3.1` (transitive: `tailwindcss → chokidar → anymatch/readdirp → picomatch`, `tailwindcss → micromatch → picomatch`) |
| 修正 version | `2.3.2`（`anymatch`, `readdirp`, `micromatch` 配下にスコープ） |
| Advisory / CVE | GHSA-3v7f-55p6-f55p (Method Injection in POSIX character classes), GHSA-c2c7-rcm5-vvqj (ReDoS via extglob quantifiers) |
| Severity | high |
| 追加理由 | `@mermaid-js/mermaid-zenuml → @zenuml/core → tailwindcss` 経由で `picomatch@2.3.1` が production tree に含まれる。`vitest` / `vite` が使用する `picomatch@4.x` との API 非互換を避けるためスコープ override を採用 |
| 想定影響範囲 | tailwindcss の chokidar による CSS ファイル watch 機能（サーバ動作中には使用されない） |
| 解除条件 | `chokidar` または `tailwindcss` が `picomatch >= 2.3.2` を依存する版へ更新されたとき |
| 再評価期限 | 2026-11-13 |

### 2.6 `tinyglobby/fdir > picomatch: "4.0.4"`

| 項目 | 内容 |
|---|---|
| 対象 package | `picomatch@4.0.3` (transitive: `tailwindcss → sucrase → tinyglobby → (fdir, picomatch)`) |
| 修正 version | `4.0.4`（`tinyglobby`, `fdir` 配下にスコープ） |
| Advisory / CVE | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj（2.x と同一 advisory） |
| Severity | high |
| 追加理由 | `sucrase → tinyglobby → picomatch@4.0.3` が production tree に含まれる。vitest の picomatch@4.x と同 major のため API 互換問題なし |
| 想定影響範囲 | sucrase の glob 処理（サーバ動作中には使用されない） |
| 解除条件 | `tinyglobby` が `picomatch >= 4.0.4` を依存する版へ更新されたとき |
| 再評価期限 | 2026-11-13 |

### 2.7 `dompurify: "3.4.2"`

| 項目 | 内容 |
|---|---|
| 対象 package | `dompurify` (transitive: `mermaid@11.x → dompurify@^3.3.1`) |
| 修正 version | `3.4.2` |
| Advisory / CVE | GHSA-v2wj-7wpq-c8vv (XSS), GHSA-cjmm-f4jc-qw8r (ADD_ATTR predicate URI bypass), GHSA-cj63-jhhr-wcxv (USE_PROFILES prototype pollution), GHSA-39q2-94rc-95cp (ADD_TAGS short-circuit bypass), GHSA-h7mw-gpvr-xq4m (FORBID_TAGS asymmetry), GHSA-crv5-9vww-q3g8 (SAFE_FOR_TEMPLATES bypass), GHSA-v9jr-rg53-9pgp (Prototype Pollution XSS via CUSTOM_ELEMENT_HANDLING), GHSA-h8r8-wccr-v5f2 (mutation-XSS re-contextualization). CVE-2026-41238 は `>=3.4.0` で修正 |
| Severity | moderate (npm 表示) / **C-D-04 により高優先度** |
| 追加理由 | 本 API は untrusted Mermaid 入力を Chromium で SVG に変換し返却 SVG が inline embed される。DOMPurify の XSS advisory は moderate でも C-D-04 / REQ-D-03 に従い高優先度として扱い修正 |
| 想定影響範囲 | Mermaid の SVG サニタイザ。`dompurify@^3.3.1` 内で動作し `3.4.2` は semver 互換。diagram regression テストで確認済み |
| 解除条件 | `mermaid` が `dompurify >= 3.4.0` を依存する版へ更新されたとき |
| 再評価期限 | 2026-11-13 |

---

## 3. 残存 moderate / low advisory (risk acceptance)

以下は `npm audit --omit=dev --audit-level=high` を pass した後も残存する moderate / low advisory。C-D-03 に従い exploit 経路・到達性・緩和策・解除条件・再評価期限を記録する。

### 3.1 `postcss < 8.5.10` — Severity: moderate

| 項目 | 内容 |
|---|---|
| Advisory | GHSA-qx2v-qp2m-jg93 (PostCSS XSS via unescaped `</style>` in CSS stringify output) |
| 到達経路 | `mermaid → postcss` (CSS 変換時の文字列化) |
| 実行到達性 | Mermaid の CSS 処理内で使用。レスポンス SVG に PostCSS で生成されたスタイル文字列が含まれる可能性あり。ただし securityLevel=strict + DOMPurify の二重防御下 |
| 暫定緩和策 | securityLevel=strict + DOMPurify (3.4.2 に override 済み) による多層防御 |
| 解除条件 | `mermaid` が `postcss >= 8.5.10` を依存する版へ更新されたとき |
| owner | hirokun-hub |
| 再評価期限 | 2026-11-13 |

### 3.2 `ip-address <= 10.1.0` — Severity: moderate

| 項目 | 内容 |
|---|---|
| Advisory | GHSA-v2v4-37r5-5v8g (XSS in Address6 HTML-emitting methods) |
| 到達経路 | `puppeteer → @puppeteer/browsers → proxy-agent → socks-proxy-agent → socks → ip-address` |
| 実行到達性 | Puppeteer のプロキシ経由ブラウザダウンロード時に Address6 HTML メソッドが呼ばれる可能性。本番では `PUPPETEER_SKIP_DOWNLOAD=true` のため到達性は極めて低い |
| 暫定緩和策 | PUPPETEER_SKIP_DOWNLOAD=true + Debian chromium |
| 解除条件 | `puppeteer` / `socks` が `ip-address >= 10.2.0` を依存する版へ更新されたとき |
| owner | hirokun-hub |
| 再評価期限 | 2026-11-13 |

### 3.3 `uuid 11.0.0 - 11.1.0` — Severity: moderate

| 項目 | 内容 |
|---|---|
| Advisory | GHSA-w5hq-g745-h8pq (Missing buffer bounds check in v3/v5/v6 when buf is provided) |
| 到達経路 | `mermaid → uuid@11.1.0` |
| 実行到達性 | Mermaid の内部 ID 生成で使用。`buf` 引数を外部入力から渡す経路はなく、境界チェック欠如の悪用は困難 |
| 暫定緩和策 | buf 引数を外部から直接渡す API は露出していない |
| 解除条件 | `mermaid` が `uuid >= 11.1.1` を依存する版へ更新されたとき |
| owner | hirokun-hub |
| 再評価期限 | 2026-11-13 |

### 3.4 `qs 6.7.0 - 6.14.1` — Severity: low

| 項目 | 内容 |
|---|---|
| Advisory | GHSA-w7fw-mjwx-w883 (arrayLimit bypass in comma parsing allows DoS) |
| 到達経路 | `express → body-parser → qs@6.14.1` |
| 実行到達性 | 本 API は `express.json()` のみ使用し `express.urlencoded()` を使用しない。qs の comma 解析が呼ばれる経路はない |
| 暫定緩和策 | `express.json()` のみ使用。urlencoded / querystring の qs 処理は未使用 |
| 解除条件 | `express` / `body-parser` が `qs >= 6.15.0` を依存する版へ更新されたとき |
| owner | hirokun-hub |
| 再評価期限 | 2026-11-13 |
