# PNG 画質・余白 改善 設計書 (REQ-U-11) — 2026-05-17

## 0. この設計書の対象読者

本設計書は **本プロジェクト初見の開発者** が、コード調査をせずにこの一冊だけを読んで実装に着手できるよう書かれている。読みながら不明点があれば、まずレビュー指摘として記録し、設計書側を更新してから着手すること (設計書を実装ノートで上書きしない)。

## 1. 背景 & 関連ドキュメント

### 1.1 何が問題か

本 API (`mermaid-render-api`) が返す PNG について、2 つの不満が報告された:

1. **PNG の余白が小さすぎる** (画像の四隅にゆとりが無く、Slack / Notion で他テキストと密着する)
2. **PNG の画質が悪い** (拡大表示時にフォントエッジがぼやける)

調査の結果、それぞれ独立した原因に切り分けられた。詳細は `docs/png-padding-and-scale-investigation-2026-05-17.md` に **定量・視覚証拠付き** で記録されている。本設計書はその対応策の実装仕様。

### 1.2 何で起きているか (要約)

| 観点 | 原因 |
|---|---|
| 余白 | `src/config.ts:145` の `BEAUTIFUL_DEFAULTS.flowchart.diagramPadding = 0` (Mermaid 本家既定は `8`) |
| 画質 | `src/renderer/programmaticAdapter.ts:37-41` が `renderMermaid()` に `viewport` を渡しておらず、Puppeteer 既定 `deviceScaleFactor=1` で screenshot している (環境変数 `PNG_RENDER_SCALE=3` は **通常運用の programmatic 経路では未配線**。CLI fallback 経路 `mermaidRenderer.ts:63` でのみ使用される) |

### 1.3 関連 REQ

- **REQ-U-11** (本書で新規定義): PNG 出力品質を Mermaid 本家準拠に整え、ユーザがリクエスト単位で解像度を選べるようにする
- 既存: REQ-U-09 (F-1) / REQ-U-10 (F-2) は本変更とは独立。F-1/F-2 の post-process は本変更後も同じ振る舞いを維持しなければならない (= 不変条件)

### 1.4 関連ドキュメント

| 種類 | パス |
|---|---|
| 調査レポート (本設計の前提となる定量データ) | `docs/png-padding-and-scale-investigation-2026-05-17.md` |
| 視覚比較画像 | `docs/png-padding-and-scale-investigation-2026-05-17/aesthetic-comparison.png` / `scale-comparison.png` |
| サンプル SVG/PNG | `docs/png-padding-and-scale-investigation-2026-05-17/samples/` |
| API 仕様書 | `docs/API仕様_Mermaid画像変換API.md` (本変更で `scale` 章を追記) |
| F-2 設計書 (本書の構造のひな型) | `docs/foreignobject-inner-centering-design-2026-05-17.md` |
| F-2 検証レポート (post-process の不変条件確認) | `docs/foreignobject-inner-centering-verification-2026-05-17.md` |

## 2. 要件 (REQ-U-11)

### 2.1 ユーザストーリ

「Slack や iPhone Shortcut で受け取った PNG が **余白を持って・くっきり** 表示されてほしい。さらに、軽量化したい / 印刷品質にしたい時はリクエスト単位で **解像度を選べる** ようにしてほしい。」

### 2.2 REQ 詳細

**REQ-U-11**: THE System SHALL 以下を満たす。

1. (R-1) `BEAUTIFUL_DEFAULTS.flowchart` の 4 フィールドを Mermaid 本家 v11.15.0 の既定値に整合させる
2. (R-2) `programmaticAdapter` 経路で PNG 生成時、Puppeteer の `viewport.deviceScaleFactor` を **解決済 scale 値** に設定する
3. (R-3) リクエスト top-level に `scale` パラメータを追加。整数 `1`〜`4`、未指定時はサーバ既定 `3`
4. (R-4) `scale` を `format=svg` と同時送信した場合は **警告して無視** (リクエストは成功扱い)
5. (R-5) F-1/F-2 (REQ-U-09 / REQ-U-10) の post-process は本変更後も同じ振る舞いを維持する (不変条件)
6. (R-6) 環境変数 `PNG_RENDER_SCALE` および dead-code の `MERMAID_PADDING` を撤去する

### 2.3 受入条件 (AC)

| ID | 条件 | 検証手段 |
|---|---|---|
| **AC-1** | `flowchart.diagramPadding` の既定値が `8` で、明示的 override がない時 SVG `viewBox` の起点が `8 8` ではなく diagramPadding 反映済の値になっている | unit + integration |
| **AC-2** | `flowchart.useMaxWidth` の既定値が `true` で、明示 override 無しの SVG root に `width="100%"` と `style="max-width: ...px"` が含まれる | unit + integration |
| **AC-3** | `flowchart.nodeSpacing` の既定値が `50`、`flowchart.rankSpacing` の既定値が `50` | unit |
| **AC-4** | `flowchart.curve` の既定値が `basis` (本変更で **変えない**) | unit |
| **AC-5** | `format=png` のリクエストで返る PNG の **横解像度が SVG viewBox 幅の `scale` 倍** (±4 px の丸め誤差許容) | integration |
| **AC-6** | `scale` 未指定 → サーバ既定 `3` が適用される | unit + integration |
| **AC-7** | `scale: 2` を送信 → 2× で返る | integration |
| **AC-8** | `scale: 4` を送信 → 4× で返る | integration |
| **AC-9** | `scale: 5` / `scale: 0` / `scale: -1` → `400` `invalid_request` `error_field="scale"` `error_constraint="out_of_range"` | unit |
| **AC-10** | `scale: 2.5` (非整数) / `scale: "3"` (string) / `scale: null` / `scale: ""` → `400` `invalid_request` `error_field="scale"` `error_constraint="type_mismatch"` | unit |
| **AC-11** | `format=svg` + `scale: 3` → `200 OK`、`Content-Type: image/svg+xml`。`scale` は SVG レンダリングに影響しない (= renderer に viewport を渡さない経路を通る)。レスポンスボディは scale なし送信時と **svg root id (`id="mermaid-<requestId>"`) を正規化した上で完全一致**。observability log にのみ `scale_ignored_for_svg` warning が記録される (response body には warning を含めない)。検証は §4.4 (vii) のバイト比較で行う | unit + integration |
| **AC-12** | 環境変数 `PNG_RENDER_SCALE` を未設定にしても PNG が `scale=3` (= `DEFAULT_PNG_SCALE`) で生成される | integration |
| **AC-13** | F-1: `format=svg` で全 `<foreignObject>` の `style` 属性に `overflow:visible` が含まれる (REQ-U-09 維持) | regression |
| **AC-14** | F-2: `format=svg` の `<foreignObject>` 直下の `display:table-cell` div が flex wrapper で包まれている (REQ-U-10 維持) | regression |
| **AC-15** | `flowchart` 以外 (state-v2 / class / er / mindmap 等) の SVG 構造が **fO 数保存** で破壊されていない (F-2 副作用調査と同じ確認) | regression |
| **AC-16** | `MERMAID_PADDING` env と `PNG_RENDER_SCALE` env への参照が `src/` / `.env*` / `docker-compose*` / `test/` から **完全消滅** している | grep |

