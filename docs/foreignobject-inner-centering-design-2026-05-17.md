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

### 2.1 受入条件 (`extreme/measurements.json` ベースライン比較)

| ID | 条件 | 根拠 |
|---|---|---|
| AC-1 | 修正後、`extreme/measurements.json` の **全 24 行 (12 cases × 2 nodes)** で `|shift_px| < 2.0` | rect 中心 ±1px 以内 = 視覚的に中央 |
| AC-2 | 既存 F-1 テスト (`postProcess.foreignObjectOverflow.test.ts` + `prop-18`) は全て pass | 既存契約を壊さない |
| AC-3 | 新規 F-2 単体テスト (`postProcess.foreignObjectInnerCenter.test.ts`) が pass | 設計通り |
| AC-4 | `format=png` のレスポンスは F-2 を**通らない** (バイト一致) | F-1 と同じ方針 |
| AC-5 | 後述の **回帰チェックリスト** で挙げた SVG パターン (flowchart / state diagram / edge label / 0×0 fO) で破綻なし | 副作用がない |
| AC-6 | 視覚回帰スクリーンショット (本ドキュメント §6 で指定) で **修正前→修正後** で右寄りが消えていることを目視確認 | 人間判定 |

### 2.2 受入条件 (PNG 出力)

PNG は元々 Puppeteer 内で完結するため shift_px は **既にほぼ 0** (測定済みで PNG 側のズレ無し)。

| ID | 条件 |
|---|---|
| AC-P-1 | 修正前後で同一入力に対する PNG バイトが一致 (= F-2 が PNG に作用しない) |

---

## 3. 実装仕様

### 3.1 ファイル変更箇所

| ファイル | 変更 |
|---|---|
| `src/renderer/postProcess.ts` | `forceForeignObjectInnerCentered` 関数を追加 (40-50 行)、`applyPostProcess` から呼び出し (1 行) |
| `test/unit/postProcess.foreignObjectInnerCenter.test.ts` | **新規作成** (60-80 行、テスト 10-12 件) |
| `test/property/prop-19_force_foreignobject_inner_center.property.test.ts` | **新規作成** (40-60 行、`prop-18` を雛形に) |
| `.kiro/specs/beautiful-svg-rendering/requirements.md` | REQ-U-10 セクション追加 (REQ-U-09 の直後、§ 構造を真似る) |
| `.kiro/specs/beautiful-svg-rendering/design.md` | §7 配下に F-2 設計サブセクション追加 (REQ-U-09 と並列) |
| `.kiro/specs/beautiful-svg-rendering/tasks.md` | Phase 7 or Patch P-XX として F-2 タスクブロックを追加 |
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
const INNER_DIV_TABLECELL_PATTERN =
  /(<foreignObject\b[^>]*>)(\s*)(<div\b[^>]*xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"[^>]*style="[^"]*display:\s*table-cell[^"]*"[^>]*>)([\s\S]*?)(<\/div>)(\s*)(<\/foreignObject>)/gi

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

**冪等性の根拠**: 正規表現は `display:\s*table-cell` のみマッチ。1 回適用後の外側 div は `display:flex` なのでマッチせず、内側 div (`table-cell`) は 1 階層深くなるが foreignObject 直下ではない (= `(<foreignObject\b[^>]*>)` 直後ではない) のでマッチしない → 二回目は no-op。

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

`postProcess.foreignObjectOverflow.test.ts` を雛形にして以下の 10 件を実装:

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
| 13 | (applyPostProcess) F-2 does NOT run for format=png | applyPostProcess 経由 | PNG バイト一致 |
| 14 | (applyPostProcess) F-1 + F-2 を併用、F-1 が先 | foreignObject に style なし | `style="overflow:visible"` と flex ラッパの両方 |

### 4.2 プロパティテスト (`test/property/prop-19_force_foreignobject_inner_center.property.test.ts`)

`prop-18` を雛形に、fast-check で **「ランダム生成 SVG に対する冪等性」** を保証:

```ts
fc.property(arbForeignObjectSvg, (svg) => {
  const once = forceForeignObjectInnerCentered(svg)
  const twice = forceForeignObjectInnerCentered(once)
  expect(twice).toBe(once)
})
```

その他のプロパティ:
- 「table-cell を含まない fO は不変」
- 「foreignObject 数の保存 (ラップしても fO 数は変わらない)」

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

```markdown
# foreignObject 内側センタリング検証 (REQ-U-10) — YYYY-MM-DD

## 環境
- ブランチ / コミット SHA
- Docker compose 構成 (port 3101, .env.test)
- Mermaid version (package.json から)
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

### PNG バイト一致 (AC-P-1)
- 12 ケース × PNG = 12 ファイル、修正前 (port 3100) と修正後 (port 3101) で `sha256sum` 一致確認
- 一致した行数: __/12

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
| AC-3 | 新規 F-2 単体テスト pass | ✓ / ✗ |
| AC-4 | PNG 出力 F-2 通らない (バイト一致) | ✓ / ✗ |
| AC-5 | 回帰チェックリスト全 PASS | ✓ / ✗ |
| AC-6 | 視覚回帰スクリーンショット OK | ✓ / ✗ |

## 結論
- 本 PR をマージしてよいか (Yes / No / Conditional)
- 残課題 (もしあれば)

## 派生発見 (任意)
- 検証中に気づいた既存バグ / 改善ポイントを箇条書き
```

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

### Phase 7: PNG 一致確認 (AC-P-1)
- [ ] 同じ 12 ケースを **port 3100 (本番)** にも投げて PNG を取得
- [ ] `sha256sum` で全 12 PNG の前後一致確認

### Phase 8: スペック追記
- [ ] `.kiro/specs/beautiful-svg-rendering/requirements.md` に REQ-U-10 追加
- [ ] `.kiro/specs/beautiful-svg-rendering/design.md` に F-2 設計サブセクション追加
- [ ] `.kiro/specs/beautiful-svg-rendering/tasks.md` に Phase 7 or Patch P-XX 追加
- [ ] `docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md` line 107-111 修正

### Phase 9: 検証報告書
- [ ] `docs/foreignobject-inner-centering-verification-2026-05-17.md` を §5.2 のテンプレートで作成
- [ ] 全成果物が揃ったことを確認 (§5.3)

### Phase 10: クリーンアップ & コミット
- [ ] test Docker を停止: `docker compose --profile test down`
- [ ] (本番 3100 は触らない、稼働継続)
- [ ] 全変更を 1 つの PR としてまとめてコミット & プッシュ
- [ ] PR description に本ドキュメントと検証報告書へのリンクを記載

---

## 7. 注意事項

- **本番 Docker (port 3100) を停止しない**。test サービス (port 3101) で並走検証する設計。
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
