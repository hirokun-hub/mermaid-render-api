# Tasks: Beautiful SVG Rendering MVP

## 0. 概要

### 0.1 目的

`requirements.md` / `design.md` を MVP として実装するための作業手順。各タスクは設計書 §12 実装フェーズ(P-01〜P-15)を機能ブロック単位に束ねた **7 タスク(Phase 0〜Phase 6)** で構成する。

### 0.2 開発方針

本リポジトリの標準方針(memory `feedback_development_methodology.md`)を全タスクに適用する:

1. **TDD を必要十分に**: 回帰しやすいロジック / セキュリティ境界 / 並行制御は `[TDD]` タグ付き(先に失敗テスト → 最小実装 → refactor)。配線系は通常タスク。
2. **DRY 原則**: 重複ロジックの抽出、ただし過度な抽象化はしない。
3. **定数局所化**: マジックナンバー / 文字列は `src/config.ts` に集約。
4. **AI 駆動テスト中心**: 自動テストでカバー。visual judgment / バイト一致比較は強要しない(配布 HTML 最終確認の 1 回のみ目視を許容)。
5. **定量計測**: 性能改善は p50/p95/p99 を before/after で記録、印象論を排除。
6. **blue/green デプロイ**: prod(3100) 稼働下で test(3101) を並走検証してから差し替え。

### 0.3 タスク依存グラフ

```
       Phase 0 (基盤層)
       /  |  \
     Phase 1 Phase 2 Phase 3     ← 並行可能(Phase 0 完了後)
       \  |  /
        Phase 4 (統合)
         |
        Phase 5 (テスト集約)
         |
        Phase 6 (デプロイ + 性能計測)
```

### 0.4 凡例

- `- [ ]` チェックボックス: 単一の作業項目。
- `[TDD]` タグ: その項目は red → green → refactor 順で進める(先に失敗テストを書く)。
- `Validates:` 行: 当該タスクが要件定義書 / 設計書のどの ID を満たすか。
- `PROP:` 行: 当該タスクの受入基準で green になる正確性プロパティ(`design.md §5`)。
- `依存:` 行: 着手前に完了している必要がある先行タスク。

### 0.5 タスク全体像

| ID | タイトル | 含む P-* | 主な検証(PROP) | 依存 |
|---|---|---|---|---|
| **Phase 0** | 基盤層(定数 + ユーティリティ + アダプタ IF) | P-01, P-02, P-03 | 3, 8, 12, 14, 15 | — |
| **Phase 1** | レンダリング層(BrowserPool + Adapter 実装) | P-04 | 6, 7, 16 | Phase 0 |
| **Phase 2** | 入力 / エラー層(validator + errorResponse) | P-05, P-06 | 5, 9, 11, 13(part), 14, 15 | Phase 0 |
| **Phase 3** | 観測 / レート制御層(observability + rateLimiter) | P-07, P-08 | 13, 17 | Phase 0 |
| **Phase 4** | サーバ統合 + 依存更新 + Docker | P-09, P-10, P-11 | 1, 2, 4, 7, 10, 16 | Phase 1, Phase 2, Phase 3 |
| **Phase 5** | テスト集約(property 17 個 + integration) | P-12 | 1〜17 | Phase 4 |
| **Phase 6** | デプロイ + 性能計測(blue/green + NFR-01) | P-13, P-14, P-15 | NFR-01 達成判定 | Phase 5 |

---

## 1. Phase 0 基盤層

**Validates:** REQ-U-01, REQ-U-03, REQ-U-06, REQ-E-01, REQ-E-02, REQ-E-06, REQ-UN-01, REQ-UN-02, REQ-UN-03, REQ-UN-06, NFR-06, C-M-03, C-M-04, C-M-08, C-S-04, C-S-06
**PROP:** 3, 8, 12, 14, 15
**依存:** なし
**並行可能:** (起点タスク)

### A-1 `src/config.ts` 定数集約(P-01)

- [x] `BEAUTIFUL_DEFAULTS`(`useMaxWidth: false`、`htmlLabels: true`(REQ-UN-02 / C-M-03)、`themeCSS` 既定、`suppressErrorRendering: true`、`flowchart.diagramPadding: 0`、`flowchart.nodeSpacing`、`flowchart.rankSpacing`、`flowchart.curve`、`flowchart.wrappingWidth`、`flowchart.defaultRenderer: "dagre-wrapper"`(REQ-UN-03 / C-M-04))を定義
- [x] `SERVER_LOCKED_SETTINGS`(`securityLevel: "strict"`(REQ-U-06), `maxTextSize: 50000`, `maxEdges: 500`, `startOnLoad: false`)を定義(`secure` は将来の Mermaid v11 既定値追従リスクを避けるため `SERVER_LOCKED_SETTINGS` には含めず、`LOCKED_SETTING_KEYS` 経由で strip + warn して runtime の Mermaid v11 既定値を採用させる)
- [x] `CONTENT_TYPE_MAP` を `src/server/app.ts` ローカル定義から本ファイルへ移動(DRY 改善)
- [x] `DEFAULT_FORMAT = 'svg'` を `inputValidator.ts` ハードコードから本ファイルへ移動(DRY 改善)
- [x] `RATE_LIMIT_MAX_INFLIGHT = 15`、`POOL_QUEUE_MAX = 20`、`POOL_WAIT_TIMEOUT_MS = 3000`
- [x] `MIN_TIMEOUT_MS = 1000`、`MAX_TIMEOUT_MS = 30000`
- [x] `MAX_RENDERS_PER_CONTEXT = 100`、`MAX_RENDERS_PER_BROWSER = 1000`、`MAX_BROWSER_AGE_MS = 3600000`
- [x] `RESERVED_BODY_OVERHEAD_BYTES = 16384`、`BODY_LIMIT_BYTES = MAX_CODE_SIZE * 2 + RESERVED_BODY_OVERHEAD_BYTES`(派生定数)
- [x] `MAX_THEME_CSS_LENGTH`、`THEME_CSS_FORBIDDEN_PATTERNS`
- [x] `RENDERER_MODE`(`programmatic | cli`)環境変数解析
- [x] [TDD] 既存 `toPositiveInt()` の境界値(0 / 負数 / NaN / 文字列)テスト
- [x] [TDD] `BODY_LIMIT_BYTES` が `MAX_CODE_SIZE` 変更に追従するテスト

