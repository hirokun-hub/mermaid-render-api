# foreignObject 内側センタリング設計書 (REQ-U-10) — 2026-05-17

| 項目 | 値 |
|---|---|
| 設計対象 | F-2: `forceForeignObjectInnerCentered` (新規 post-process) |
| 親トピック | REQ-U-09 (F-1: `forceForeignObjectOverflowVisible`) の続き |
| 対象ブランチ | `investigate/state-diagram-padding` (現在) もしくは派生ブランチ |
| 担当 | (別開発者にアサイン) |
| 所要見積 | 2-3 時間 (実装 1h + テスト 1h + 報告 1h) |

---

## 1. 背景 & 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [`docs/text-right-shift-investigation-2026-05-17.md`](./text-right-shift-investigation-2026-05-17.md) | 右寄り現象の事実確認 / 根本原因分析 / 改善案 |
| [`docs/text-right-shift-investigation-2026-05-17/`](./text-right-shift-investigation-2026-05-17/) | 再現素材 (case-clip / case-short / extreme/) |
| [`docs/text-right-shift-investigation-2026-05-17/extreme/measurements.json`](./text-right-shift-investigation-2026-05-17/extreme/measurements.json) | **修正前ベースライン** (本ドキュメントの受入条件で参照) |
| [`docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md`](./svg-foreignobject-overflow-fix-verification-2026-05-16.md) | F-1 検証 (本件は同シリーズ) |
| [`.kiro/specs/beautiful-svg-rendering/requirements.md`](../.kiro/specs/beautiful-svg-rendering/requirements.md) | REQ-U-09 が定義済 (REQ-U-10 はここに追記する) |

### 1.1 解決したい問題 (要約)

Mermaid `dagre-wrapper` + `htmlLabels` で出力される SVG のラベル `<foreignObject>` 内部の `<div style="display:table-cell">` は **左端アンカー (left-anchored)** で配置される。

事前計算した foreignObject 幅 (Docker / Puppeteer のフォント環境) と、実描画幅 (利用者ブラウザのフォント環境) が異なる場合 (`✓` / 絵文字 / 一部 ASCII)、内側 cell が foreignObject より広くなり、F-1 (`overflow:visible`) によって **右側にだけ可視オーバーフロー** が発生し、視覚上テキストが右に寄って見える (実測 +16.27 px / `extreme/ex09-many-checks`)。

### 1.2 解決方針

内側 cell を foreignObject の **中央アンカー (center-anchored)** にする。cell が foreignObject より広いケースでも、オーバーフローが **左右均等** に分散し、ノードの視覚的重心が rect 中心に一致する。

---

## 2. 要件 (REQ-U-10)

### REQ-U-10: foreignObject 内側ラベル要素のセンタリング強制

| 項目 | 内容 |
|---|---|
| **トリガ** | `format === 'svg'` のレスポンス (PNG は対象外、F-1 と同じ方針) |
| **入力条件** | SVG 文字列内に `<foreignObject>` 直下の `<div xmlns="http://www.w3.org/1999/xhtml" style="...display:table-cell..." >` が存在する |
| **出力保証** | 該当 div が `<div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;justify-content:center;align-items:center;width:100%;height:100%">` のラッパで包まれている |
| **冪等性** | 二回適用しても結果は同じ (二重ラップしない) |
| **影響範囲外** | 既に `display:flex` でラップ済の foreignObject、`display:table-cell` 以外の inner div、SVG 以外の format |

### 2.1 受入条件 (extreme/measurements.json ベースライン → extreme-after/measurements.json 比較)

| ID | 条件 | 根拠 |
|---|---|---|
| AC-1 | **修正後に新規生成する** `docs/text-right-shift-investigation-2026-05-17/extreme-after/measurements.json` の **全 24 行 (12 cases × 2 nodes)** で `\|shift_px\| < 2.0`。比較対象 (修正前ベースライン) は `extreme/measurements.json` | rect 中心 ±2px 以内。HTML レンダリングのサブピクセル誤差 (フォントヒンティング・小数 transform) を許容し、視覚的に「真ん中」と判定できる閾値として 2px を採用 |
| AC-2 | 既存 F-1 単体テスト (`test/unit/postProcess.foreignObjectOverflow.test.ts`) と property テスト (`test/property/prop-18_force_foreignobject_overflow.property.test.ts`) は全て pass | 既存契約を壊さない (REQ-U-09 回帰なし) |
| AC-3 | 新規 F-2 単体テスト (`test/unit/postProcess.foreignObjectInnerCenter.test.ts`) 14 件と property テスト (`test/property/prop-19_*.test.ts`) が pass | 設計通り |
| AC-4 (単体テスト境界) | `applyPostProcess({format:'png',...})` の単体テストで F-2 のラッパ DOM が出力に含まれない | F-1 と同じ方針 (postProcess の format=png 早期 return が機能していることの単体確認) |
| AC-5 | 後述の **回帰チェックリスト** (§4.3.5) で挙げた SVG パターン (flowchart / state diagram / edge label / cluster / 0×0 fO) で破綻なし | 副作用がない |
| AC-6 | 視覚回帰スクリーンショット (§4.3.4 の手順、Phase 5 で撮影) で **修正前 (`extreme-overview.png`) → 修正後 (`extreme-overview-after.png`)** で右寄りが消えていることを目視確認 | 人間判定 |