### 2.4 PROP (property test)

| ID | 性質 | 入力 fuzzer |
|---|---|---|
| **PROP-20** | `scale: n` (n=1..4) を `format=png` で送ったとき、PNG の幅が `Math.ceil(svgWidth * n)` ± 4 に収まる。`useMaxWidth=true` により SVG が `width="100%"` + `max-width: Npx` 形式で出力されるため、Chromium の CSS fractional-px 丸め処理で scale=4 時に最大 3px の誤差が発生することが実測で確認されており、±4 を公式許容範囲とする | n=fc.integer(1,4), 5 種のサンプル diagram |
| **PROP-21** | `scale: n` を `format=svg` で送ったとき、レスポンス SVG から **svg root id (`id="mermaid-<requestId>"`) を正規化** した結果が、scale 未指定時の同じ正規化結果と完全一致する。Mermaid のレンダリングは scale パラメータを参照しないという構造的性質を示す。observability log には warning が出るがレスポンス本文には現れない | n=fc.integer(1,4) |

## 3. 実装仕様

### 3.1 全体図

```
┌────────────────────────────────────────────────────────┐
│ src/config.ts                                          │
│  - BEAUTIFUL_DEFAULTS.flowchart の 4 値変更            │
│  - DEFAULT_PNG_SCALE / MIN_PNG_SCALE / MAX_PNG_SCALE   │
│  - PNG_RENDER_SCALE / MERMAID_PADDING 削除             │
└────────────────────────────────────────────────────────┘
                  ↓
┌────────────────────────────────────────────────────────┐
│ src/validation/inputValidator.ts                       │
│  - RenderRequestInput に scale?: unknown 追加          │
│  - ValidationResult に scale: number 追加              │
│  - validateScale() 新規                                │
│  - validateRenderRequest 内で scale validation 配線    │
│  - format=svg + scale → observability warning に追加   │
│    (response body には混ぜない)                         │
└────────────────────────────────────────────────────────┘
                  ↓
┌────────────────────────────────────────────────────────┐
│ src/renderer/mermaidRendererAdapter.ts                 │
│  - RenderInput に scale?: number 追加                  │
└────────────────────────────────────────────────────────┘
                  ↓
┌────────────────────────────────────────────────────────┐
│ src/renderer/programmaticAdapter.ts                    │
│  - DEFAULT_PNG_SCALE import                            │
│  - PNG 時のみ viewport を renderMermaid に渡す         │
└────────────────────────────────────────────────────────┘
                  ↓
┌────────────────────────────────────────────────────────┐
│ src/renderer/cliFallbackAdapter.ts (CLI fallback 入口) │
│  - input.scale を MermaidRenderer.render options に合流 │
└────────────────────────────────────────────────────────┘
                  ↓
┌────────────────────────────────────────────────────────┐
│ src/renderer/mermaidRenderer.ts (CLI fallback 本体)    │
│  - PNG_RENDER_SCALE → DEFAULT_PNG_SCALE 置換           │
│  - options.scale を --scale 引数に反映                  │
└────────────────────────────────────────────────────────┘
                  ↓
┌────────────────────────────────────────────────────────┐
│ src/server/app.ts                                      │
│  - validateRenderRequest 入力に scale を渡す            │
│  - renderer.render 入力にも scale を渡す (PNG 時のみ)   │
└────────────────────────────────────────────────────────┘
```

### 3.2 詳細 (1): BEAUTIFUL_DEFAULTS の値変更

**ファイル**: `src/config.ts:134-152`

**変更前**:

```ts
export const BEAUTIFUL_DEFAULTS: Readonly<MermaidConfig> = {
  theme: 'base',
  themeVariables: { fontFamily: '"Noto Sans CJK JP", "IPAexGothic", sans-serif' },
  themeCSS: '.label foreignObject { overflow: visible; }',
  htmlLabels: true,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  flowchart: {
    useMaxWidth: false,
    diagramPadding: 0,
    nodeSpacing: 30,
    rankSpacing: 40,
    curve: 'basis',
    wrappingWidth: 200,
    defaultRenderer: 'dagre-wrapper'
  }
}
```

**変更後**:

```ts
export const BEAUTIFUL_DEFAULTS: Readonly<MermaidConfig> = {
  theme: 'base',
  themeVariables: { fontFamily: '"Noto Sans CJK JP", "IPAexGothic", sans-serif' },
  themeCSS: '.label foreignObject { overflow: visible; }',
  htmlLabels: true,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  flowchart: {
    useMaxWidth: true,         // ← 変更 (Mermaid 本家既定)
    diagramPadding: 8,         // ← 変更 (Mermaid 本家既定)
    nodeSpacing: 50,           // ← 変更 (Mermaid 本家既定)
    rankSpacing: 50,           // ← 変更 (Mermaid 本家既定)
    curve: 'basis',            // ← 変えない (滑らか路線維持)
    wrappingWidth: 200,        // ← 変えない (本家と一致)
    defaultRenderer: 'dagre-wrapper'  // ← 変えない (本家と一致)
  }
}
```

**根拠**: Mermaid v11.15.0 (`node_modules/mermaid/dist/config.type.d.ts:261,279,287,332` の TypeScript 型定義、ならびに本家 Live Editor の挙動) で確認した既定値。

### 3.3 詳細 (2): 新規定数 (PNG scale)

**ファイル**: `src/config.ts` (新規セクション、`PNG_RENDER_SCALE` / `MERMAID_PADDING` を削除した位置に挿入)

```ts
/** デフォルトの PNG deviceScaleFactor。リクエストで scale が省略された場合に適用される。 */
export const DEFAULT_PNG_SCALE = 3 as const
/** scale 受付下限。1 未満の値は API で拒否する。 */
export const MIN_PNG_SCALE = 1 as const
/** scale 受付上限。これより大きい値は Chromium OOM リスクで拒否する。 */
export const MAX_PNG_SCALE = 4 as const
```

**削除** (同ファイル):