### A-2 `src/utils/safeDeepMerge.ts` 新規(P-02-1)

- [x] [TDD] 失敗テスト先行: `__proto__` / `constructor` / `prototype` キーが結果オブジェクトに含まれない(PROP-12)
- [x] [TDD] 失敗テスト先行: `Object.prototype.polluted` がリクエスト後も未定義
- [x] [TDD] 失敗テスト先行: ネストされた `{ a: { __proto__: { x: 1 } } }` 形の payload も再帰的に弾く
- [x] [TDD] 失敗テスト先行: `Mermaid_Config_Override` 経由(例 `{ mermaid_config: { __proto__: { polluted: true } } }`)で警告 `prototype_pollution_attempt` 記録(REQ-UN-06 第 1 対象)
- [x] [TDD] 失敗テスト先行: `Post_Process_Option` 経由(例 `{ post_process: { __proto__: { polluted: true } } }` および `{ post_process: { constructor: { prototype: { x: 1 } } } }`)で同様に検出・警告(REQ-UN-06 第 2 対象)
- [x] `FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])` 定義
- [x] `Object.create(null)` でプロトタイプチェーン排除、`Object.entries()` で iterate(`for...in` 禁止)
- [x] 検出時は `WarningCollector.add('prototype_pollution_attempt', { key })` で記録し、当該キーをスキップして処理継続
- [x] [TDD] deep merge 順序保証: `flowchart.diagramPadding` だけ override しても他 `flowchart.*` キーが消えない(PROP-8)

### A-3 `src/utils/extractMermaidError.ts` 新規(P-02-2)

- [x] [TDD] 失敗テスト先行: `"Parse error on line 3:"` 文字列から `{ errorType: 'parse_error', errorMessage, line: 3 }` を抽出
- [x] [TDD] 失敗テスト先行: 行番号が無いエラー(`"Error: ..."`)では `{ errorType: 'render_error', line: null }`
- [x] [TDD] 失敗テスト先行: 構文エラー入力の SVG ボディに `"Syntax error"` が含まれないことを検証(PROP-10 先行 RED)
- [x] [TDD] 失敗テスト先行: スタックトレース(`\n    at ...`)や後続 `Error:` 行が `errorMessage` に混入しないことを検証(design.md §6.2 の終端 lookahead)
- [x] 正規表現は design.md §6.2 と同一(`/Parse error on line\s+(\d+):\s*([\s\S]*?)(?=\n\s*at\s|\nError:|\n\n|$)/i` → `Lexical` 同形 → `/Error:\s*([\s\S]*?)(?=\n\s*at\s|$)/i` の順)、line/message を 1 回の match で同時 capture
- [x] 戻り値型に `errorType: 'parse_error' | 'render_error'` を含める(`Parse error` / `Lexical error` パターン match → `parse_error`、`Error:` のみ / 非 match → `render_error`)。design.md §6.1 のエラー種別マッピングを util 1 箇所に集約
- [x] C-M-06: `line` は参考値、UI 上は「N 行目付近」と表現する旨を JSDoc に記載

### A-4 `src/utils/warnings.ts` 新規(P-02-3)

- [x] `WarningCode` enum 定義: `unknown_key` / `locked_setting_override_ignored` / `prototype_pollution_attempt` / `svg_only_option_in_png` / `theme_css_rejected`
- [x] `WarningCollector` クラス: `add(code, detail)` / `drain(): Warning[]`
- [x] [TDD] `add` 累積 → `drain` 一括取得 → 再 `drain` で空配列

### A-5 `src/config.ts` `buildRequestMermaidConfig()` 関数(P-02-4)

- [x] [TDD] 失敗テスト先行: マージ優先順位 `BEAUTIFUL_DEFAULTS → user mermaid_config → SERVER_LOCKED_SETTINGS` の最終結果検証(PROP-3)
- [x] [TDD] 失敗テスト先行: `mermaid_config.securityLevel = "loose"` 指定でも最終 `securityLevel = "strict"`、警告 `locked_setting_override_ignored` 1 件記録(PROP-2 先行 RED、REQ-E-02)
- [x] [TDD] 失敗テスト先行: SERVER_LOCKED_SETTINGS キーを top-level / ネスト両方で上書き試行 → 警告 `locked_setting_override_ignored` + **当該キーが結果オブジェクトから除去されること**(PROP-15 後半)
- [x] [TDD] 失敗テスト先行: `secure` override は除去され、結果に `secure` が含まれない(runtime で Mermaid v11 既定値が残る)
- [x] 実装は 3 段階: ① `stripLockedSettingsAndWarn` で user override から locked key を再帰除去 + 警告 → ② `safeDeepMerge(BEAUTIFUL_DEFAULTS, stripped)` → ③ `safeDeepMerge(merged, SERVER_LOCKED_SETTINGS)` の最終強制適用

### A-6 `src/renderer/mermaidRendererAdapter.ts` 新規(P-03 interface のみ)

- [x] `MermaidRendererAdapter` interface: `render(input: RenderInput): Promise<RenderResult>` / `close(): Promise<void>`
- [x] `RenderInput` 型: `requestId`, `code`, `format`, `timeoutMs`, `mermaidConfig`, `postProcess?`, `svgId?`
- [x] `RenderResult` 型: `success`, `data?: Buffer`, `rawErrorText?`, `exitCode?`, `errorType?`, `errorMessage?`, `line?`, `errorField?`, `errorConstraint?`
- [x] 実装(Programmatic / CliFallback)は Phase 1 で行う、本タスクは interface + 型のみ

