# Mermaid SVG レンダリング ベストプラクティス確認(専門家レビューまとめ)

- 作成日: 2026-05-10
- 対象: `mermaid-render-api` の改修方針(SVG ノードパディング・clip 対策・配布 HTML 対応・エラー応答)
- 専門家: O / A / G の 3 名に同一の質問書を送付して回答を取得
- 質問書: `/render` API の現状(quantitative data 付き)を提示した上で、Mermaid v11 系のベストプラクティスを Q1〜Q7 で確認
- 関連: 調査レポート `../svg-padding-investigation/REPORT.md`

---

## 0. このドキュメントの位置づけ

3 名の回答に対して、本リポジトリ内のコード・一次ソース(Mermaid 公式 `config.schema.yaml`、`@mermaid-js/mermaid-cli` の `package.json` / `src/index.js`)で検証した結果、**信頼性 ≥97%** と判定した事実だけをここに集約する。要件定義書(`.kiro/specs/*/requirements.md`)を起こす際の「動かない前提」として参照する。

専門家ごとの主張差異・推奨値の違いは §5 にまとめる。

---

## 1. Mermaid 設定 schema の確実な事実

直接確認: https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/schemas/config.schema.yaml(2026-05 時点 develop)

### 1.1 ルート設定

| キー | デフォルト | 仕様 |
|---|---|---|
| `htmlLabels` | (root) | ノード/エッジラベルを HTML タグで描画するか。**ルート版が優先**、diagram-specific (`flowchart.htmlLabels` 等) は **deprecated** |
| `securityLevel` | `strict` | `strict` / `loose` / `antiscript` / `sandbox`。配布 HTML embed では **strict 固定推奨** |
| `maxTextSize` | `50000` | 入力 Mermaid テキストの最大バイト数 |
| `maxEdges` | `500` | 描画可能な最大エッジ数 |
| `suppressErrorRendering` | `false` | true にすると構文エラー時の「Syntax error」図 SVG 挿入を抑止。API 側でエラーレスポンスを返す設計と相性が良い |
| `deterministicIds` | `false` | true なら ID 生成が seed ベース。複数 SVG embed 時の **ID 衝突対策**に重要 |
| `deterministicIDSeed` | (undefined) | 上記の seed 文字列 |

ソース: `config.schema.yaml` のルート定義 / `htmlLabels` 説明 / `securityLevel` enum / `suppressErrorRendering` セクション。

### 1.2 `flowchart` 配下(本改修の中心)

| キー | デフォルト | 注意点 |
|---|---|---|
| `diagramPadding` | `8` | ダイアグラム全体の外周余白 |
| `nodeSpacing` | `50` | 同一ランクのノード**間** |
| `rankSpacing` | `50` | 異なるランクのノード**間** |
| `padding` | `15` | schema 上 **"Only used in new experimental rendering"** と明記。**ただし 2026-05-16 実機検証(Mermaid `11.15.0` bundled、`defaultRenderer: "dagre-wrapper"`、`htmlLabels: true`)で `dagre-wrapper` でも効くことを確認**。実測式 `rect.width − fO.width = 4 × padding` / `rect.height − fO.height = 2 × padding`。schema コメント由来の挙動保証は無いため依存更新時の画像差分検証必須(`requirements.md` C-M-01) |
| `useMaxWidth` | `true` | true → SVG ルートに `style="max-width:...px"` 付与。false → 絶対 px の `width`/`height` 属性 |
| `wrappingWidth` | `200` | Markdown Strings 自動折り返しの幅 |
| `defaultRenderer` | `dagre-wrapper` | v11 のレガシー側デフォルト。`elk` は新統合レンダラ経由 |
| `curve` | `basis` | エッジ曲線種別 |
| `htmlLabels` | (deprecated) | **使用禁止** → root の `htmlLabels` を使う |

---

## 2. `@mermaid-js/mermaid-cli` の確実な事実