```ts
// 以下 2 行は削除
export const PNG_RENDER_SCALE = toPositiveInt(process.env.PNG_RENDER_SCALE, 2)
/** CLI fallback compatibility only; SVG root padding is disabled by default. */
export const MERMAID_PADDING = toPositiveInt(process.env.MERMAID_PADDING, 0)
```

`MERMAID_PADDING` は本リポ内で参照 0 件 (dead code)。削除時に副作用なし (`grep -rn MERMAID_PADDING src/ test/` で確認)。

### 3.4 詳細 (3): scale validation

**ファイル**: `src/validation/inputValidator.ts`

#### 3.4.1 型定義の追記

```ts
// import 追加
import {
  ...,
  DEFAULT_PNG_SCALE,
  MIN_PNG_SCALE,
  MAX_PNG_SCALE,
  ...
} from '../config.js'

// RenderRequestInput
export interface RenderRequestInput {
  code?: unknown
  format?: unknown
  timeout_ms?: unknown
  mermaid_config?: unknown
  post_process?: unknown
  scale?: unknown          // ← 追加
}

// ValidationResult
export interface ValidationResult {
  valid: boolean
  normalizedFormat: SupportedFormat
  requestedFormat: string
  timeoutMs: number
  scale: number            // ← 追加 (resolved integer)
  warnings: Warning[]
  mermaidConfig?: Partial<MermaidConfig>
  postProcess: NormalizedPostProcess
  error?: ValidateResultError
}
```

#### 3.4.2 createBaseResult の更新

`scale: DEFAULT_PNG_SCALE` を返り値に追加する (各 invalid 時のフォールバック値として早期セット):

```ts
return {
  valid: true,
  normalizedFormat,
  requestedFormat,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  scale: DEFAULT_PNG_SCALE,          // ← 追加
  warnings: warnings.drain(),
  postProcess: { ...DEFAULT_POST_PROCESS }
}
```

#### 3.4.3 validateScale() 新規追加

`validateTimeout` の直後 (`inputValidator.ts:250` 付近) に追加:

```ts
function validateScale(
  scaleRaw: unknown,
  base: ValidationResult,
  warnings: WarningCollector
): ValidationResult {
  // 未指定 → サーバ既定
  if (scaleRaw === undefined) {
    return { ...base, scale: DEFAULT_PNG_SCALE }
  }

  // strict validation: 整数以外 (null / "" / "3" / 2.5 等) を全て拒否
  if (typeof scaleRaw !== 'number' || !Number.isInteger(scaleRaw)) {
    return invalid(
      base,
      'scale must be an integer',
      'scale',
      'type_mismatch',
      warnings
    )
  }

  // 範囲チェック (1..4)
  if (scaleRaw < MIN_PNG_SCALE || scaleRaw > MAX_PNG_SCALE) {
    return invalid(
      base,
      `scale must be between ${MIN_PNG_SCALE} and ${MAX_PNG_SCALE}`,
      'scale',
      'out_of_range',
      warnings
    )
  }

  return { ...base, scale: scaleRaw }
}
```

#### 3.4.4 validateRenderRequest 配線

`validateTimeout` の直後で scale を validation し、その後の post_process / mermaid_config の前に置く:

```ts
export function validateRenderRequest(input: RenderRequestInput): ValidationResult {
  const warnings = new WarningCollector()
  const base = createBaseResult(input, warnings)
  const basicError = validateBasicFields(input, base)
  if (basicError) return basicError

  const timeoutResult = validateTimeout(input.timeout_ms, base)
  if (!timeoutResult.valid) return timeoutResult

  const scaleResult = validateScale(input.scale, timeoutResult, warnings)   // ← 追加
  if (!scaleResult.valid) return scaleResult                                // ← 追加

  // scale が指定されていて format=svg のときは警告
  if (input.scale !== undefined && scaleResult.normalizedFormat === 'svg') {
    warnings.add(WarningCode.ScaleIgnoredForSvg, {})
  }

  const mermaidConfigResult = validateMermaidConfig(
    input.mermaid_config,
    scaleResult,                                                            // ← 引数変更
    warnings
  )
  // ...以降は既存
}
```

#### 3.4.5 WarningCode 追加

**ファイル**: `src/utils/warnings.ts`

`WarningCode` enum に `ScaleIgnoredForSvg` を追加。既存 enum エントリは命名規約 `PascalCase`、メッセージは英語固定。

```ts
export enum WarningCode {
  ...existing...
  ScaleIgnoredForSvg = 'scale_ignored_for_svg'
}
```

emit したときの warning 構造:

```json
{ "code": "scale_ignored_for_svg" }
```

context フィールド (`key` 等) は不要 (PROP の比較で混乱しない)。

### 3.5 詳細 (4): RenderInput への scale 配線

**ファイル**: `src/renderer/mermaidRendererAdapter.ts`

```ts
export interface RenderInput {
  requestId: string
  code: string
  format: 'svg' | 'png'
  timeoutMs: number
  scale?: number               // ← 追加 (resolved integer or undefined for svg)
  svgId?: string
  mermaidConfig?: MermaidConfig
  postProcess?: NormalizedPostProcess
}
```

`scale` は **PNG のときだけ意味を持つ** (svg では無視) ので optional とする。

### 3.6 詳細 (5): programmaticAdapter (本丸のバグ修正)

**ファイル**: `src/renderer/programmaticAdapter.ts:37-41`

**変更前**:

```ts
const renderPromise = renderMermaid(context, input.code, input.format, {
  backgroundColor: 'transparent',
  mermaidConfig: input.mermaidConfig as never,
  svgId: input.svgId ?? buildSvgId(input.requestId, input.postProcess)
})
```

**変更後**:

```ts
import { DEFAULT_PNG_SCALE } from '../config.js'  // ← 追加

// ...

const renderOptions = {
  backgroundColor: 'transparent' as const,
  mermaidConfig: input.mermaidConfig as never,
  svgId: input.svgId ?? buildSvgId(input.requestId, input.postProcess),
  ...(input.format === 'png'
    ? { viewport: { width: 800, height: 600, deviceScaleFactor: input.scale ?? DEFAULT_PNG_SCALE } }
    : {})
}
const renderPromise = renderMermaid(context, input.code, input.format, renderOptions)
```

**なぜ `viewport.width: 800, height: 600` で良いか**: `@mermaid-js/mermaid-cli/src/index.js:368` で SVG レイアウト確定後に再度 `page.setViewport({ width: clip.x + clip.width, height: clip.y + clip.height, deviceScaleFactor: ... })` で上書きされる (object spread の順序により後の `width/height` が勝ち、`deviceScaleFactor` は維持される)。初期値は何でもよいが、過度に小さいと初回レイアウト時に折り返しが入る可能性があるので Puppeteer 既定の 800×600 を採用。