### Phase 0 受入基準

- [x] `vitest run test/unit/` で PROP-3, 8, 12, 14, 15 関連テスト全 green
- [x] `grep -nE "magic.*number|hardcoded" src/` で残存ゼロ(定数局所化)
- [x] `tsc --noEmit` で型エラーなし

### Phase 0 対象ファイル

| 種別 | パス |
|---|---|
| 変更 | `src/config.ts` |
| 新規 | `src/utils/safeDeepMerge.ts` |
| 新規 | `src/utils/extractMermaidError.ts` |
| 新規 | `src/utils/warnings.ts` |
| 新規 | `src/renderer/mermaidRendererAdapter.ts` |
| 新規 | `test/unit/safeDeepMerge.test.ts` |
| 新規 | `test/unit/extractMermaidError.test.ts` |
| 新規 | `test/unit/warnings.test.ts` |
| 新規 | `test/unit/buildRequestMermaidConfig.test.ts` |

---

## 2. Phase 1 レンダリング層

**Validates:** REQ-U-04, REQ-U-08, REQ-S-01, REQ-S-02, NFR-06, 親要件「要件 4(タイムアウト)」継承, C-M-08, C-M-10, C-P-01, C-P-02, C-P-04, C-S-05, C-S-06
**PROP:** 6, 7, 16
**依存:** Phase 0 完了
**並行可能:** Phase 2, Phase 3 と並行

### B-1 BrowserPool skeleton(P-04-1)

- [x] [TDD] 失敗テスト先行: `acquire()` 同時呼出が `POOL_QUEUE_MAX` を超えると `POOL_WAIT_TIMEOUT_MS` 後に reject(503 用 error_type=service_unavailable)
- [x] [TDD] 失敗テスト先行: `MAX_RENDERS_PER_CONTEXT` 回使用した context は次回 `acquire()` で recycle される(再生成)
- [x] [TDD] 失敗テスト先行: 100 連続リクエスト後、Puppeteer **browser プロセス数** が設計上の少数(1〜2、recycle 一時 +1)を超えない(PROP-6)
- [x] [TDD] 失敗テスト先行: Pool 初期化前に `acquire()` 呼出 → 503 / `error_type=service_unavailable`(PROP-7)
- [x] 内部 semaphore + waiting queue 実装
- [x] BrowserContext 単位の使用回数カウンタ

### B-2 セキュリティ強化(P-04-2)

- [x] page 作成直後に `page.setRequestInterception(true)` + ハンドラ: `http:` / `https:` / `file:` を block、`data:` / `about:` / `blob:` のみ allow。ただし `@mermaid-js/mermaid-cli` パッケージ配下 static asset の `file:` は canonical path 厳密一致で allow(C-S-05)
- [x] Puppeteer launch args: `headless: 'shell'`、`--disable-dev-shm-usage`、`--disable-gpu`、`--disable-extensions`(C-P-04)
- [x] `--no-sandbox` は付けない(C-P-01、Docker seccomp で隔離)
- [x] [TDD] 外部 URL fetch 試行を含む Mermaid コードが request interception で遮断されることを統合テストで検証

### B-3 ライフサイクル管理(P-04-3)

- [x] browser 全体の使用回数 `MAX_RENDERS_PER_BROWSER` 到達で browser 再起動
- [x] browser 起動からの経過時間 `MAX_BROWSER_AGE_MS` 到達で再起動
- [x] ヘルスチェック: page evaluate に失敗した context は除外して新規生成(REQ-S-02)
- [x] `close()`: queue close → 残処理 drain → browser close(graceful shutdown)
- [x] [TDD] `browser_restarts_total` メトリクスが recycle 時にインクリメント(D-1 と連動)

### B-4 ProgrammaticAdapter / CliFallbackAdapter(P-03 実装 + P-04-4)

- [x] `ProgrammaticAdapter implements MermaidRendererAdapter`:
  - [x] BrowserPool から context 取得 → `renderMermaid(context, code, format, options)` 呼出
  - [x] [TDD] 失敗テスト先行: v11.3.0 PR #767 で破壊変更された `Uint8Array` 戻り値を `Buffer.from(uint8array)` 正規化(C-M-08)
  - [x] エラー時は `extractMermaidError()` を通して `RenderResult.errorMessage` / `line` を設定
  - [x] `svgId` オプションを `renderMermaid` 経由で渡す(SVG ルート ID 一意化)
- [x] `CliFallbackAdapter implements MermaidRendererAdapter`:
  - [x] 既存 `MermaidRenderer.render()` の mmdc subprocess 経路をラップ
  - [x] `RENDERER_MODE=cli` で起動時に選択される経路として確立(NFR-06)
  - [x] `rewrite_ids: true` 時は CLI 出力 SVG のルート ID を `mermaid-<requestId>` に後処理で一意化
  - [x] [TDD] failing: `RENDERER_MODE=cli` で起動 → 単純 flowchart レンダリング成功、機能等価(PROP-16)

### B-5 render タイムアウト処理(親要件「要件 4」継承、C-S-06)

> **テスト方針メモ**: adapter / pool 単体テストは validator バイパスのため `timeoutMs` に `MIN_TIMEOUT_MS` 未満(例 100ms)を直渡しできる。HTTP 統合テストは validator 経由のため `timeout_ms ≥ MIN_TIMEOUT_MS(1000)` を遵守し、render 側を遅延スタブで模擬する。