### 2.2 PNG 出力の担保

PNG は元々 Puppeteer 内で完結するため shift_px は **既にほぼ 0**。F-2 が PNG パスに影響しないことの **正式担保は AC-4 (単体テスト)** に寄せる。実 API での `sha256sum` 比較は image build / env / Chromium 内部差まで拾うため、**F-2 だけを切り分けた担保にならない** (= 失敗時に F-2 起因とは断定できない)。

| ID | 種別 | 条件 |
|---|---|---|
| **AC-4** (正式) | 単体テスト | `applyPostProcess({format:'png',...})` で F-2 の DOM ラッパが出力に含まれない & 入力バッファと完全バイト一致 (§4.1 #13) |
| AC-P-1-Ref (参考検証、必須ではない) | 結合テスト | 同一入力 12 ケースを **本番 (port 3100) と修正後 test (port 3101)** にそれぞれ投げた PNG レスポンスの `sha256sum` を比較し、差が出たら **F-2 起因と限らないため** 個別に切り分け調査 (image digest / `.env` / Chromium 起動オプション / フォント可用性差) を報告書に記録する |

**AC-P-1-Ref が一致しなかった場合の対処**: 必ずしも F-2 のバグではない。次の差分を確認:
1. `docker compose images` の image digest 比較 (`mermaid-render-api` vs `mermaid-render-api-test`)
2. `.env` vs `.env.test` の差分 (本リポジトリは差分あり: `RENDERER_MODE` / `PNG_RENDER_SCALE` / `BROWSER_POOL_SIZE` 等が test 側で明示設定)
3. Chromium バージョン / フォントキャッシュ状態

切り分けた結果 F-2 起因と判明した場合のみ、本実装の見直し対象とする。**F-2 の正式合格は AC-4 で担保済**。

---

## 3. 実装仕様

### 3.1 ファイル変更箇所

| ファイル | 変更 |
|---|---|
| `src/renderer/postProcess.ts` | `forceForeignObjectInnerCentered` 関数を追加 (40-50 行)、`applyPostProcess` から呼び出し (1 行) |
| `test/unit/postProcess.foreignObjectInnerCenter.test.ts` | **新規作成** (80-100 行、テスト 14 件、§4.1 の表の通り) |
| `test/property/prop-19_force_foreignobject_inner_center.property.test.ts` | **新規作成** (40-60 行、`prop-18` を雛形に) |
| `.kiro/specs/beautiful-svg-rendering/requirements.md` | REQ-U-10 セクション追加 (REQ-U-09 の直後、§ 構造を真似る) |
| `.kiro/specs/beautiful-svg-rendering/design.md` | §7 配下に F-2 設計サブセクション追加 (REQ-U-09 と並列) |
| `.kiro/specs/beautiful-svg-rendering/tasks.md` | Phase 7 (F-2) として F-2 タスクブロックを追加。**(本ドキュメントを以て AGENTS.md line 20 の「ユーザーから明確な指示」とみなし、新規 Phase 追加を許可する。本許可はこの F-2 タスク追加のみに有効で、既存 Phase 0-6 のタスク名・ID・並び・本文は変更禁止。)** |
| `docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md` | line 107-111 の「symmetric」記述を「F-2 適用後は本当に左右対称」と修正 |

### 3.2 DOM 構造 (Before / After)

**修正前** (Mermaid 11.15.0 が生成、F-1 適用後):

```html
<foreignObject style="overflow:visible" width="141.55" height="48">
  <div xmlns="http://www.w3.org/1999/xhtml"
       style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;">
    <span class="nodeLabel"><p>✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓</p></span>
  </div>
</foreignObject>
```

**修正後** (F-2 適用):

```html
<foreignObject style="overflow:visible" width="141.55" height="48">
  <div xmlns="http://www.w3.org/1999/xhtml"
       style="display:flex;justify-content:center;align-items:center;width:100%;height:100%">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;">
      <span class="nodeLabel"><p>✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓</p></span>
    </div>
  </div>
</foreignObject>
```

**差分**: 外側 div (flex ラッパ) を 1 段追加するのみ。既存 `display: table-cell` 内側 div は **そのまま保持** (縦方向の baseline / line-height 挙動を温存)。

### 3.3 CSS プロパティの根拠

| プロパティ | 値 | 役割 |
|---|---|---|
| `display:flex` | フレックスボックス (`flexible box layout`) を有効化 | 子要素の配置制御 |
| `justify-content:center` | 主軸方向の中央寄せ | 横方向で内側 cell をセンタリング |
| `align-items:center` | 交差軸方向の中央寄せ | 縦方向で内側 cell をセンタリング (vertical-align: middle 相当を維持) |
| `width:100%;height:100%` | 親 (foreignObject) を満たす | flex コンテナが fO 全体に広がり、内部の中央配置基準を fO 中心と一致させる |
| (内側 div の `display:table-cell` は維持) | - | 既存の line-height / max-width / white-space:nowrap の挙動を変えない |

### 3.4 XHTML 名前空間

`<foreignObject>` の中は **XHTML として解釈** されるため、ラッパ div には `xmlns="http://www.w3.org/1999/xhtml"` (XHTML名前空間 / XHTML namespace) を必ず付与する。付与しないと SVG 要素として扱われ flex が効かない。

### 3.5 関数シグネチャ & 実装スケッチ

`src/renderer/postProcess.ts` 内、F-1 (`forceForeignObjectOverflowVisible`) の直下に並列で追加する:

```ts
// 内側コンテンツに <div ネストがない場合のみマッチ させるため、
// tempered greedy token `(?:(?!<div\b)[\s\S])*?` を使う。
// これにより § 3.5.1 fallback (a) と PROP-19 P-4 (no-op 固定) を満たす。
const INNER_DIV_TABLECELL_PATTERN =
  /(<foreignObject\b[^>]*>)(\s*)(<div\b[^>]*xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"[^>]*style="[^"]*display:\s*table-cell[^"]*"[^>]*>)((?:(?!<div\b)[\s\S])*?)(<\/div>)(\s*)(<\/foreignObject>)/gi

const FLEX_WRAPPER_OPEN =
  '<div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;justify-content:center;align-items:center;width:100%;height:100%">'

export function forceForeignObjectInnerCentered(svg: string): string {
  return svg.replace(
    INNER_DIV_TABLECELL_PATTERN,
    (_match, foOpen, ws1, divOpen, divContent, divClose, ws2, foClose) =>
      `${foOpen}${ws1}${FLEX_WRAPPER_OPEN}${divOpen}${divContent}${divClose}</div>${ws2}${foClose}`
  )
}
```

**ネスト div 除外の仕組み (P-4 担保)**:
- `(?:(?!<div\b)[\s\S])*?` は **「`<div` で始まらない任意の 1 文字」を非貪欲に繰り返す** パターン (tempered greedy token / テンパード貪欲トークン)。
- 入力に `<foreignObject><div ... display:table-cell><div>NESTED</div></div></foreignObject>` のような **ネスト div** が含まれる場合、開始 table-cell div の直後で `<div>NESTED` を発見した時点で negative lookahead `(?!<div\b)` が false となりマッチ失敗 → **no-op** (= P-4 期待値を満たす)。
- 一方、Mermaid 11.15.0 現行出力 (`<span><p>...</p></span>` のみ、`<div>` ネストなし) では問題なくマッチして flex ラップが入る。

**冪等性の根拠**: 正規表現は `display:\s*table-cell` のみマッチ。1 回適用後の外側 div は `display:flex` なのでマッチせず、内側 div (`table-cell`) は 1 階層深くなるが foreignObject 直下ではない (= `(<foreignObject\b[^>]*>)` 直後ではない) のでマッチしない。さらに、ラップ後の構造は **外側 flex div の内部に内側 table-cell div が `<div>` ネストとして存在する** ため、上記 tempered token が両方ともマッチ失敗を保証 → **二回目以降は完全 no-op**。

#### 3.5.1 正規表現の **適用範囲制約 (重要)**

本 regex は **Mermaid 11.15.0 系の現行 SVG 出力** にのみ動作保証する。具体的に次の前提に依存する:

| 前提 | 現行 Mermaid 出力 | 違反したらどうなる |
|---|---|---|
| foreignObject 直下の最初の子は `<div xmlns="http://www.w3.org/1999/xhtml" style="...display:table-cell...">` | 全 fO で成立 (調査 SVG 8 サンプル確認済) | マッチせず F-2 が no-op (= 現状維持、害なし) |
| inner div の **中身に `<div>` のネストがない** (`<span>` `<p>` のみ) | 全 fO で成立 (調査済) | §3.5 の tempered greedy token (`(?:(?!<div\b)[\s\S])*?`) によりマッチせず no-op (= 現状維持、SVG 構造保護)。PROP-19 P-4 で固定担保 |
| inner div 属性は **ダブルクォート** `"..."` | 全 fO で成立 | シングルクォートだとマッチせず no-op (現状維持) |
| inner div 属性順: `xmlns` が `style` より **前** | 全 fO で成立 | 順序逆だとマッチせず no-op (現状維持) |
| 属性内に改行なし | 全 fO で成立 | 改行入りだとマッチせず no-op (現状維持) |

**ネスト div の扱い (本フェーズの設計合意 = fallback (a) 採用)**:

本フェーズでは方針 **(a) 「ネスト div 非対応 / 該当ケースは no-op」** を採用済み。これは以下の理由による:

- Mermaid 11.15.0 系の実出力では inner div にネストはなく、(a) で実害なし
- (b)/(c) は実装範囲を広げる別判断 (依存追加 or 高度な regex) であり、本フェーズの設計合意外

**実装はこの (a) 方針が成立するように regex を作ること**: 具体的には regex がネスト div 入力でマッチしない (= no-op になる) ことを **PROP-19 P-4 が固定期待値で担保** する。P-4 が失敗した場合は実装側を修正 (regex を絞る) するのが正しい対応 — 詳細は §4.2 P-4 参照。

将来 Mermaid 出力構造が変わった場合の検出経路:

1. **PROP-19 P-3 (構造保存)** が継続的に走り、`<foreignObject>` タグ数の保存が崩れたら即時検知。
2. **dependency-upgrade 時の必須確認** (実装者は PR description にも記載):
   - `package.json` で `mermaid` / `@mermaid-js/mermaid-cli` のバージョン pin を上げる際は、**12 ケースの SVG を再生成して inner div 構造が変わっていないことを目視確認**。
   - 変わっていたら **本フェーズ外** として方針 (b) / (c) の採否を設計者と相談 (本 F-2 設計書の改訂対象)。

`applyPostProcess` での呼び出し (F-1 の直後):

```ts
if (input.format === 'png') { /* ... existing PNG return ... */ }

let svg = input.data.toString('utf8')

svg = forceForeignObjectOverflowVisible(svg)
svg = forceForeignObjectInnerCentered(svg)   // ← 新規

if (input.postProcess?.strip_max_width) { /* ... */ }
```

### 3.6 含意 (副作用の整理)

| ケース | 修正前 | 修正後 |
|---|---|---|
| cell 幅 = fO 幅 (予測通り) | 中央 (cell が fO 全体を埋める) | 中央 (flex で中央配置、同じ結果) |
| cell 幅 < fO 幅 (Mermaid 過大評価) | 左寄り (cell が fO 左端に貼り付く) | **中央** (flex で中央配置) |
| cell 幅 > fO 幅 (Mermaid 過小評価) | 右寄り (cell が fO 右にハミ出る) | **中央** (オーバーフローが左右対称に分散) |
| 0×0 fO (edge label 背景) | - | flex ラッパが入るが 0×0 なので無視 |
| cluster label / subgraph title | (未検証、§5 で確認) | 同じ DOM 構造なら同じ効果 |

---

## 4. テスト仕様

### 4.1 単体テスト (`test/unit/postProcess.foreignObjectInnerCenter.test.ts`)

`postProcess.foreignObjectOverflow.test.ts` を雛形にして以下の **14 件** を実装:

| # | テスト名 | 入力 (svg 抜粋) | 期待結果 |
|---|---|---|---|
| 1 | wraps table-cell div with flex wrapper | `<foreignObject><div xmlns="..." style="display: table-cell">text</div></foreignObject>` | flex ラッパが入る |
| 2 | preserves inner div attributes verbatim | (上記 + `class="labelBkg"` 等) | 内側 div の class / style / 子要素が完全保持 |
| 3 | does not modify foreignObject without table-cell div | `<foreignObject><div xmlns="..." style="display: block">text</div></foreignObject>` | 変更なし |
| 4 | does not modify foreignObject without inner div | `<foreignObject></foreignObject>` | 変更なし |
| 5 | idempotent (double apply yields same result) | (任意の foreignObject) | `f(f(x)) === f(x)` |
| 6 | does not double-wrap (re-application no-op) | 既に flex ラップ済 | 変更なし |
| 7 | processes multiple foreignObjects independently | fO 3 つ (table-cell / block / table-cell) | 1番目と3番目だけラップ |
| 8 | case-insensitive for foreignObject tag | `<FOREIGNOBJECT>...<div ...display: table-cell...></div></FOREIGNOBJECT>` | ラップされる |
| 9 | empty string unchanged | `''` | `''` |
| 10 | preserves CJK / emoji content in inner text | `<foreignObject><div xmlns="..." style="display: table-cell"><span>集める ✓</span></div></foreignObject>` | 中身保持 |
| 11 | 0×0 foreignObject still wrapped (no error) | `<foreignObject width="0" height="0"><div ... display: table-cell></div></foreignObject>` | ラップされる (無害) |
| 12 | (applyPostProcess) F-2 runs for format=svg | applyPostProcess 経由 | flex ラッパが出る |
| 13 | (applyPostProcess) F-2 does NOT run for format=png (AC-4 担保) | applyPostProcess 経由で `Buffer.from(...PNG bytes...)` を投入 | 入力バッファと出力バッファが `Buffer.compare === 0` (バイト一致) |
| 14 | (applyPostProcess) F-1 + F-2 を併用、F-1 が先 | foreignObject に style なし | `style="overflow:visible"` と flex ラッパの両方 |

### 4.2 プロパティテスト (`test/property/prop-19_force_foreignobject_inner_center.property.test.ts`)

`prop-18` を雛形に、fast-check で次のプロパティを保証:

**P-1: 冪等性 (idempotency)**

```ts
fc.property(arbForeignObjectSvg, (svg) => {
  const once = forceForeignObjectInnerCentered(svg)
  const twice = forceForeignObjectInnerCentered(once)
  expect(twice).toBe(once)
})
```

**P-2: table-cell を含まない fO は不変**

`<foreignObject>` の inner div が `display:table-cell` を含まない場合 (例: `display:block` / `display:inline` / そもそも inner div が存在しない)、出力 = 入力。

**P-3: foreignObject 数の保存 (構造破壊なし)**

任意のランダム SVG (`<foreignObject>` を含むものと含まないもの) に対し、F-2 適用前後で `<foreignObject>` および `</foreignObject>` の出現数が等しい。

```ts
fc.property(arbSvgString, (svg) => {
  const result = forceForeignObjectInnerCentered(svg)
  const beforeOpen = (svg.match(/<foreignObject\b/gi) || []).length
  const afterOpen = (result.match(/<foreignObject\b/gi) || []).length
  const beforeClose = (svg.match(/<\/foreignObject>/gi) || []).length
  const afterClose = (result.match(/<\/foreignObject>/gi) || []).length
  expect(afterOpen).toBe(beforeOpen)
  expect(afterClose).toBe(beforeClose)
})
```

**P-4: ネスト div を含む fO は no-op (固定期待値、§3.5.1 fallback (a) 採用前提)**

`<foreignObject><div xmlns="..." style="display:table-cell"><div>NESTED</div></div></foreignObject>` 形の入力に対し、現実装は **入力 = 出力 (no-op)** であることを期待する。これは §3.5.1 のフォールバック方針 (a) (= 「ネスト div 非対応 / 該当ケースは触らない」) を採用済みであることの反映であり、テスト仕様としての**受入条件 (固定)**。

```ts
fc.property(arbNestedDivForeignObjectSvg, (svg) => {
  const result = forceForeignObjectInnerCentered(svg)
  expect(result).toBe(svg)   // 固定: 入力と完全一致 (no-op)
})
```

**P-4 が fail した場合の扱い**: P-4 失敗は「現実装の regex が想定外にネスト div ケースまでマッチしている」= **仕様違反**。テスト期待値を変えるのではなく、**実装側を修正** (= regex を `display:\s*table-cell` 直近の `</div>` のみマッチに絞り、ネスト div 入力ではマッチしない形にする) するのが正しい対応。

具体的な実装修正の方針:
- regex で内部の `<div>` が出現しないことをアサート (negative lookahead: `(?![\s\S]*?<div)`) するのが最小コスト
- 構造的にネストを許容したい場合は §3.5.1 fallback (b)/(c) (greedy 終端 / parser 利用) への移行となるが、**それは別 PR 扱い** とし、設計者と相談すること

**実装者が独断で fallback (b)/(c) に切り替えるのは禁止**。本フェーズの設計合意は (a) = no-op 固定。

### 4.3 結合テスト (Docker port 3101 で実 API を叩く)

#### 4.3.1 環境準備

本リポジトリには既に **test サービス** が定義済 (`docker-compose.yml` の `mermaid-render-api-test`、port 3101, profile=test, `.env.test` 使用)。本番 (`mermaid-render-api`, 3100) と **並走** できる。

```bash
# 本番 (3100) はそのまま稼働継続。
# 修正コードを含めた image をビルドし、test サービス起動。
docker compose --profile test build mermaid-render-api-test
docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml --profile test up -d mermaid-render-api-test

# ヘルスチェック
curl -s http://127.0.0.1:3101/healthz   # → ok
curl -s http://127.0.0.1:3101/readyz    # → ok
curl -s http://127.0.0.1:3101/livez     # → ok
```

#### 4.3.2 12 ケース再生成 (修正後)

`docs/text-right-shift-investigation-2026-05-17/extreme/cases.json` の 12 ケースを **port 3101 (修正後コード)** に投げ、`docs/text-right-shift-investigation-2026-05-17/extreme-after/` に保存:

```bash
mkdir -p docs/text-right-shift-investigation-2026-05-17/extreme-after
cd docs/text-right-shift-investigation-2026-05-17

python3 - << 'PY'
import json, subprocess
cases = json.load(open('extreme/cases.json'))
for k, src in cases.items():
    for fmt in ('svg','png'):
        req = json.dumps({"code": src, "format": fmt}, ensure_ascii=False)
        out_file = f"extreme-after/{k}.{fmt}"
        subprocess.run(
            ["curl","-s","-o",out_file,
             "-X","POST","-H","Content-Type: application/json",
             "--data-binary","@-","http://127.0.0.1:3101/render"],
            input=req.encode('utf-8'))
        print(f"{k} {fmt} OK")
PY
```

#### 4.3.3 shift_px 計測 (修正後)

既存の `extreme/measure-all.html` を `extreme-after/measure-all.html` にコピーして使用。HTTP server 経由で開き、Playwright で `document.getElementById('out').textContent` を取得 (`docs/text-right-shift-investigation-2026-05-17.md` §8 の手順と同じ)。

得られた JSON を `extreme-after/measurements.json` として保存し、`extreme/measurements.json` (修正前) と並べて比較。

**判定**: 全 24 行で `|shift_px| < 2.0` ならば AC-1 達成。

#### 4.3.4 視覚比較スクリーンショット

`viewer-extreme.html` の `data="extreme/..."` を `data="extreme-after/..."` に書き換えたコピーを作成し、Playwright で同条件 (viewport 900×1100) でスクリーンショットを撮影:

- 修正前: `extreme-overview.png` (既存、コミット済)
- 修正後: `extreme-overview-after.png` (新規)

両者を並べて、ex09 / ex01 / ex02 / ex10 / ex03 / ex04 / ex07 の **赤破線とテキスト重心が一致** していることを目視確認。

#### 4.3.5 回帰チェックリスト (副作用確認)

§ 2.1 AC-5 を満たすため、以下のパターンも修正後 SVG を生成して**目視で破綻なし**を確認:

| ケース | 入力 |
|---|---|
| 単純 flowchart | `flowchart LR\n  A --> B` |
| 複数行ラベル | `flowchart LR\n  A["集める ✓<br>(PrimeDrive 自動)"] --> B["完了"]` |
| State diagram (simple) | `stateDiagram-v2\n  [*] --> A\n  A --> B\n  B --> [*]` |
| State diagram (composite) | `stateDiagram-v2\n  state Active {\n    [*] --> X\n    X --> Y\n  }` |
| Edge label | `flowchart LR\n  A -->|処理| B` |
| Subgraph (cluster) | `flowchart LR\n  subgraph S1\n    A --> B\n  end` |
| 短文のみ (元々中央) | `flowchart LR\n  A["了"] --> B["完了"]` |

各ケースの SVG を `docs/text-right-shift-investigation-2026-05-17/regression-after/` に保存し、ブラウザで開いて破綻 (テキスト位置の崩れ、欠落、レイアウト崩壊) がないことを確認。

---

## 5. テスト後の報告書 (必須成果物)

### 5.1 出力先

`docs/foreignobject-inner-centering-verification-2026-05-17.md` (本ドキュメントと同階層、検証側として新規作成)

### 5.2 必須セクション (テンプレート)

外側は 4 連バッククォート (内側に ` ```bash ` ブロックを含むため)。テンプレートをコピーする時は外側 4 連を 3 連に直してから使用すること。

````markdown
# foreignObject 内側センタリング検証 (REQ-U-10) — YYYY-MM-DD

## 環境
- ブランチ / コミット SHA
- Docker compose 構成 (port 3101, .env.test)
- Mermaid version 一覧 (実体は transitive dependency なので **必ず実解決バージョン** を記録):
  ```bash
  npm ls mermaid @mermaid-js/mermaid-cli
  # 例:
  # mermaid-render-api@1.0.0
  # └─┬ @mermaid-js/mermaid-cli@11.14.0
  #   └── mermaid@11.15.0
  ```
  (`package.json` には `@mermaid-js/mermaid-cli@11.14.0` しか書かれていないが、実描画する `mermaid` 本体は transitive 解決でバージョン異なるので注意)
- 検証実施者 / 実施日時

## 単体テスト結果
- `npm test -- postProcess.foreignObjectInnerCenter` の出力サマリ
- `npm test -- prop-19` の出力サマリ
- 既存 F-1 テストが全て pass (REQ-U-09 回帰なし)
- (失敗があれば: 何が、なぜ、どう対処したか)

## 結合テスト結果

### shift_px (12 ケース、修正前 → 修正後)
| case | node | text | shift_px (before) | shift_px (after) | 判定 |
|---|---|---|---:|---:|---|
| ex09-many-checks | A-0 | "✓ × 10" | +16.27 | (実測値) | OK/NG |
| ex01-emoji-pile | A-0 | "✅✅✅ 集める ✅✅✅" | +13.12 | ... | ... |
| ... | (全 24 行) | | | | |

全 24 行で `|shift_px| < 2.0` か → ✓/✗

### PNG パスへの F-2 不介入 (AC-4 = 正式担保)
- `npm test -- postProcess.foreignObjectInnerCenter` の #13 (format=png バイト一致) が pass
- 結果: ✓ / ✗

### PNG バイト一致 (AC-P-1-Ref = 参考検証)
- 12 ケース × PNG = 12 ファイル、本番 (port 3100) と test (port 3101) で `sha256sum` 比較
- 一致した行数: __/12
- 不一致があれば原因切り分け (image digest / `.env` 差分 / Chromium 環境差) を以下に記録:
  - (記録)
- 結論: F-2 起因 / 環境差起因 / 未判明

## 視覚比較スクリーンショット

### 修正前
![before](./text-right-shift-investigation-2026-05-17/extreme-overview.png)

### 修正後
![after](./text-right-shift-investigation-2026-05-17/extreme-overview-after.png)

### 並列比較ハイライト
- ex09 (`✓ × 10`): before = 右寄り明白 / after = 中央
- ex07 (`iiiiiiiiii` / `WWWWWWWWWW`): before = 左寄り / 右寄り 共存 / after = 両方中央
- (各極端ケースについて 1-2 行コメント)

## 回帰チェックリスト (§4.3.5)
| ケース | SVG 生成 | 視覚確認 | 結果 |
|---|---|---|---|
| 単純 flowchart | OK | OK | ✓ |
| ... | ... | ... | ... |

## 受入条件チェック
| ID | 条件 | 結果 |
|---|---|---|
| AC-1 | 全 24 行で `|shift_px| < 2.0` | ✓ / ✗ |
| AC-2 | 既存 F-1 テスト pass | ✓ / ✗ |
| AC-3 | 新規 F-2 単体 + property テスト pass | ✓ / ✗ |
| AC-4 | PNG 出力 F-2 通らない (単体テスト #13 で `Buffer.compare === 0`) | ✓ / ✗ |
| AC-5 | 回帰チェックリスト全 PASS | ✓ / ✗ |
| AC-6 | 視覚回帰スクリーンショット OK | ✓ / ✗ |
| AC-P-1-Ref | 実 API PNG `sha256sum` 12/12 一致 (差があれば原因切り分け済) | ✓ / ✗ / 環境差で説明可 |

## 結論
- 本 PR をマージしてよいか (Yes / No / Conditional)
- 残課題 (もしあれば)

## 派生発見 (任意)
- 検証中に気づいた既存バグ / 改善ポイントを箇条書き
````

### 5.3 必須コミット対象

| ファイル | 用途 |
|---|---|
| `src/renderer/postProcess.ts` | 実装 |
| `test/unit/postProcess.foreignObjectInnerCenter.test.ts` | 単体テスト |
| `test/property/prop-19_force_foreignobject_inner_center.property.test.ts` | プロパティテスト |
| `.kiro/specs/beautiful-svg-rendering/{requirements,design,tasks}.md` | スペック追記 |
| `docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md` | line 107-111 修正 |
| `docs/foreignobject-inner-centering-verification-2026-05-17.md` | 検証報告書 |
| `docs/text-right-shift-investigation-2026-05-17/extreme-after/` | 修正後 SVG/PNG/measurements |
| `docs/text-right-shift-investigation-2026-05-17/extreme-overview-after.png` | 修正後スクリーンショット |
| `docs/text-right-shift-investigation-2026-05-17/regression-after/` | 回帰チェックリスト用 SVG |

---

## 6. 作業手順 (チェックリスト)

開発者は以下の順で進めること:

### Phase 0: 準備
- [ ] 本ドキュメント + `docs/text-right-shift-investigation-2026-05-17.md` を通読
- [ ] `extreme/measurements.json` を見て、修正前ベースラインを理解
- [ ] 本番 Docker (port 3100) が稼働中であることを確認 (`curl http://127.0.0.1:3100/healthz`)

### Phase 1: 実装
- [ ] `src/renderer/postProcess.ts` に `forceForeignObjectInnerCentered` を追加 (§3.5 のコードスケッチ通り)
- [ ] `applyPostProcess` から呼び出し追加 (F-1 の直後、SVG only)
- [ ] `npm test` でローカル全テストが pass (既存)

### Phase 2: 単体 / プロパティテスト
- [ ] `test/unit/postProcess.foreignObjectInnerCenter.test.ts` を作成 (§4.1 の 14 件)
- [ ] `test/property/prop-19_force_foreignobject_inner_center.property.test.ts` を作成 (§4.2)
- [ ] `npm test` で全テスト pass

### Phase 3: Docker ビルド & test サービス起動
- [ ] `docker compose --profile test build mermaid-render-api-test` で image ビルド
- [ ] `docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml --profile test up -d mermaid-render-api-test` で起動
- [ ] `curl http://127.0.0.1:3101/healthz` で OK 確認
- [ ] 本番 (3100) と test (3101) が同時に動いている (`docker compose ps`)

### Phase 4: 結合テスト (12 極端ケース)
- [ ] `extreme-after/` ディレクトリを作成し、12 ケース × SVG/PNG を port 3101 に投げて生成
- [ ] `measure-all.html` を `extreme-after/` 用にコピー、playwright で計測 → `extreme-after/measurements.json`
- [ ] `extreme/measurements.json` (before) と比較、shift_px 表を作成
- [ ] 全 24 行で `|shift_px| < 2.0` を確認

### Phase 5: 視覚回帰
- [ ] `viewer-extreme.html` のコピー版 (`extreme-after/` 参照) を作成し、playwright でスクリーンショット → `extreme-overview-after.png`
- [ ] 修正前後で並べて確認 (赤破線とテキスト重心の一致)

### Phase 6: 回帰チェックリスト (§4.3.5)
- [ ] 7 パターンの SVG を生成し `regression-after/` に保存
- [ ] ブラウザ等で開いて破綻なしを目視確認

### Phase 7: PNG 確認
- [ ] **AC-4 (正式担保)**: `npm test -- postProcess.foreignObjectInnerCenter` の #13 (format=png バイト一致) が pass していることを確認
- [ ] **AC-P-1-Ref (参考検証)**: 同じ 12 ケースを **port 3100 (本番)** にも投げて PNG を取得し、`sha256sum` で 12 PNG の比較。不一致があれば §2.2 の手順で原因切り分けを行い、報告書にすべて記録 (F-2 起因と決め付けない)

### Phase 8: スペック追記
- [ ] `.kiro/specs/beautiful-svg-rendering/requirements.md` に REQ-U-10 追加
- [ ] `.kiro/specs/beautiful-svg-rendering/design.md` に F-2 設計サブセクション追加
- [ ] `.kiro/specs/beautiful-svg-rendering/tasks.md` に Phase 7 (F-2) ブロックを **末尾追記** (§3.1 の許可注記に従う。既存 Phase は不変)
- [ ] `docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md` line 107-111 修正

### Phase 9: 検証報告書
- [ ] `docs/foreignobject-inner-centering-verification-2026-05-17.md` を §5.2 のテンプレートで作成
- [ ] 全成果物が揃ったことを確認 (§5.3)

### Phase 10: クリーンアップ & コミット
- [ ] **test サービスのみ** を停止・削除する。**`docker compose down` は禁止** (本番 `mermaid-render-api` を巻き込む):
  ```bash
  # サービス名を明示してピンポイントに stop + rm するのが安全
  docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml stop mermaid-render-api-test
  docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml rm -f mermaid-render-api-test
  ```
- [ ] 停止後に本番が稼働継続していることを確認: `docker compose ps` と `curl -sf http://127.0.0.1:3100/healthz`
- [ ] 全変更を 1 つの PR としてまとめてコミット & プッシュ
- [ ] PR description に本ドキュメントと検証報告書へのリンクを記載

---

## 7. 注意事項

- **本番 Docker (port 3100) を停止しない**。test サービス (port 3101) で並走検証する設計。**`docker compose down` 系のコマンドは絶対に使わない** (compose プロジェクト全体を巻き込み本番停止のリスクがある)。停止は必ずサービス名指定の `stop mermaid-render-api-test` + `rm -f mermaid-render-api-test`。
- 検証中に **新しいバグや想定外の挙動** を見つけたら、修正には進まず本ドキュメントの依頼者にエスカレーション。仕様変更が必要な可能性あり。
- 受入条件 AC-5 (回帰) で破綻が見つかった場合、本実装案を **maintain** にせず、依頼者と対応方針を相談。
- `align-items:center` を入れているが、状態遷移図 (state diagram) で **縦方向の baseline が変わって text が上下にズレる** 可能性は zero ではない (foreignObject 内 XHTML レンダリングの細かい挙動依存)。AC-5 の state diagram ケースで実機確認すること。
- `display:table-cell` を **flex item として配置** すると、CSS 仕様上は anonymous table-row + table が生成され flex item として一つの inline-block 相当として扱われる。理論上は問題ないが、Chromium / Firefox 間で挙動差がある可能性があるため、AC-6 で実機確認。
- 縁ハミ出し (state diagram の padding 8px を超えるオーバーフロー時にテキストが rect 枠線に乗る件) は **本フェーズでは無視**。観測されても次フェーズで別チケット化。

---

## 8. 参考: F-1 (REQ-U-09) との対比

| 項目 | F-1 | F-2 (本件) |
|---|---|---|
| 関数 | `forceForeignObjectOverflowVisible` | `forceForeignObjectInnerCentered` |
| 対象 | `<foreignObject>` の `style` 属性 | `<foreignObject>` 直下の `<div>` |
| 手法 | 属性追記 (style に `overflow:visible` 注入) | DOM ラッパ 1 段挿入 (flex 中央配置) |
| 適用フォーマット | SVG のみ | SVG のみ |
| 冪等性 | ✓ | ✓ |
| 既存 themeCSS との関係 | 補完 (themeCSS が `<img>` モードで失効する分を補う) | 独立 (themeCSS では DOM 構造を変えられない) |
| ユーザ可視効果 | 文字切れ防止 | 中央寄せ精度向上 |

---

以上。質問あれば本ドキュメントの依頼者へ。