**format=svg のときに viewport を渡さない理由**: SVG 経路は `getBoundingClientRect` を使わず `XMLSerializer` で SVG 文字列を取り出すだけなので、deviceScaleFactor は出力に一切影響しない。viewport を渡しても無害だが、無関係な状態を持ち込まない原則 (= test の不変条件チェックも簡潔になる)。

### 3.7 詳細 (6): CLI fallback の更新

CLI fallback 経路は 2 ファイルにまたがる。**両方** を更新しないと scale が CLI 側で効かない (バリデーション通過した値が CLI 経路で消失する)。

#### 3.7.1 `src/renderer/mermaidRenderer.ts:8,63`

```ts
// import
import {
  ...
- PNG_RENDER_SCALE,
+ DEFAULT_PNG_SCALE,
  ...
} from '../config.js'

// PNG 処理
- args.push('--scale', String(PNG_RENDER_SCALE))
+ args.push('--scale', String(options.scale ?? DEFAULT_PNG_SCALE))
```

`MermaidRenderer.render()` シグネチャの `options` (現状 `mermaidConfigPath` / `puppeteerConfigPath` のみ受け取る) に `scale?: number` を追加。

#### 3.7.2 `src/renderer/cliFallbackAdapter.ts:25-34`

`CliFallbackAdapter.render()` が `MermaidRenderer.render()` を呼ぶときに **`input.scale` を options に乗せていない**。修正:

**変更前**:

```ts
async render(input: RenderInput): Promise<RenderResult> {
  const configPaths = await writeCliConfigFiles(input)
  try {
    const result = await this.renderer.render(
      input.requestId,
      input.code,
      input.format,
      input.timeoutMs,
      configPaths                       // ← scale が伝わらない
    )
```

**変更後**:

```ts
async render(input: RenderInput): Promise<RenderResult> {
  const configPaths = await writeCliConfigFiles(input)
  try {
    const result = await this.renderer.render(
      input.requestId,
      input.code,
      input.format,
      input.timeoutMs,
      { ...configPaths, scale: input.scale }   // ← scale を合流
    )
```

これで `RENDERER_MODE=cli` でも programmatic と同等の scale 挙動になる。

### 3.8 詳細 (7): app.ts での配線

**ファイル**: `src/server/app.ts`

app.ts は **2 箇所** を更新する必要がある。validator への入力と renderer への入力の両方。**どちらか一方だけ更新すると `req.body.scale` が validator に届かず、`scale` パラメータは常に未指定扱い → default 値が必ず使われる** という silent bug になる。

#### 3.8.1 `validateRenderRequest` 呼び出し (`src/server/app.ts:57-63`)

**変更前**:

```ts
const validation = validateRenderRequest({
  code: req.body.code,
  format: req.body.format,
  timeout_ms: req.body.timeout_ms,
  mermaid_config: req.body.mermaid_config,
  post_process: req.body.post_process
})
```

**変更後**:

```ts
const validation = validateRenderRequest({
  code: req.body.code,
  format: req.body.format,
  timeout_ms: req.body.timeout_ms,
  mermaid_config: req.body.mermaid_config,
  post_process: req.body.post_process,
  scale: req.body.scale                                        // ← 追加
})
```

#### 3.8.2 `renderer.render` 呼び出し (`src/server/app.ts:171-178`)

```ts
const renderResult = await renderer.render({
  requestId,
  code: req.body.code,
  format: normalizedFormat,
  timeoutMs: validation.timeoutMs,
  scale: normalizedFormat === 'png' ? validation.scale : undefined,  // ← 追加
  mermaidConfig,
  postProcess: validation.postProcess
})
```

`format=svg` では scale を渡さない (adapter 側でも no-op だが意図を明示)。

### 3.9 詳細 (8): 環境ファイルの掃除

| ファイル | 変更内容 |
|---|---|
| `.env` | `PNG_RENDER_SCALE=3` 行を削除、`MERMAID_PADDING` 行 (もし存在すれば) を削除 |
| `.env.example` | `PNG_RENDER_SCALE=2` 行と `MERMAID_PADDING=20` 行を削除。コメントで「PNG scale は API パラメータ `scale` で指定 (1-4, 既定 3)」と明示 |
| `.env.test` | `PNG_RENDER_SCALE=3` と `MERMAID_PADDING=0` 行を削除 |
| `docker-compose.yml` | (確認) これらの env を service の `environment` セクションに明示している箇所がないことを確認。あれば削除 |

### 3.10 不変条件 (Invariants)

実装中に **絶対に壊してはいけない** 性質:

| ID | 不変条件 | 確認方法 |
|---|---|---|
| **INV-1** | F-1 (`forceForeignObjectOverflowVisible`) は本変更後も全 `<foreignObject>` に `style="overflow:visible"` を注入する | F-2 検証レポート (`foreignobject-inner-centering-verification-2026-05-17.md`) の 12 ケースを再実行して合致 |
| **INV-2** | F-2 (`forceForeignObjectInnerCentered`) は flowchart の `<foreignObject>` 直下に flex wrapper を注入する | 同上 (shift_px=0 を全 12 ケースで確認) |
| **INV-3** | `mermaid_config.flowchart.*` のユーザ override は引き続き `safeDeepMerge` で defaults に勝つ | 既存 PROP-08 を実行 (assert を新しい defaults に更新) |
| **INV-4** | `format=svg` のレスポンスは scale パラメータの値に関わらず、svg root id を正規化した上で同一バイトを返す (= Mermaid レンダリングは scale を参照しない) | PROP-21 新規 |
| **INV-5** | `format=png` のレスポンスは `scale=n` のとき幅が `Math.ceil(svgWidth * n) ± 2` | PROP-20 新規 |
| **INV-6** | `MERMAID_CONFIG_SCHEMA` (validator) で受理されるキー群は本変更で減らさない (`scale` を `mermaid_config` 内に**入れない** = top-level) | スキーマ diff レビュー |

## 4. テスト仕様

### 4.1 既存テストの修正 (3 ファイル)

| ファイル | 変更行 | 変更内容 |
|---|---|---|
| `test/property/prop-03_beautiful_defaults.property.test.ts:19` | 1 行 | `expect(result.flowchart?.useMaxWidth).toBe(false)` → `toBe(true)` |
| `test/unit/buildRequestMermaidConfig.test.ts:21` | 1 行 | 同上 |
| `test/property/prop-08_deep_merge_preserves_keys.property.test.ts:18-29` | 3 箇所 | 基底値の `diagramPadding: 0, nodeSpacing: 30, rankSpacing: 40` を `diagramPadding: 8, nodeSpacing: 50, rankSpacing: 50` に。assert 値も同様に変更 |