- [x] [TDD] 失敗テスト先行(adapter 単体、`timeoutMs=100` 直渡し): `timeout_ms` 経過時点で `error_type=timeout` を返す
- [x] [TDD] 失敗テスト先行(adapter 単体): タイムアウト時に当該 BrowserContext を **破棄**(`context.close()`)、ハングした page をプールに戻さない(プール枯渇防止)
- [x] [TDD] 失敗テスト先行(adapter 単体): タイムアウト時に semaphore を解放し、後続リクエストがブロックされない
- [x] [TDD] 失敗テスト先行(adapter 単体): 連続タイムアウトでも `browser_pool_in_use` がリークせず元値に戻る
- [x] [TDD] 失敗テスト先行(HTTP 統合、`timeout_ms=1000` + 遅延スタブ): HTTP 504 が返る
- [x] 実装: `Promise.race([renderMermaid(...), timeoutPromise(timeout_ms)])` で競争、勝者判定後に敗者側の context を `discard()` ルートへ
- [x] `render_timeout_total` メトリクスをインクリメント(D-1 と連動)

### B-6 Post Process: `src/renderer/postProcess.ts` 新規

- [x] `rewrite_ids: true`(default)時、SVG ルート要素 `id` 属性を `mermaid-<requestId>` に一意化(Programmatic は `renderMermaid` の `svgId` 引数経由、CLI fallback は SVG 文字列のルート ID 後処理)
- [x] `rewrite_ids: false` 時は `svgId` を渡さず Mermaid 既定値で出力
- [x] [TDD] 失敗テスト先行: `strip_max_width: true` + format=svg 時、ルート `<svg>` の `style="max-width:300px; color:black;"` から `max-width` 宣言のみ case-insensitive で除去、他宣言保持
- [x] [TDD] 失敗テスト先行: `style` が `max-width` 単独 → `style` 属性ごと削除
- [x] [TDD] 失敗テスト先行: `<svg style="MAX-WIDTH:300PX">` のような大小文字混在も除去
- [x] [TDD] 失敗テスト先行: 子要素の `<g style="max-width:...">` には**触れない**(ルートのみ)
- [x] [TDD] 失敗テスト先行: `strip_max_width: false`(default)時は SVG 文字列に変更なし(no-op)
- [x] [TDD] 失敗テスト先行: `useMaxWidth: false`(BEAUTIFUL_DEFAULTS)+ `strip_max_width: true` 時、Mermaid が `max-width` を出力しないため最終的に no-op
- [x] `post_process_ms` を計測して構造化ログに出力(NFR-05)
- [x] `format=png` 時は SVG 加工をスキップ(警告は C-1 / E-2 側で発生済)

### Phase 1 受入基準

- [x] `vitest run test/integration/browserPool.test.ts` で PROP-6, 7 green
- [x] `RENDERER_MODE=cli npm start` で起動 → PROP-16 green(レイテンシ劣化は許容)
- [x] `MAX_RENDERS_PER_CONTEXT = 3` に下げた状態で 10 リクエストを送信、recycle が 3 回起きることをログで確認
- [x] graceful shutdown: SIGTERM 送信 → 進行中リクエスト完了 → プロセス終了(15 秒以内)
- [x] timeout テスト:
  - [x] **adapter 単体テスト**(validator バイパス、`timeoutMs=100` を直渡し)で `ProgrammaticAdapter.render` が `error_type=timeout` を返し、context 破棄 + semaphore 解放を確認
  - [x] **HTTP 統合テスト**(validator 経由、`MIN_TIMEOUT_MS=1000` 制約遵守)では `timeout_ms=1000` + 内部で人為的に重い render(`page.waitForTimeout(5000)` 等のスタブ)→ HTTP 504、`browser_pool_in_use` がリーク無く元値に戻る
- [x] postProcess unit test: `strip_max_width` の 6 ケース(true/false × 単独/複合/大小混在/子要素影響なし)green

### Phase 1 対象ファイル

| 種別 | パス |
|---|---|
| 新規 | `src/renderer/browserPool.ts` |
| 新規 | `src/renderer/programmaticAdapter.ts` |
| 新規 | `src/renderer/cliFallbackAdapter.ts` |
| 新規 | `src/renderer/postProcess.ts` |
| 大幅刷新 | `src/renderer/mermaidRenderer.ts`(adapter 委譲のみに縮減、または削除) |
| 新規 | `test/integration/browserPool.test.ts` |
| 新規 | `test/integration/programmaticAdapter.test.ts` |
| 新規 | `test/integration/renderTimeout.test.ts` |
| 新規 | `test/unit/bufferNormalization.test.ts` |
| 新規 | `test/unit/postProcess.test.ts` |

---

## 3. Phase 2 入力 / エラー層

**Validates:** REQ-U-04, REQ-U-05, REQ-E-03, REQ-E-04, REQ-E-05, REQ-E-06, REQ-E-07, REQ-S-03(HTTP 429 部分), REQ-UN-05, C-S-06
**PROP:** 5, 9, 11, 13(HTTP 429 部分), 14, 15
**依存:** Phase 0 完了
**並行可能:** Phase 1, Phase 3 と並行

### C-1 `inputValidator` 拡張(P-05)

