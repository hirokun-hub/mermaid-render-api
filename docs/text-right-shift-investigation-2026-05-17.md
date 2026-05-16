# Text right-shift in clipping-prone nodes — 2026-05-17

調査ブランチ: `investigate/state-diagram-padding` (本トピックは同ブランチ内で実施)

## ユーザー観測

> CSV (CJK) 文字切れ対策後、文字切れが起きそうなノードの文字が「多少右寄り」に表示される。
> つまり横方向に中央揃えになっていない。これは F-1 (`forceForeignObjectOverflowVisible`) の副作用か？

## 結論 (TL;DR)

| 項目 | 結論 |
|---|---|
| 右寄りは事実か | **事実**。SVG (img/inline)、PNG いずれでも再現する。 |
| F-1 が原因か | **半分 yes / 半分 no**。「中心からのズレ」は Mermaid 既存挙動で F-1 以前から発生していた。F-1 でクリップが解除されたことにより「右クリップ」が「右はみ出し」に変わり、**視覚上ズレが認識可能になった**。 |
| `docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md` line 107-111 「`overflow:visible` で左右均等(symmetric)に広がる」 | **誤り**。実測は片側 (右側) のみ。 |
| SVG / PNG で挙動差はあるか | **無し**。SVG (img)、SVG (inline / `<object>`)、PNG (Puppeteer programmatic) で同じ右寄り。 |
| 修正可能か | 可能。foreignObject 内側 div を **left-anchored cell → center-anchored** に書き換える後処理 / themeCSS 追加が候補。 |

## 1. 再現素材

入力 Mermaid (`flowchart LR`, 2 ノード、`<br>` 改行 2 行ラベル):

```mermaid
flowchart LR
  A["集める ✓<br>(PrimeDrive 自動)"] --> B["整理する<br>(手動 + ✓)"]
```

リファレンス用に短いラベル 1 行ケースも生成:

```mermaid
flowchart LR
  X["整理する"] --> Y["完了"]
```

生成成果物 (`docs/text-right-shift-investigation-2026-05-17/`):

| ファイル | 内容 |
|---|---|
| `case-clip.svg` | 上記長文版 SVG (`/render`, programmatic) |
| `case-clip.png` | 同 PNG (Puppeteer page screenshot) |
| `case-short.svg` / `case-short.png` | 短文リファレンス |
| `viewer.html` | 3 描画モード並列比較ページ |
| `measure-shift.html` | SVG DOM を `getBoundingClientRect` で計測 |
| `overview.png` | Playwright 撮影の比較スクリーンショット |
| `measurements.json` | 数値計測結果 |

API: `http://127.0.0.1:3100/render`, Mermaid 11.15.0, `defaultRenderer: dagre-wrapper`, `htmlLabels: true`, `BEAUTIFUL_DEFAULTS` 適用済み (本ブランチの未コミット変更なし、現行 main 相当の挙動)。

## 2. 比較スクリーンショット

![SVG (img) vs PNG vs SVG (inline) と短文リファレンス](./text-right-shift-investigation-2026-05-17/overview.png)

赤い縦線は各ボックスの horizontal center。

- **①長文 (clipping-prone)**: 3 描画モード共通で、A ノード "(PrimeDrive 自動)" 行 / B ノード "(手動 + ✓)" 行が右寄り。
- **②短文 (non-clipping)**: 両ノードで中央揃え正常。

## 3. SVG 構造の調査

`case-clip.svg` から抜粋:

```html
<g class="node default" id="...A-0" transform="translate(102.77, 47)">
  <rect class="basic label-container" x="-94.77" y="-39" width="189.55" height="78"/>
  <g class="label" transform="translate(-64.77, -24)">
    <rect/>
    <foreignObject style="overflow:visible" width="129.55" height="48">
      <div xmlns="http://www.w3.org/1999/xhtml"
           style="display: table-cell; white-space: nowrap;
                  line-height: 1.5; max-width: 200px; text-align: center;">
        <span class="nodeLabel">
          <p>集める ✓<br />(PrimeDrive 自動)</p>
        </span>
      </div>
    </foreignObject>
  </g>
</g>
```