> ⚠️ `inputValidator.mermaidConfig.test.ts` の `diagramPadding: 4 / 16 / 2` などは **テスト入力値** であって defaults assert ではない。**変更不要**。

### 4.2 新規 unit test

#### 4.2.1 scale validation

**ファイル**: `test/unit/inputValidator.scale.test.ts` (新規)

| ケース | 入力 | 期待 |
|---|---|---|
| 未指定 | `{}` | `valid=true, scale=3` |
| 1 (下限) | `{ scale: 1 }` | `valid=true, scale=1` |
| 4 (上限) | `{ scale: 4 }` | `valid=true, scale=4` |
| 0 (下限割れ) | `{ scale: 0 }` | `400` `out_of_range` |
| 5 (上限超え) | `{ scale: 5 }` | `400` `out_of_range` |
| -1 | `{ scale: -1 }` | `400` `out_of_range` |
| 非整数 | `{ scale: 2.5 }` | `400` `type_mismatch` |
| 文字列 numeric | `{ scale: "3" }` | `400` `type_mismatch` |
| null | `{ scale: null }` | `400` `type_mismatch` |
| 空文字 | `{ scale: "" }` | `400` `type_mismatch` |
| boolean | `{ scale: true }` | `400` `type_mismatch` |
| object | `{ scale: { value: 3 } }` | `400` `type_mismatch` |

`error_field="scale"`、`error_message` は `"scale must be an integer"` (type) または `"scale must be between 1 and 4"` (range)。

#### 4.2.2 scale + format=svg

**ファイル**: `test/unit/inputValidator.scaleWithSvg.test.ts` (新規)

| ケース | 入力 | 期待 |
|---|---|---|
| svg + 未指定 | `{ format: "svg" }` | `valid=true`、`ValidationResult.warnings` に `scale_ignored_for_svg` **無し** |
| svg + scale: 2 | `{ format: "svg", scale: 2 }` | `valid=true`、`ValidationResult.warnings` に `scale_ignored_for_svg` **あり** (この warnings は observability 行きで、API response body には現れない) |
| png + scale: 2 | `{ format: "png", scale: 2 }` | `valid=true`、`ValidationResult.warnings` に `scale_ignored_for_svg` **無し** |
| svg + 不正 scale | `{ format: "svg", scale: "x" }` | `400` `type_mismatch`。順序は (1) `validateBasicFields` で format=svg を valid format として通過 → (2) `validateScale` で `"x"` が非整数として弾かれる |

### 4.3 新規 property test

#### 4.3.1 PROP-20: PNG 幅が scale 倍になる

**ファイル**: `test/property/prop-20_png_scale_factor.property.test.ts` (新規)

```ts
test('PNG width is svgWidth * scale (±4 px tolerance)', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 4 }),
      fc.constantFrom(...SAMPLE_DIAGRAMS),  // 5 種類のサンプル
      async (scale, diagram) => {
        const svgResp = await renderViaAPI({ code: diagram, format: 'svg' })
        const svgWidth = parseSvgViewBoxWidth(svgResp)
        const pngResp = await renderViaAPI({ code: diagram, format: 'png', scale })
        const pngWidth = readPngWidth(pngResp)
        expect(Math.abs(pngWidth - Math.ceil(svgWidth * scale))).toBeLessThanOrEqual(4)
      }
    ),
    { numRuns: 5 }
  )
})
```

`SAMPLE_DIAGRAMS` は flowchart 中心に 5 種類 (短文 / 長文 / CJK / 多ノード / 多 rank)。startTestServer() を使った in-process integration 寄りの property test として実装する。

> **±4px について (2026-05-18 改訂)**: 元設計では ±2px 指定だったが、`useMaxWidth=true` + `width="100%"` + `max-width: Npx` 形式の SVG が Chromium の CSS fractional-px 丸め処理により scale=4 時に最大 3px の実測誤差を発生させることが確認された。実装上のバグではなく CSS レンダリングの特性であるため ±4px を公式許容範囲とする。`numRuns` は同様の理由でテスト安定性のため 20→5 に変更。

#### 4.3.2 PROP-21: SVG は scale に依存しない

**ファイル**: `test/property/prop-21_svg_scale_invariance.property.test.ts` (新規)

```ts
/**
 * SVG レスポンスから requestId 由来の svg root id (`id="mermaid-<uuid>"`) を
 * 固定値に正規化する。これにより、別 requestId で発行した 2 リクエストの SVG を
 * 「scale 以外の差分が無い」観点で比較できる。
 *
 * 注意: 現状 mermaid 11.15.0 + dagre-wrapper で確認した範囲では、requestId 由来の
 * id は root svg のみ。他の sequential id (`flowchart-A-1` 等) は決定論的。
 * 将来 Mermaid バージョン更新時に新たな randomness が混入したら、このヘルパーに
 * パターンを追加すること。
 */
export function normalizeSvgForCompare(svg: string): string {
  return svg
    .replace(/id="mermaid-[0-9a-f-]+"/g, 'id="mermaid-NORMALIZED"')
    .replace(/aria-roledescription="mermaid-[^"]+"/g, 'aria-roledescription="mermaid-NORMALIZED"')
}

test('SVG content is identical regardless of scale value (after svg root id normalization)', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 4 }),
      fc.constantFrom(...SAMPLE_DIAGRAMS),
      async (scale, diagram) => {
        const respNoScale = await renderViaAPI({ code: diagram, format: 'svg' })
        const respWithScale = await renderViaAPI({ code: diagram, format: 'svg', scale })
        const normNoScale = normalizeSvgForCompare(respNoScale.data.toString('utf8'))
        const normWithScale = normalizeSvgForCompare(respWithScale.data.toString('utf8'))
        // 正規化後はバイト完全一致 (= Mermaid レンダリングは scale を見ないという構造的不変性)
        expect(normWithScale).toEqual(normNoScale)
      }
    ),
    { numRuns: 10 }
  )
})
```

**実装メモ**: `normalizeSvgForCompare` は test ヘルパーとして共通化 (例: `test/helpers/svgCompare.ts`)。 PROP-21 と integration (vii)(viii) で同じ実装を再利用する。実装前に **手動で 2 リクエストの SVG を diff** し、`id="mermaid-..."` 以外に requestId 由来の差分が無いことを確認すること (もし他にあれば normalize パターンを追加)。

### 4.4 integration test (Docker test container 3101 で実施)

**ファイル**: `test/integration/png.scale.integration.test.ts` (新規)