- [x] [TDD] 失敗テスト先行: `mermaid_config` フィールド受理(plain object 以外は HTTP 400 / `error_type=invalid_request`)
- [x] [TDD] 失敗テスト先行: `post_process` フィールド受理(`{ rewrite_ids?: boolean, strip_max_width?: boolean }`、それ以外は警告 `unknown_key`)
- [x] [TDD] 失敗テスト先行(REQ-E-07): `post_process.rewrite_ids = "true"`(boolean 必須箇所に文字列) → HTTP 400 / `error_type=invalid_request` / `error_field="post_process.rewrite_ids"` / `error_constraint="type_mismatch"`
- [x] [TDD] 失敗テスト先行(REQ-E-07): `post_process.strip_max_width = 1`(boolean 必須箇所に数値) → HTTP 400 同様
- [x] [TDD] 失敗テスト先行(REQ-E-07): `mermaid_config.flowchart.diagramPadding = "16"`(number 必須箇所に文字列) → HTTP 400 同様
- [x] [TDD] 失敗テスト先行(REQ-E-07): `mermaid_config.htmlLabels = "true"`(boolean 必須箇所に文字列) → HTTP 400 同様
- [x] 型不正と未知キーの区別を明確化: allowlist 内既知キーの型不正は HTTP 400、allowlist 外の未知キーは警告 `unknown_key` のみ
- [x] [TDD] 失敗テスト先行: allowlist 方式 — 許可キー以外は削除 + 警告 `unknown_key`(PROP-15 前半)
- [x] [TDD] 失敗テスト先行: SERVER_LOCKED_SETTINGS のキー(`securityLevel` 等)を `mermaid_config` 内で指定 → 警告 `locked_setting_override_ignored`(PROP-15 後半)
- [x] [TDD] 失敗テスト先行: `timeout_ms` が `[MIN_TIMEOUT_MS, MAX_TIMEOUT_MS]` 範囲外 → HTTP 400 / `error_field="timeout_ms"` / `error_constraint="out_of_range"`(PROP-14, C-S-06)
- [x] [TDD] 失敗テスト先行: `themeCSS` が `MAX_THEME_CSS_LENGTH` 超 → HTTP 400(PROP-9)
- [x] [TDD] 失敗テスト先行: `themeCSS` に `THEME_CSS_FORBIDDEN_PATTERNS` のいずれかを含む → HTTP 400 + 警告 `theme_css_rejected`(PROP-11)
- [x] `WarningCollector` をリクエストごとに生成し、検証結果に同梱
- [x] `ValidateResultError` 型を踏襲(既存パターン継承)

### C-2 errorResponse 統一化(P-06)

- [x] `src/server/errorResponse.ts` 新規:
  - [x] [TDD] 失敗テスト先行: 4 フィールド統一組立 `{ error_message, line, error_field, error_constraint }`(parse_error / invalid_request / render_error / timeout / service_unavailable それぞれで)
  - [x] [TDD] 失敗テスト先行: HTTP 429 応答時に `Retry-After` ヘッダ付与(PROP-13 前半)
  - [x] [TDD] 失敗テスト先行: HTTP 503 応答時に `Retry-After` ヘッダ付与(PROP-13 後半は Phase 3 + Phase 4 で完成)
  - [x] [TDD] 失敗テスト先行: parse_error 時 `line` が `null` または正の整数(PROP-5)
- [x] `RenderErrorResponse` 型: `{ request_id, error_type, status_code, stderr, exit_code, format, error_message, line, error_field, error_constraint }`
- [x] `format=png` でも `error_type=parse_error` の場合は JSON 応答(SVG ボディに `"Syntax error"` を含めない)

### Phase 2 受入基準

- [x] `vitest run test/unit/inputValidator*.test.ts test/unit/errorResponse.test.ts` で PROP-5, 9, 11, 14, 15 green
- [x] PROP-13 のうち HTTP 429 経路が green(503 は Phase 3 / Phase 4 完了後に集約検証)
- [x] 既存 `test/inputValidator.test.ts` の互換テストが無修正で green(REQ-U-02 後方互換)

### Phase 2 対象ファイル

| 種別 | パス |
|---|---|
| 拡張 | `src/config.ts` |
| 拡張 | `src/renderer/mermaidRendererAdapter.ts` |
| 拡張 | `src/server/app.ts` |
| 拡張 | `src/validation/inputValidator.ts` |
| 新規 | `src/server/errorResponse.ts` |
| 新規 | `test/unit/inputValidator.mermaidConfig.test.ts` |
| 新規 | `test/unit/inputValidator.postProcess.test.ts` |
| 新規 | `test/unit/inputValidator.themeCSS.test.ts` |
| 新規 | `test/unit/errorResponse.test.ts` |
| 拡張 | `test/integration/rateLimitTimeout.test.ts` |
| 拡張 | `test/property/timeoutRateLimit.property.test.ts` |

---

## 4. Phase 3 観測 / レート制御層

**Validates:** REQ-S-03(Pool 層部分), REQ-UN-04, NFR-04, NFR-05
**PROP:** 13(Pool 層 503 部分), 17
**依存:** Phase 0 完了
**並行可能:** Phase 1, Phase 2 と並行

### D-1 observability 新規(P-07)

- [x] `src/server/observability.ts` 新規:
  - [x] pino logger インスタンス、構造化 JSON ログ
  - [x] 1 リクエスト 1 ログ行、フィールド: `request_id`, `format`, `code_bytes`, `queue_ms`, `render_ms`, `post_process_ms`, `total_ms`, `pool_in_use`, `pool_waiting`, `result`(`ok | parse_error | render_error | timeout | rate_limited | invalid_request | service_unavailable` — design.md §4.1 と一致、429 も 1 リクエスト 1 ログ行として出力)、`warnings: WarningCode[]`
  - [x] **Mermaid コード本体はログに残さない**(REQ-UN-04: 永続保存禁止)。`code_bytes` のサイズのみ記録、`code` 文字列は出力しない
  - [x] prom-client メトリクス 8 系統:
    - `render_total{result, format}` Counter
    - `render_duration_ms{format}` Histogram
    - `queue_wait_ms` Histogram
    - `browser_pool_in_use` Gauge
    - `browser_pool_queue_size` Gauge
    - `render_timeout_total` Counter
    - `browser_restarts_total{reason}` Counter(reason: `max_uses` | `max_age` | `crash` — design.md §4.1 と一致。`health_check` 起因の restart も `crash` ラベルに集約)
    - `validation_error_total{field, constraint}` Counter