直接確認: https://raw.githubusercontent.com/mermaid-js/mermaid-cli/master/package.json + `src/index.js`(2026-05 時点 master)

### 2.1 依存関係(v11.12.0)

```json
"@mermaid-js/layout-elk": "^0.1.2 || ^0.2.0",
"@mermaid-js/mermaid-zenuml": "^0.2.0",
"mermaid": "^11.14.0"
```

→ **mmdc 経由なら ELK レンダラは追加導入不要**(本リポジトリの `package.json` で既に `@mermaid-js/mermaid-cli@^11.12.0` を採用しているため、`layout: elk` を指定すれば動く)。

### 2.2 CLI フラグ(主要)

| フラグ | 用途 |
|---|---|
| `-i, --input <path>` | Mermaid 入力(`-` で stdin) |
| `-o, --output [path]` | 出力 |
| `-c, --configFile [path]` | Mermaid 設定 JSON **ファイルパス**(★ inline JSON 渡し不可) |
| `-C, --cssFile [path]` | 追加 CSS |
| `-I, --svgId [id]` | 出力 SVG の `id` 属性指定(ID 衝突対策に有用) |
| `-t, --theme <name>` | テーマ名 |
| `-q, --quiet` | ログ抑制 |
| `-p, --puppeteerConfigFile [path]` | Puppeteer 設定 |
| `-e, --outputFormat <fmt>` | 出力フォーマット |
| `-s, --scale <num>` | PNG スケール |
| `-b, --backgroundColor <color>` | 背景色 |

**`--errorFormat json` のような構造化エラー出力フラグは存在しない**。

### 2.3 Programmatic API(★ 本リポジトリの将来的改善余地)

`src/index.js` は以下を export している:

```js
export { run, renderMermaid, cli, error }
```

`renderMermaid` のシグネチャ:

```js
async function renderMermaid(
  browser,                       // Puppeteer browser インスタンス(リクエスト間で再利用可能)
  definition,                    // Mermaid テキスト
  outputFormat,                  // 'svg' | 'png' | 'pdf' 等
  {
    viewport,
    backgroundColor = 'white',
    mermaidConfig = {},          // ★ 設定をオブジェクト直渡し(temp file 不要)
    myCSS,
    pdfFit,
    svgId,
    iconPacks = [],
    iconPacksNamesAndUrls = []
  } = {}
)
```

→ 現行の `child_process.execFile('npx mmdc ...')` 方式から `renderMermaid(sharedBrowser, code, fmt, {mermaidConfig})` に切り替えると:
- 一時 config ファイル不要
- Puppeteer/Chromium をリクエスト間で再利用 → **1-2 秒の起動コストが消える**(Expert A/G 一致)
- ただし README は "NodeJS API is not under semver" と注意書きあり → メジャー更新時の検証必要

---

## 3. アーキテクチャ上の確実な事実

### 3.1 CLI subprocess vs programmatic API のレイテンシ差

Expert A/G が一致して指摘、現行コード(`src/renderer/mermaidRenderer.ts:62` の `execFileAsync('npx', ['--yes', 'mmdc', ...])`)から判断:

- 現行 = リクエスト毎に `npx mmdc` を spawn → Puppeteer launch → page 作成 → render → close
- これは 1 リクエスト 1-2 秒の固定オーバーヘッドの原因
- programmatic API + browser pool に置換すれば数十 ms オーダーに短縮可能(専門家見解)

### 3.2 inline SVG の ID 衝突問題

複数 mermaid SVG を同一 HTML に inline embed すると `<marker id="arrowhead">`、`<clipPath id="...">`、`<filter id="...">` 等の **id 属性が衝突**し、2 つめ以降の `url(#arrowhead)` が 1 つめを参照して矢印消失等の崩壊を起こす(Expert O/A/G 一致、外部解説あり)。