ジオメトリ:

| レイヤ | left | right | center | width |
|---|---:|---:|---:|---:|
| rect (A) | -94.77 | +94.77 | 0 | 189.55 |
| foreignObject (A) | -64.77 | +64.78 | 0 (= rect 中心) | 129.55 |

ここまでで **foreignObject は rect 中心に配置されている**(rect の左右 30px ずつのパディング内側)。

問題はその内側:

- 内側ルートは `<div style="display: table-cell; text-align: center; white-space: nowrap; max-width: 200px">`。
- `display: table-cell` を裸で書くと、ブラウザはこれを匿名 `table-row` + `table` でラップしたブロックボックスとして扱う。
- 匿名テーブルは **block-level 要素のデフォルト挙動 (LTR では containing block の left edge に配置)** を取り、`white-space: nowrap` の制約下で intrinsic width にシュリンク・拡張する。
- 結果として **`text-align: center` は "cell 内の inline 行" を中央寄せするだけ**で、cell 自体は fO の左端アンカー。
- `text-align: center` を効かせる対象 (= cell の左右に余白) が存在しないため、cell width ≠ fO width のとき必ずズレる。

## 4. ピクセル単位の定量計測

`getBoundingClientRect` (CSS px) で測定 (`measurements.json` 参照):

| ノード | rect center | fO center | innerDiv (cell) left → right (width) | nodeLabel span center | **span − rect** | 状態 |
|---|---:|---:|---|---:|---:|---|
| A "集める ✓ / (PrimeDrive 自動)" | 94.68 | 94.68 | 29.97 → 156.07 (**126.10**) | 93.02 | **-1.66 px (左寄り)** | cell < fO で左寄り |
| B "整理する / (手動 + ✓)" | 294.16 | 294.16 | 259.30 → **333.52** (**74.23**) | 296.41 | **+2.25 px (右寄り)** | cell > fO (4.49px 右オーバーフロー) で右寄り |

観察:

- fO 自体は rect の真ん中にある (`fO center == rect center`)。
- cell (innerDiv) は **常に fO の left edge にスナップ** (`innerDiv.left == fO.left`)。
- cell 幅 vs fO 幅で挙動が分岐:
  - cell < fO ⇒ cell は左に寄って静置 → text 重心が rect 中心の **左**へ
  - cell > fO ⇒ cell は左に寄って **右側にだけはみ出す** → text 重心が rect 中心の **右**へ
- 「片側オーバーフロー」のため、`docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md` line 107-111 の「`overflow:visible` で symmetric (左右均等) に広がる」記述は事実と一致しない。

ユーザーが視覚的に気づいた「右寄り」は (B) のパターン (cell > fO のオーバーフロー側) に該当。

## 5. SVG / PNG の挙動差

| モード | overflow:visible 適用経路 | 結果 |
|---|---|---|
| **SVG (`<img src>`)** | F-1 で `<foreignObject>` に **インライン** `style="overflow:visible"` を注入 | 右はみ出し可視 |
| **SVG (inline / `<object>`)** | themeCSS `.label foreignobject{overflow:visible}` (block 内 CSS) も適用される + インライン style | 右はみ出し可視 |
| **PNG (Puppeteer programmatic)** | Mermaid を HTML/DOM 内でレンダリングするため themeCSS は通常通り効く (case-sensitivity の問題なし) | 右はみ出し可視 |

`src/renderer/postProcess.ts:30-36` で `format === 'png'` のとき `forceForeignObjectOverflowVisible` を **スキップ**しているが、PNG のほうは Puppeteer ページ内の themeCSS で既に overflow:visible が効いているため、PNG にも同じ右寄りが現れる。要するに本件は描画フォーマットによる差ではなく **HTML レイアウト計算** の問題。

## 6. F-1 (`forceForeignObjectOverflowVisible`) との関係整理