- [x] `GET /metrics`: Prometheus text format
- [x] `GET /livez`: 常時 200(プロセス生存判定)
- [x] `GET /readyz`: 以下 2 条件すべて成立で 200、それ以外 503(requirements.md §5.2):
  - (a) BrowserPool が 1 BrowserContext 以上 acquire 可能(初期化完了 + 全停止していない)
  - (b) 直近 5 分のリクエストエラー率 < 50%(`render_total{result="ok"}` / `render_total` で算出、サンプル数閾値: ≥ 10 リクエスト未満なら (a) のみで判定)
- [x] エラー率算出のための 5 分スライディングウィンドウ集計を observability 層に追加
- [x] [TDD] 失敗テスト先行: BrowserPool 全停止状態 → `/readyz` 503
- [x] [TDD] 失敗テスト先行: 直近 5 分で 10 件中 6 件失敗(60%)→ `/readyz` 503
- [x] [TDD] 失敗テスト先行: 直近 5 分で 100 件中 99 件成功 + pool 健全 → `/readyz` 200
- [x] `GET /healthz`: liveness 等価で常時 200 を維持(後方互換)
- [x] [TDD] 失敗テスト先行: `/metrics` GET → Prometheus 形式 + 必須 8 メトリクス系統が全て出現(PROP-17)
- [x] 既存 `src/utils/logger.ts` は pino ラッパーへ差し替え(既存テスト互換維持)

### D-2 rateLimiter 拡張(P-08)

- [x] HTTP 層即時拒否: in-flight カウンタが `RATE_LIMIT_MAX_INFLIGHT` 超で即時 HTTP 429 + `Retry-After`(キューに入れずに reject)
- [x] BrowserPool 層との分離(Pool 層は `POOL_QUEUE_MAX` を超えたら 503 + `Retry-After`)
- [x] [TDD] 失敗テスト先行: HTTP 層が `RATE_LIMIT_MAX_INFLIGHT + 1` 番目のリクエストを即時 429、Pool 層は `POOL_QUEUE_MAX` 超で 503(PROP-13 完成)
- [x] [TDD] 失敗テスト先行: `Retry-After` ヘッダ値が秒単位の正の整数

### Phase 3 受入基準

- [x] `vitest run test/integration/observability.test.ts test/integration/rateLimit.test.ts` で PROP-13, 17 green
- [x] `/livez` は BrowserPool 初期化前後とも 200、`/readyz` は (a) 初期化前 503 / (b) 初期化後・健全 200 / (c) 直近 5 分エラー率 ≥ 50% で 503
- [x] `curl /metrics` 出力に 8 メトリクス系統が全て含まれる

### Phase 3 対象ファイル

| 種別 | パス |
|---|---|
| 新規 | `src/server/observability.ts` |
| 拡張 | `src/limiter/rateLimiter.ts` |
| 差し替え | `src/utils/logger.ts`(pino ラッパー化) |
| 新規 | `test/integration/observability.test.ts` |
| 新規 | `test/integration/rateLimit.test.ts` |

---

## 5. Phase 4 サーバ統合 / 依存更新 / Docker

**Validates:** REQ-U-02, REQ-U-07, REQ-U-08, REQ-S-01, NFR-02, NFR-03, NFR-06, C-M-07, C-M-10, C-P-03, C-S-04
**PROP:** 1, 2, 4, 7, 10, 16
**依存:** Phase 1, Phase 2, Phase 3 完了

### E-1 `src/server/server.ts` 起動 + graceful shutdown(P-09)

- [ ] 既存 `mermaid.config.json` 動的書出し処理を削除(`renderMermaid` 直渡しに置換)
- [ ] BrowserPool インスタンスを起動時に初期化
- [ ] 初期化完了前のリクエストは 503 / `error_type=service_unavailable` を返す(PROP-7)
- [ ] SIGTERM ハンドラ: `pool.close()` → server.close() → process.exit(0)
- [ ] `/healthz` はプロセス生存応答(常時 200、liveness 等価)
- [x] `/livez` / `/readyz` / `/metrics` ルートを D-1 から登録

### E-2 `src/server/app.ts` 配線

- [ ] `validateRenderRequest` 結果 → `RenderInput` 組立 → `MermaidRendererAdapter.render()` 委譲
- [ ] `CONTENT_TYPE_MAP` を `src/config.ts` から import(ローカル定義削除、DRY 改善)
- [ ] `DEFAULT_FORMAT` を `src/config.ts` から import
- [ ] エラー応答は `errorResponse.ts` の組立関数を呼ぶ(429 / 503 / 400 / 500 すべて)
- [ ] 既存 `{ code, format, timeout_ms }` のみのリクエストが HTTP 200 を返す(PROP-1)
- [ ] [TDD] 失敗テスト先行: `format=png` + `post_process.strip_max_width=true` → PNG 200 + 警告ログ `svg_only_option_in_png` 1 件(PROP-4)
- [ ] [TDD] 失敗テスト先行: 構文エラー入力で PNG 応答ボディに `"Syntax error"` が含まれない(PROP-10)

### E-3 `package.json` 依存(P-10)

- [ ] `@mermaid-js/mermaid-cli` を exact pin に変更(caret/tilde 削除、例: `"11.12.0"`)— NFR-02
- [x] `pino` を `dependencies` に追加(現在は推移依存のみ)
- [x] `prom-client` を `dependencies` に追加(現状未導入)
- [ ] `puppeteer` を明示 `dependencies` 化(C-M-10: `@mermaid-js/mermaid-cli` の peerDep `^23` と同期)
- [ ] `npm ci` で `package-lock.json` 同期、コミット
- [ ] `README.md` / 開発者ドキュメントに「依存更新は画像差分 + property test + perf check 必須」と明記

### E-4 `Dockerfile` セキュリティ(P-11)

- [ ] `tini` を `apt-get install` で追加し `ENTRYPOINT ["tini", "--"]` を設定(C-P-03 PID 1 ゾンビ回収)
- [ ] `ENV NODE_OPTIONS="--disable-proto=delete"` を実行ステージに追加(C-S-04 defense in depth)
- [ ] 既存 chromium / fonts-noto-cjk / X11 ライブラリは維持(動作確認済)
- [ ] `PUPPETEER_SKIP_DOWNLOAD=true` / `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` は維持