**対策**:
1. `--svgId <一意ID>` で SVG ルート ID を一意化(部分対応)
2. SVG 後処理で `id` 属性と `url(#xxx)` 参照を `{originalId}-{requestId}` に一括 rename(完全対応)
3. または `deterministicIDSeed` を request ごとに変える

→ 本改修で**確実に対処すべき**項目(配布 HTML embed が主目的のため)。

### 3.3 `useMaxWidth: false` の挙動

- `true`(現状デフォルト): `<svg width="100%" height="100%" style="max-width: <px>px" viewBox="...">`
- `false`: `<svg width="<W>" height="<H>" viewBox="...">` (★ `max-width` インラインスタイル消失)

配布 HTML 側の responsive 化は **`viewBox` を残したまま CSS で `svg { max-width:100%; height:auto }` を当てる**のが標準パターン。Expert O/A/G 一致。

### 3.4 `htmlLabels: false` の既知未解決バグ(v11.11+)

Expert A が具体 Issue 番号付きで提示、Mermaid GitHub で確認可能:

| Issue | 内容 | 状態 |
|---|---|---|
| [#7015](https://github.com/mermaid-js/mermaid/issues/7015) | エンティティコード(`#quot;` `#9829;` 等)が効かない | Approved Bug, v11.11.0 検証 |
| [#7016](https://github.com/mermaid-js/mermaid/issues/7016) | `<`,`>`,`\*` 等の特殊文字が消える/置換される | v11.11.0 |
| [#1177](https://github.com/mermaid-js/mermaid/issues/1177) | 複数行テキストが水平中央寄せされない | long-open |
| PR #7276 (v11.13.0) | `markdownAutoWrap:false, htmlLabels:false` の組合せ修正中 | 半端状態 |

→ **`htmlLabels: false` を無条件デフォルト化するのはリスク高**(2026-05 時点)。後述 §6.1 の方針に反映。

### 3.5 ELK レンダラ(v11 系)

- v11 では `@mermaid-js/layout-elk` という**別パッケージ**(mermaid 本体には含まれない)
- mermaid-cli は bundle 済 → **mmdc 経由ならそのまま使える**
- 推奨構文: フロントマター `layout: elk` または config root の `layout: "elk"`(v11)
- 旧構文 `flowchart.defaultRenderer: 'elk'` は v10 由来。v11 でも互換的に動く実装はあるが、新統合レンダラ経由になり挙動差あり
- 既知の副作用(Expert A):
  - [#4813](https://github.com/mermaid-js/mermaid/issues/4813): title 消失、点線矢印スタイル落ち
  - [#5402](https://github.com/mermaid-js/mermaid/issues/5402): empty subgraph で null 参照エラー
  - subgraph と組み合わせるとレイアウト破綻するケースあり

→ **デフォルト採用はしない、opt-in のみ**が安全。

### 3.6 `mmdc` エラー出力の現状

- 構造化 JSON エラー出力フラグは無し(`src/index.js` の commander 定義から確認)
- パースエラーは stderr に「`Parse error on line N:`」形式で出る
- `mermaid.parse()` JS API なら構造化エラー `{str, hash: {text, token, line, loc, expected}}` を取得可能 → programmatic API 採用時に活かせる

安定して行番号を抽出できる正規表現(複数情報源で一致):

```js
/Parse error on line\s+(\d+):/i
/Lexical error on line\s+(\d+)\.?/i
```

ただし [#3853](https://github.com/mermaid-js/mermaid/issues/3853) で **行番号がずれるバグが long-open** — Markdown 経由や特定図種で +1〜数行ずれることがある。完全な信頼は不可、UI 側で「N行目付近」表現にするのが安全。

### 3.7 `themeCSS` による foreignObject clip 回避策

Expert A/O 一致(外部 issue/コミュニティ回答で実証):

```json
"themeCSS": ".label foreignObject { overflow: visible; }"
```

→ `htmlLabels: true` のまま(Markdown / エンティティ等の機能を保ったまま)、foreignObject 境界での clip を抑制できる。SVG ルート内の `<style>` に焼き込まれるので配布 HTML 側 CSS の影響を受けない。

---

## 4. 確実なリスクとガードレール

複数専門家が独立して指摘(高信頼):

| リスク | 対策 |
|---|---|
| **XSS**(AI 生成 Mermaid に `<script>` や `click ... call ...` が混入する可能性) | `securityLevel: "strict"` を**サーバ側で固定**、ユーザー override で `loose` を許可しない |
| **入力肥大化 DoS** | `maxTextSize` (50000) / `maxEdges` (500) を schema デフォルト遵守、HTTP body size 制限、`timeout_ms` 上限、並列実行数 (`MAX_CONCURRENT_RENDERERS`) を維持 |
| **temp ファイル衝突**(現行 `renderer.render` で `${requestId}.mmd/.svg/.png` を共有 dir に作る) | `requestId` ベースでユニーク化済 → そのまま継承可、追加で `mkdtemp` でリクエスト専用 dir を作ると更に堅い |
| **ID 衝突**(§3.2) | 必須対応 |
| **エラー時に "Syntax error" 図が混入** | `suppressErrorRendering: true` を有効化 |

---

## 5. 専門家間で意見が分かれた点(参考)

「確実 ≥97%」とは言えないが、判断材料として記録:

| 論点 | Expert O | Expert A | Expert G |
|---|---|---|---|
| `htmlLabels: false` をデフォルト化 | **Yes**(clip 根治優先) | **No**(v11.11+ バグ多数、`themeCSS overflow visible` を推奨) | **No**(Markdown 失われる、Web font @import 推奨) |
| ELK の扱い | opt-in (`beautiful-elk` preset) | opt-in + 回帰テスト必須 | `beautiful` の中に組み込む推奨 |
| 配布用フォント戦略 | system-ui stack に寄せる | system-ui stack + CJK fallback chain | Web font を `themeCSS @import` で焼き込む |
| `nodeSpacing` 推奨値 | 40 | 30 | 40 |
| 配布 HTML 用 `securityLevel` | strict | strict | strict |

**評価**: clip 対策は「`htmlLabels: false` 一択ではなく、`themeCSS` で foreignObject overflow を visible にする手段がある」という Expert A/G の代替案が新情報で、信頼性 ≥97%(外部実証あり)。**`htmlLabels: false` をデフォルト化する初期方針は再検討すべき**。

---

## 6. 本改修に直接持ち込む方針への影響(高信頼項目のみ)

§1〜§4 の確実情報から、要件定義書の**技術的制約**として転記する内容:

### 6.1 clip 対策メカニズム

- `htmlLabels: false` での foreignObject 回避は v11.11+ で複数の open バグあり(§3.4)。デフォルト化せず、代替として **`themeCSS: ".label foreignObject { overflow: visible }"`** を `beautiful` のデフォルトに含める方向で検証する
- `htmlLabels: false` は opt-in パラメータとして残す(Markdown を一切使わないと分かっている利用者向け)

### 6.2 ノード内余白

> **2026-05-16 アップデート(実測ベース)**: 当初は schema コメント「Only used in new experimental rendering」を文字通り受け取り「`dagre-wrapper` では効かない前提」としていたが、実機検証で本リポジトリ構成(Mermaid `11.15.0` bundled、`dagre-wrapper`、`htmlLabels: true`)でも `flowchart.padding` が線形に効くことを確認したため、本節の方針を改訂する。

- **改訂後**: `flowchart.padding` を `beautiful` preset の中で活用できる。実測関係 `内側余白(横) = 4 × padding`、`内側余白(縦) = 2 × padding`(Mermaid default 15 → `60 × 30`、推奨 `padding=8 → 32 × 16`)。具体値は `design.md` §3.1 BEAUTIFUL_DEFAULTS に集約
- schema コメント由来の挙動保証は無いため、Mermaid 依存更新時(NFR-02)は画像差分で本前提が崩れていないか再検証する
- ELK 採用は引き続き opt-in のみ(別解として残すが、`flowchart.padding` で内側余白問題が解決したため第一選択ではなくなった)

### 6.3 配布 HTML 対応(必須)

- `flowchart.useMaxWidth: false` をデフォルトに(§3.3、`max-width` インラインスタイルが消える)
- **ID 衝突対策は必須実装**(§3.2):`--svgId` 指定 + SVG 後処理で id/url 参照を request-scoped にリネーム

### 6.4 アーキテクチャ移行候補

- 現行 `mmdc` subprocess 方式を `renderMermaid()` programmatic API + Puppeteer browser pool に切替候補とする(§2.3、§3.1)
- これにより:
  - 一時 config ファイル不要(`mermaidConfig` 直渡し)
  - 1-2 秒の起動オーバーヘッド削減
  - `mermaid.parse()` 構造化エラー取得が可能(§3.6)
- ただし mermaid-cli README は "NodeJS API is not under semver" 警告あり → アップデート時の検証コストを許容するか別途判断

### 6.5 エラー応答

- mmdc は構造化エラー出力フラグなし(§2.2)、stderr パースが現状解
- 行番号抽出は `/Parse error on line\s+(\d+):/i` で抽出可能だが、Mermaid 側に行番号ずれバグあり(§3.6) → UI 表現は「N 行目付近」が安全
- 日本語化は**英語原文併記**(`message_en` + `message_ja`)が複数専門家一致(AI 自己修復・GitHub Issue 照合に英語必要)
- `suppressErrorRendering: true` をデフォルト有効(§4)

### 6.6 セキュリティ・リミット(変更なしで継承)

- `securityLevel: "strict"` をサーバ側で**固定**(ユーザー override 不可)
- `maxTextSize: 50000` / `maxEdges: 500` を schema デフォルト遵守
- 既存の `MAX_CODE_SIZE`(50KB)、`MAX_CONCURRENT_RENDERERS`、`DEFAULT_TIMEOUT_MS` を維持

---

## 7. 参照ソース(一次)

- Mermaid 設定 schema(develop): https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/schemas/config.schema.yaml
- Mermaid 公式 schema docs: https://mermaid.js.org/config/schema-docs/config.html
- Mermaid Flowchart config: https://mermaid.js.org/config/schema-docs/config-defs-flowchart-diagram-config.html
- `@mermaid-js/mermaid-cli` `package.json`(master): https://raw.githubusercontent.com/mermaid-js/mermaid-cli/master/package.json
- `@mermaid-js/mermaid-cli` `src/index.js`(master): https://raw.githubusercontent.com/mermaid-js/mermaid-cli/master/src/index.js
- `@mermaid-js/layout-elk`(npm): https://www.npmjs.com/package/@mermaid-js/layout-elk
- 主要 Issue:
  - htmlLabels=false エンティティコード問題 [#7015](https://github.com/mermaid-js/mermaid/issues/7015)
  - htmlLabels=false 特殊文字問題 [#7016](https://github.com/mermaid-js/mermaid/issues/7016)
  - htmlLabels=false 複数行中央寄せ問題 [#1177](https://github.com/mermaid-js/mermaid/issues/1177)
  - 行番号ずれ [#3853](https://github.com/mermaid-js/mermaid/issues/3853)
  - ELK title/arrow style 喪失 [#4813](https://github.com/mermaid-js/mermaid/issues/4813)
  - ELK empty subgraph クラッシュ [#5402](https://github.com/mermaid-js/mermaid/issues/5402)
  - mermaid.parse 構造化エラー [#1775](https://github.com/mermaid-js/mermaid/issues/1775)
- 関連調査: `../svg-padding-investigation/REPORT.md`