| 状態 | cell > fO のときに見えるもの |
|---|---|
| F-1 適用前 | cell の右はみ出し部分が `foreignObject` 境界で **クリップ** → "文字が右で切れる" |
| F-1 適用後 (現状) | クリップが外れて **右側にだけ字がはみ出す** → "右寄りに見える" |

- cell が fO の左に左寄せされている事実は **F-1 以前から存在する Mermaid `dagre-wrapper` + `htmlLabels` の挙動**。
- F-1 はクリップを取り除いただけ → 「ズレが視覚的に現れる」という意味で副作用といえる。
- 「中心からのズレを生んでいる原因 (=cell が left-anchored であること)」は F-1 が作ったものではない。

## 7. 改善案 (実装しないが、選択肢を列挙)

優先度・破壊性を比較:

| 案 | 介入箇所 | 効果 | リスク |
|---|---|---|---|
| **(a) themeCSS 1 行追加**: `.label foreignObject > div { margin: 0 auto; }` 相当 | `BEAUTIFUL_DEFAULTS.themeCSS` | cell を fO 内で水平センタリング | `display: table-cell` は block-level wrapper を作るため `margin: auto` で水平中央化できるか要検証。<br>`<img src>` モード時の themeCSS 非適用問題があるので、postProcess での style 注入版も必要かも。 |
| **(b) postProcess で foreignObject 内部 div の style に `margin-left:auto; margin-right:auto;` を注入** | `src/renderer/postProcess.ts` | (a) と同じ効果を img mode でも保証 | 正規表現置換の対象範囲を foreignObject 内最初の `<div>` に限定する必要あり |
| **(c) cell wrapper を flex 化**: `display: flex; justify-content: center;` の追加ラッパを postProcess で挿入 | 同上 | センタリング確実 | DOM 構造を増やすため Mermaid の他処理 (edge label など) と衝突しないか要検証 |
| **(d) 何もしない (現状維持)** | - | - | "右寄り" 視覚に運用許容するなら不要 |

(a) が最小侵襲。要 PoC として 1 サンプル試して挙動が変わるかだけ確認すれば良い。

## 8. 検証手順 (再現)

```bash
# API 起動 (programmatic) は既存 docker-compose
mkdir -p docs/text-right-shift-investigation-2026-05-17
cd docs/text-right-shift-investigation-2026-05-17

SRC=$'flowchart LR\n  A["集める ✓<br>(PrimeDrive 自動)"] --> B["整理する<br>(手動 + ✓)"]'
jq -n --arg src "$SRC" '{code:$src,format:"svg"}' \
  | curl -s -o case-clip.svg -X POST -H 'Content-Type: application/json' \
        --data-binary @- http://127.0.0.1:3100/render
jq -n --arg src "$SRC" '{code:$src,format:"png"}' \
  | curl -s -o case-clip.png -X POST -H 'Content-Type: application/json' \
        --data-binary @- http://127.0.0.1:3100/render

# 視覚比較 (任意の HTTP server 経由で viewer.html を開き、 Playwright で screenshot)
# 計測は measure-shift.html を開いて body innerText を読む。
```

## 9. まとめ (ユーザーの問いへの回答)

> 「これは、今回特定した問題点 (F-1 overflow:visible) の解決の副作用だよね？」

- **見えるようになった理由としては Yes** — F-1 がクリップを外したことで、隠れていた "右はみ出し" が顕在化した。
- **ズレを生んでいる根本原因としては No** — Mermaid `dagre-wrapper + htmlLabels` の foreignObject 内 cell が常に左端アンカーであることが原因。F-1 がこれを作ったわけではない。
- **修正は必要か** — ユーザー体験次第。修正するなら themeCSS 1 行 + postProcess 1 規則 (上記 (a)+(b)) が最小コスト。
- **PNG でも再現するか** — する。Puppeteer の DOM レンダリング内で themeCSS が効くため。F-1 をスキップしている post-process のロジックとは独立。