### Phase 4 受入基準

- [ ] `vitest run` で既存 integration test が全 green(後方互換)
- [ ] PROP-1, 2, 4, 7, 10, 16 が green
- [ ] `docker compose build` 成功 + `docker compose up -d` 起動後に `curl /livez` 200、`curl /readyz` 200
- [ ] `curl /healthz` は維持(既存クライアント互換)
- [ ] `npm ci` で lock 同期、`@mermaid-js/mermaid-cli` の `package.json` 表記が exact pin(caret/tilde 無し)

### Phase 4 対象ファイル

| 種別 | パス |
|---|---|
| 縮減 | `src/server/server.ts` |
| 拡張 | `src/server/app.ts` |
| 拡張 | `package.json` |
| 同期 | `package-lock.json` |
| 拡張 | `Dockerfile` |
| 新規 | `test/integration/serverLockedSettings.test.ts`(PROP-2) |

---

## 6. Phase 5 テスト集約

**Validates:** PROP-1〜17 全
**PROP:** 1〜17(集約と漏れ補完)
**依存:** Phase 4 完了

### F-1 property test 整理(P-12)

- [ ] `test/property/` 配下に PROP-1〜17 を 1 ファイル 1〜2 PROP で配置(命名: `prop-NN_<title>.property.test.ts`)
- [ ] 各テストの `describe` に `Validates: REQ-* / NFR-* / C-*` タグを記載
- [ ] `fast-check` Arbitrary を明示(`fc.record`, `fc.oneof`, `fc.constantFrom` 等)
- [ ] PROP-1〜17 を `grep "PROP-[0-9]\\+" test/` で全件カバーを確認

### F-2 integration test 拡張

- [ ] `test/integration/browserPool.test.ts`(Phase 1 で作成、PROP-6, 7)
- [ ] `test/integration/serverLockedSettings.test.ts`(Phase 4 で作成、PROP-2)
- [ ] `test/integration/render.test.ts` 既存に PROP-1, 4, 10 を追加
- [ ] `test/integration/observability.test.ts`(Phase 3 で作成、PROP-17)
- [ ] `test/integration/renderModeCli.test.ts`: `RENDERER_MODE=cli` でサーバ起動して既存 render 互換確認(PROP-16)

### F-3 unit test 補完

- [ ] `test/unit/safeDeepMerge.test.ts`(Phase 0、PROP-12)
- [ ] `test/unit/buildRequestMermaidConfig.test.ts`(Phase 0、PROP-3, 8)
- [ ] `test/unit/extractMermaidError.test.ts`(Phase 0、PROP-5)

### F-4 既存テストの互換確認

- [ ] `test/inputValidator.test.ts` / `test/logger.test.ts` / `test/requestId.test.ts` は最小修正(または無修正)で green
- [ ] `test/integration/rateLimitTimeout.test.ts` を新 `RATE_LIMIT_MAX_INFLIGHT` 前提に更新(PROP-13)
- [ ] テストヘルパー `test/helpers/server.ts` を新 BrowserPool 前提に更新(`startTestServer()` が pool 初期化を待つ)

### Phase 5 受入基準

- [ ] `npm test` で全 green(unit + integration + property)
- [ ] `grep -oE 'PROP-[0-9]+' test/ -r | sort -u | wc -l` が 17(全 PROP 検証コード存在)
- [ ] AI 駆動テスト方針遵守: バイト一致比較 / 目視 visual diff を使うテストは存在しない(配布 HTML 最終確認の Phase 6 ゲートのみ目視を許容)
- [ ] テスト実行時間が現状 +50% 以内(ベンチマーク的に許容範囲)

### Phase 5 対象ファイル

| 種別 | パス |
|---|---|
| 新規 | `test/property/prop-01_existing_request.property.test.ts` |
| 新規 | `test/property/prop-02_security_level_locked.property.test.ts` |
| 新規 | `test/property/prop-03_beautiful_defaults.property.test.ts` |
| 新規 | `test/property/prop-04_svg_only_in_png.property.test.ts` |
| 新規 | `test/property/prop-05_parse_error_line.property.test.ts` |
| 新規 | `test/property/prop-06_browser_pool_reuse.property.test.ts` |
| 新規 | `test/property/prop-07_pool_init_503.property.test.ts` |
| 新規 | `test/property/prop-08_deep_merge_preserves_keys.property.test.ts` |
| 新規 | `test/property/prop-09_theme_css_length.property.test.ts` |
| 新規 | `test/property/prop-10_no_syntax_error_in_svg.property.test.ts` |
| 新規 | `test/property/prop-11_theme_css_forbidden_pattern.property.test.ts` |
| 新規 | `test/property/prop-12_prototype_pollution.property.test.ts`(`mermaid_config` 経由と `post_process` 経由の両方の payload を fast-check で網羅) |
| 新規 | `test/property/prop-13_rate_limit_429_pool_503.property.test.ts` |
| 新規 | `test/property/prop-14_timeout_out_of_range.property.test.ts` |
| 新規 | `test/property/prop-15_unknown_key_and_locked.property.test.ts` |
| 新規 | `test/property/prop-16_renderer_mode_cli.property.test.ts` |
| 新規 | `test/property/prop-17_metrics_endpoint.property.test.ts` |
| 拡張 | `test/integration/render.test.ts` |
| 拡張 | `test/integration/rateLimitTimeout.test.ts` |
| 拡張 | `test/helpers/server.ts` |

---

## 7. Phase 6 デプロイ + 性能計測(blue/green)

**Validates:** NFR-01, NFR-03
**PROP:** —(性能達成判定)
**依存:** Phase 5 完了