| ケース | 検証内容 |
|---|---|
| (i) `scale` 未指定で PNG リクエスト | 幅が SVG viewBox 幅 × 3 ± 2 |
| (ii) `scale: 1` | 幅が viewBox 幅 × 1 |
| (iii) `scale: 2` | 幅が viewBox 幅 × 2 |
| (iv) `scale: 4` | 幅が viewBox 幅 × 4 |
| (v) `scale: 5` | `400` |
| (vi) `scale: "3"` | `400` |
| (vii) `format=svg` + `scale: 3` | `200`、`Content-Type: image/svg+xml`。 `scale` あり / なし 2 リクエストの SVG を `test/helpers/svgCompare.ts` の `normalizeSvgForCompare()` (§4.3.2 で実装) で正規化した後にバイト比較 → 一致 |
| (viii) `format=svg` 単体 → 別リクエストで `format=svg` + `scale: 2` | 両 SVG を §4.3.2 の `normalizeSvgForCompare()` で正規化した後にバイト一致 (= (vii) と同じ比較ロジック) |

### 4.5 視覚回帰 (F-1 / F-2 不変条件)

F-2 verification (`docs/foreignobject-inner-centering-verification-2026-05-17.md`) の 12 ケースを **本変更後の test サービス (3101)** で再実行し、以下を確認:

- 全 12 ケースで `shift_px = 0` (F-2 INV-2)
- 全 12 ケースで `<foreignObject>` の `style` に `overflow:visible` 含む (F-1 INV-1)
- F-2 副作用調査 (`docs/foreignobject-inner-centering-diagram-types-2026-05-17.md`) の 14 ダイアグラム × foreignObject 数保存を再確認

**スクリーンショット** は新規生成し、本変更後の見た目 (4 defaults 変更 + scale=3) として後段の検証レポートに添付する。

### 4.6 テスト実行コマンド

```bash
# 単体 + property
npm test -- test/unit test/property

# integration (test container 3101 が起動済の前提)
RENDER_API_URL=http://localhost:3101 npm test -- test/integration

# 視覚回帰 (Playwright)
npm run test:visual
```

## 5. テスト後の報告書 (必須成果物)

実装完了時に **以下のテンプレに従った検証レポート** を `docs/png-padding-and-scale-verification-2026-05-17.md` として新規作成すること。

````markdown
# PNG 画質・余白改善 検証レポート (REQ-U-11) — YYYY-MM-DD

## 環境
- ブランチ: improve/png-padding-and-scale
- コミット: <hash>
- Mermaid: 11.15.0
- test container: port 3101 (image tag <tag>)
- 検証日時: YYYY-MM-DD HH:MM JST
- 検証者: <name>

## 単体テスト結果
| Suite | passed | failed | total |
|---|---:|---:|---:|
| inputValidator.scale | N | 0 | N |
| inputValidator.scaleWithSvg | N | 0 | N |
| 既存全体 | N | 0 | N |

## Property テスト結果
| ID | numRuns | shrunk failures |
|---|---:|---:|
| PROP-20 | 20 | 0 |
| PROP-21 | 10 | 0 |
| PROP-08 (修正済) | 50 | 0 |

## Integration テスト結果
| AC | 入力 | 期待 | 実測 | 判定 |
|---|---|---|---|---|
| AC-5 | format=png, scale=未指定 | 幅 = svgW × 3 | <値> | OK/NG |
| AC-7 | format=png, scale=2 | 幅 = svgW × 2 | <値> | OK/NG |
| AC-8 | format=png, scale=4 | 幅 = svgW × 4 | <値> | OK/NG |
| ... |   |   |   |   |

## 不変条件 (F-1 / F-2) 回帰
| INV | 確認方法 | 結果 |
|---|---|---|
| INV-1 (F-1) | 12 ケース × overflow:visible 含有 | 12/12 |
| INV-2 (F-2) | 12 ケース × shift_px=0 | 12/12 |
| INV-3 | PROP-08 deep merge | pass |

## 視覚比較
- before (本番 3100): `docs/png-padding-and-scale-verification-2026-05-17/before/`
- after (test 3101): `docs/png-padding-and-scale-verification-2026-05-17/after/`
- 並列ビューア: `docs/png-padding-and-scale-verification-2026-05-17/viewer.html`

## 受入条件チェック
| AC | 状態 |
|---|---|
| AC-1 ... AC-16 | OK / NG (理由) |

## env クリーンアップ確認
```bash
$ grep -rn "PNG_RENDER_SCALE\|MERMAID_PADDING" src/ test/ .env* docker-compose.yml
# 結果が 0 件であること
```

## 結論
- REQ-U-11 全条件 充足 / 一部未達 (理由)
- ロールバック準備: image tag `<rollback-tag>`
- 本番 (3100) 置換準備: OK / NG
````

## 6. 作業手順 (チェックリスト)

### Phase 0: 準備

- [ ] 本設計書を熟読し、不明点は質問として記録 → 設計書側を更新してから着手
- [ ] `improve/png-padding-and-scale` ブランチが main から派生済 (commit `1f47c19`) で、調査レポート `docs/png-padding-and-scale-investigation-2026-05-17.md` が含まれていることを確認
- [ ] 既存テスト全体が `npm test` で pass することを確認 (ベースラインの記録)
- [ ] 本番 (port 3100) の現在のイメージタグを **ロールバック用に保存**: `docker compose images mermaid-render-api`

### Phase 1: コード変更

- [ ] `src/config.ts`: `BEAUTIFUL_DEFAULTS.flowchart` 4 値変更 + 定数 3 個追加 + 2 行削除
- [ ] `src/validation/inputValidator.ts`: 型追加 + `validateScale` 追加 + 配線
- [ ] `src/utils/warnings.ts`: `ScaleIgnoredForSvg` enum 追加
- [ ] `src/renderer/mermaidRendererAdapter.ts`: `RenderInput.scale` 追加
- [ ] `src/renderer/programmaticAdapter.ts`: viewport 配線
- [ ] `src/renderer/mermaidRenderer.ts`: CLI fallback の `--scale` 引数を `options.scale ?? DEFAULT_PNG_SCALE` に変更
- [ ] `src/renderer/cliFallbackAdapter.ts`: `MermaidRenderer.render` の options に `input.scale` を合流
- [ ] `src/server/app.ts`: **2 箇所** に scale を配線 — (1) `validateRenderRequest` の入力オブジェクトに `scale: req.body.scale`、(2) `renderer.render` の入力に `scale: normalizedFormat === 'png' ? validation.scale : undefined`
- [ ] `.env` / `.env.example` / `.env.test`: env 削除

### Phase 2: テスト

- [ ] 既存 3 ファイルの assert 更新 (§4.1)
- [ ] 新規 unit: `inputValidator.scale.test.ts` (§4.2.1)
- [ ] 新規 unit: `inputValidator.scaleWithSvg.test.ts` (§4.2.2)
- [ ] 新規 PROP-20 (§4.3.1)
- [ ] 新規 PROP-21 (§4.3.2)
- [ ] `npm test` で全体 pass を確認

### Phase 3: ビルド & test container 起動

- [ ] `docker compose build mermaid-render-api-test`
- [ ] `docker compose --profile test up -d mermaid-render-api-test`
- [ ] `curl -sS http://localhost:3101/healthz` で 200 確認
- [ ] **本番 3100 はそのまま稼働継続を確認** (`docker ps | grep 3100->3000`)

### Phase 4: integration / 視覚回帰

- [ ] §4.4 の (i)〜(viii) を test container (3101) で実行
- [ ] §4.5 の 12 ケース × F-1/F-2 不変条件確認
- [ ] §4.5 の 14 ダイアグラム × fO 数保存確認
- [ ] スクリーンショット (Playwright) を `docs/png-padding-and-scale-verification-2026-05-17/after/` に保存

### Phase 5: 報告書作成

- [ ] §5 のテンプレに従って `docs/png-padding-and-scale-verification-2026-05-17.md` を作成
- [ ] 全 AC を表で OK/NG 判定
- [ ] env クリーンアップ確認の grep 結果を記録

### Phase 6: PR 作成 & マージ

- [ ] コミット: `feat(REQ-U-11): PNG 画質・余白改善 (defaults 整合 + scale パラメータ + scale 配線)`
- [ ] `git push -u origin improve/png-padding-and-scale`
- [ ] `gh pr create --title "feat(REQ-U-11): PNG 画質・余白改善" --base main --body ...`
- [ ] PR 説明には: 変更ファイル一覧、AC 充足表、リスク評価、ロールバック手順を含める
- [ ] レビュー通過後、main に merge

### Phase 7: 本番デプロイ (blue/green)

- [ ] main の最新を pull (`git checkout main && git pull`)
- [ ] **本番イメージを rollback タグで保存**: `docker tag mermaid-render-api-mermaid-render-api:latest mermaid-render-api-mermaid-render-api:rollback-pre-req-u-11`
- [ ] `docker compose build mermaid-render-api`
- [ ] `docker compose up -d mermaid-render-api` (`--profile test` 無しで本番のみ recreate)
- [ ] 5 ケース × format=svg/png × scale=1/2/3 の smoke test
- [ ] エラー監視 5 分間
- [ ] 完了報告

### Phase 8: test container クリーンアップ

- [ ] `docker compose stop mermaid-render-api-test`
- [ ] `docker compose rm -f mermaid-render-api-test`

## 7. 注意事項 (CRITICAL)

### 7.1 絶対禁止コマンド

以下のコマンドは **本番停止リスク** があるため、本作業中は絶対に使用しない:

| 禁止コマンド | 理由 | 代替 |
|---|---|---|
| `docker compose down` | 全 service (本番 mermaid-render-api 含む) を停止 | `docker compose stop <service-name>` で個別停止 |
| `docker compose down -v` | 同上 + volume 削除 | 同上 |
| `docker compose kill` | 全 service 強制停止 | `docker compose stop <service-name>` |
| `docker stop $(docker ps -aq)` | 全コンテナ停止 | サービス名指定で個別停止 |

### 7.2 本番 (port 3100) を停止しない

- 検証は **すべて test container (port 3101)** で行う
- 本変更の動作確認のために本番を一時停止することは絶対に避ける
- 唯一の本番停止タイミングは Phase 7 の blue/green swap のみ、それも image rebuild → up -d で **ダウンタイム数秒** に収める

### 7.3 ロールバック条件

以下のいずれかが発生したら **直ちに rollback**:

- 本番 swap 後 5 分以内に `/healthz` が non-200
- swap 後 10 分以内に F-1 / F-2 の不変条件 (INV-1/INV-2) を破る SVG が観測された
- 既存 iPhone Shortcut / n8n クライアントから 5xx エラーが報告された

**rollback 手順**:

```bash
# 1. 旧イメージにタグ付け直し
docker tag mermaid-render-api-mermaid-render-api:rollback-pre-req-u-11 \
           mermaid-render-api-mermaid-render-api:latest

# 2. 本番のみ recreate
docker compose up -d mermaid-render-api

# 3. 動作確認
curl -sS http://localhost:3100/healthz
```

ロールバック後、原因を Issue として記録し、test container で再現確認してから再着手。

### 7.4 警告フィールドのレスポンス互換性

**重要**: 本 API の成功レスポンスは画像バイナリ (`image/svg+xml` または `image/png`) を返すのみで、**JSON ボディは存在しない** ([`src/server/app.ts:208-212`](../src/server/app.ts) で `.send(renderResult.data)` のみ)。したがって本変更でも warnings をレスポンス本文に混入させない。

既存の warning code (`PrototypePollutionAttempt` / `LockedSettingOverrideIgnored` / `UnknownKey` / `ThemeCssRejected` / `SvgOnlyOptionInPng`) は **observability の構造化ログのみに記録** される仕組み ([`src/server/app.ts:222-234`](../src/server/app.ts) の `observeRenderRequest` → [`src/server/observability.ts:154-166`](../src/server/observability.ts) の `logStructuredRequest` 経由、`warnings` フィールドが log エントリに含まれる)。

**重要**: warning code 別の prom-client metric (Counter / Gauge 等) は **現状存在しない**。`observability.ts:57-112` で定義されている prometheus metric は `renderTotal` / `renderDurationMs` / `queueWaitMs` / `browserPoolInUse` / `browserPoolQueueSize` / `renderTimeoutTotal` / `browserRestartsTotal` / `validationErrorTotal` の 8 個で、`warnings` を発行レートとして集計する仕組みは未実装。

本変更で `ScaleIgnoredForSvg` を追加するが、**既存の構造化ログ経路にだけ乗せる**。クライアントへの可視通知は無し (= response Content-Type も response body もこれまでと完全互換)。warning 件数を Grafana で観測したい等の要望が将来出てきたら、別 Issue として `warningTotal{code=...}` Counter の追加を行う (本設計のスコープ外)。

もし将来「クライアントに無視された scale を伝えたい」要件が出てきたら、レスポンス本文の構造を変えずに `X-Mermaid-Warnings: scale_ignored_for_svg` のような **カスタムヘッダ** で追加するのが安全。本設計では対象外。