### G-1 test profile 構築(P-13)

- [ ] `docker-compose.yml` に `profiles: ["test"]` でテストサービス追加(ホストポート 3101 → コンテナ 3000)
- [ ] `.env.test` 作成: `MERMAID_PADDING=0`、`RENDERER_MODE=programmatic`、その他改修側既定値
- [ ] prod(3100) は無停止で稼働継続、test(3101) を `docker compose --profile test up -d` で起動
- [ ] test サービスで `curl http://localhost:3101/livez` 200 確認

### G-2 性能計測スクリプト(P-14)

- [ ] `scripts/perf-check.ts` 新規:
  - [ ] CLI 引数: `--target=http://localhost:3100` / `--concurrency=100` / `--iterations=5` / `--label=before|after`
  - [ ] 単純 flowchart(ノード 5 個以下)と複雑 flowchart(ノード 20 個)の 2 シナリオを実行
  - [ ] p50, p95, p99 レイテンシ / 成功率 / Puppeteer プロセス数(`ps aux | grep chrome`) / メモリ RSS を計測
  - [ ] 結果を JSON で `docs/perf/YYYY-MM-DD_<label>.json` に保存
- [ ] `scripts/perf-compare.ts` 新規: before / after JSON を読んで差分 Markdown を `docs/perf/YYYY-MM-DD_compare.md` 出力

### G-3 NFR-01 達成判定

- [ ] before: prod(3100、現状 mmdc subprocess)で `perf-check.ts --label=before`
- [ ] after: test(3101、Programmatic API)で `perf-check.ts --label=after`
- [ ] **ゲート条件**: after の単純 flowchart 定常状態 p50 ≤ 500ms(NFR-01)
- [ ] 達成: G-4 へ進む
- [ ] 未達: Phase 1 / Phase 3 に戻して原因分析、再計測
- [ ] 結果を `docs/perf/2026-MM-DD_perf-check.md` にコミット(印象論排除の根拠保存)

### G-4 切替 + ロールバック(P-15)

- [ ] **切替手順**:
  1. `docker compose --profile test up -d` で test 起動 + ヘルスチェック通過確認
  2. perf-check.ts ゲート通過確認
  3. prod イメージタグを test と同タグに更新
  4. `docker compose up -d` でローリング再起動(コンテナ ID 入れ替え)
  5. `curl /livez` `/readyz` `/metrics` で疎通確認
- [ ] **5 分監視ポイント**:
  - `render_total{result="ok"}` カウンタ増加(リクエスト流入確認)
  - `render_timeout_total` 急増なし
  - `browser_restarts_total` 安定(初期 +1〜2 のみ、以降増えない)
  - `browser_pool_in_use` がピーク時も `POOL_QUEUE_MAX` 未満
- [ ] **ロールバック手順**:
  1. 直前 image tag を `docker-compose.yml` に戻す
  2. `docker compose up -d`
  3. `curl /livez` 200 確認
  4. 状態なし(stateless)を利用、データ復旧不要
- [ ] ロールバック手順を **1 度試走**(prod 影響なし、test サービスで試す)
- [ ] 配布 HTML embed の最終目視確認 1 回(memory: AI 駆動テスト中心方針の唯一の例外、本ゲートでのみ実施)

### Phase 6 受入基準

- [ ] G-3 ゲート通過(NFR-01 単純 flowchart p50 ≤ 500ms)
- [ ] 切替後 5 分監視で異常なし
- [ ] ロールバック試走成功
- [ ] `docs/perf/` に before / after / compare の 3 ファイルがコミットされている
- [ ] 配布 HTML embed 最終目視で clip / max-width 干渉 / 余白 3 課題が解消

### Phase 6 対象ファイル

| 種別 | パス |
|---|---|
| 拡張 | `docker-compose.yml` |
| 新規 | `.env.test` |
| 新規 | `scripts/perf-check.ts` |
| 新規 | `scripts/perf-compare.ts` |
| 新規 | `docs/perf/YYYY-MM-DD_before.json` |
| 新規 | `docs/perf/YYYY-MM-DD_after.json` |
| 新規 | `docs/perf/YYYY-MM-DD_compare.md` |

---

## 8. Out of Scope(将来別票)

- 複数 SVG 同一ページ embed 用の ID 全 rewrite(要件定義書 §8 参照)
- ELK レンダラのデフォルト化(C-M-04 既知不具合解消待ち)
- htmlLabels=false の v11.11+ 既知バグ追跡(Watch のみ、`BEAUTIFUL_DEFAULTS` で `htmlLabels: true` 固定)
- Mermaid バージョン更新(NFR-02 手順で別途実施)
- エラーメッセージ日本語化(MVP 後)

## 9. 検証(tasks.md 自身の整合性)

実装着手前に以下を機械的に確認する:

1. **REQ 網羅性**: `grep -oE 'REQ-[A-Z]+-[0-9]+' .kiro/specs/beautiful-svg-rendering/tasks.md | sort -u` の結果数が requirements.md の REQ-* 24 と一致
2. **NFR 網羅性**: `grep -c 'NFR-0[1-6]' .kiro/specs/beautiful-svg-rendering/tasks.md` で 6 系列全て出現
3. **PROP 網羅性**: `grep -oE 'PROP-[0-9]+' .kiro/specs/beautiful-svg-rendering/tasks.md | sort -u | wc -l` が 17
4. **C-* 網羅性**: 主要 C-S-* / C-P-* / C-M-* が tasks.md 内に出現(セキュリティ・運用前提として実装担保される)
5. **TDD タグ妥当性**: `[TDD]` 付き行が「複雑ロジック / セキュリティ / 並行制御」のみで、配線系には付いていないことを目視
6. **依存閉路なし**: Phase 0 → {Phase 1, Phase 2, Phase 3} → Phase 4 → Phase 5 → Phase 6 の DAG