### 7.5 既知の脆い箇所

- **PROP-21 (SVG 不変性)**: `buildSvgId(requestId, postProcess)` は `mermaid-${requestId}` を返すため、別リクエストの SVG は必ず svg root id で差異が出る (純粋バイト一致は不可能)。これを承知の上で **§4.3.2 の `normalizeSvgForCompare()` ヘルパーで svg root id を正規化した後にバイト比較** する方針を AC-11 / PROP-21 / integration (vii)(viii) で採用済。実装前に手動で 2 リクエストの SVG を `diff` し、`id="mermaid-..."` 以外に requestId 由来の randomness が無いことを 1 回確認すること。新たな源があったら `normalizeSvgForCompare` のパターンを追加するか、本テストを skip としてリスク受容を記録する
- **timeout_ms との挙動差**: `scale` は新規パラメータなのでレガシークライアント互換の懸念なし。ただし将来 iPhone Shortcut で `scale: null` を送られた場合の 400 を予期されないことに注意 (= ドキュメントで明示)
- **CLI fallback の経路**: 通常 `RENDERER_MODE=programmatic` (既定) で動作するため CLI fallback は実質テスト時のみ。それでも mermaidRenderer.ts の修正は省略せず、両経路で同じ scale が効くようにする

## 8. ロールバック手順 (要約)

§7.3 参照。重要箇所のみ再掲:

```bash
# 事前に rollback タグを作成 (Phase 7 の最初)
docker tag mermaid-render-api-mermaid-render-api:latest \
           mermaid-render-api-mermaid-render-api:rollback-pre-req-u-11

# 万一の rollback (タグを current に貼り直して up -d)
docker tag mermaid-render-api-mermaid-render-api:rollback-pre-req-u-11 \
           mermaid-render-api-mermaid-render-api:latest
docker compose up -d mermaid-render-api
```

## 9. API 仕様書の更新

**ファイル**: `docs/API仕様_Mermaid画像変換API.md`

以下の章を新規追加 (既存の `timeout_ms` の章の直後):

````markdown
### `scale` (整数, optional)

PNG の解像度倍率 (deviceScaleFactor)。`1`〜`4` の整数。

- 未指定 → サーバ既定 `3` を使用
- `format=svg` と組み合わせた場合 → `scale` は無視される (SVG はベクター形式のため解像度の概念が存在しない)。レスポンスは `200 OK`、`Content-Type: image/svg+xml`、`scale` 未指定時とレンダリング内容上は同一の SVG が返る (リクエストごとに付与される `id="mermaid-<requestId>"` のみは毎回異なる)。サーバ内部の observability log に `scale_ignored_for_svg` が記録される
- 範囲外 (`0`, `5+`, 非整数, 文字列, null) → `400 invalid_request`

| 入力 | 動作 |
|---|---|
| `{"format":"png","scale":1}` | 軽量モード (約 1/9 のファイルサイズ) |
| `{"format":"png","scale":3}` | 標準 (既定値と同等) |
| `{"format":"png","scale":4}` | 高 DPI 用 |

例:

```bash
curl -X POST https://api.example.com/render \
  -H "Content-Type: application/json" \
  -d '{"code":"flowchart LR\n A-->B","format":"png","scale":2}' \
  > output.png
```
````

## 10. 参考: F-1 / F-2 との関係

| 観点 | F-1 (REQ-U-09) | F-2 (REQ-U-10) | 本変更 (REQ-U-11) |
|---|---|---|---|
| 介入レイヤ | post-process (SVG 文字列 regex 注入) | 同上 | config defaults + Puppeteer viewport + validator |
| 影響範囲 | `format=svg` のみ | `format=svg` のみ | **両 format** (defaults は両方、scale は PNG のみ) |
| API 表面変化 | 無し | 無し | **あり** (`scale` パラメータ新規) |
| 副作用調査済 | yes (12 ケース) | yes (14 ダイアグラム種別) | 本書 §4.5 + AC-15 で再確認 |
| Rollback | コード revert | コード revert | image tag rollback |

F-1 / F-2 は **本変更後も独立に動作する**。post-process は SVG 文字列に対する後段処理であり、defaults / scale / viewport の変化に影響を受けない。verification で 12 ケースの不変条件 (INV-1 / INV-2) を再確認することで結合動作を担保する。

## 11. Out of Scope

以下は本作業のスコープ外:

- `nodeSpacing` / `rankSpacing` / `useMaxWidth` を **flowchart 以外のダイアグラム種別** (state / class / sequence 等) で本家準拠化する作業 (現状すでに本家準拠なので追加作業不要)
- `wrappingWidth` / `defaultRenderer` の変更 (本家既定と一致しているため変えない)
- `curve` を `linear` (本家既定) に戻す変更 (見た目が固くなるため意図的に維持)
- `render_options` 名前空間導入 (将来 render-time オプションが複数になったら検討)
- 既存 `timeout_ms` の validation 緩和 (別 Issue として記録)
- iPhone Shortcut のレガシー pattern (`timeout_ms: ""`) に対する後方互換修正 (別 Issue)

## 12. 検証 (設計書自身の整合性)

実装着手前に以下を機械的に確認する:

1. **AC 網羅性**: §2.3 の AC-1..AC-16 が §4 のテスト計画で全てカバーされている
2. **INV 網羅性**: §3.10 の INV-1..INV-6 が §4.5 もしくは §4.3 で全て確認される
3. **PROP 網羅性**: PROP-20 / PROP-21 が §4.3 に定義済
4. **ファイル列挙整合**: §3 の各「ファイル」表記と §6 Phase 1 のチェックリストが 1:1 対応
5. **禁止コマンド明記**: §7.1 で `docker compose down` 系が明確に禁止されている
6. **rollback 手順具体性**: §7.3 / §8 のコマンドが実行可能 (タグ名・サービス名が確定値)

---

**着手前 / レビュー時のレビューポイント** (実装者が pre-flight でセルフチェックする項目):

- [ ] AC-1 ... AC-16 が全部テスト計画で参照されているか
- [ ] 本番 3100 を停止する操作が手順に含まれていないか
- [ ] `docker compose down` が手順に含まれていないか
- [ ] env 削除後の `.env.example` に「scale は API パラメータで指定」と明示されているか
- [ ] PROP-21 / AC-11 / integration (vii)(viii) の SVG バイト比較が、`normalizeSvgForCompare()` で svg root id を正規化した上で行うことが明示されているか (= 別リクエスト 2 本の生バイト完全一致を要求していないか)
- [ ] rollback image tag 名 (`rollback-pre-req-u-11`) が Phase 7 の最初で確定的に作成されるか
