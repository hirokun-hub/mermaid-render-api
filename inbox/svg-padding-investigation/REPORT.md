# SVG ノードパディング再現性 定量調査レポート

- 調査日: 2026-05-10
- ブランチ: `investigate/svg-node-padding`
- 対象 API: `mermaid-render-api`(本リポジトリ、Docker コンテナで稼働、`MERMAID_PADDING=20` デフォルト)
- 目的: 改修案 (`docs/開発.要件定義_ノード内テキスト見切れ対策とレイアウト制御_改修案.md`) で主張されている「SVG ノードの不要余白 / テキスト見切れ」事象が、現状コードでどの程度再現するかを定量化する
- 関連ユースケース: AI に単独 HTML(SVG 直埋込) で資料を生成させたいので、コンシューマ側ブラウザに Noto Sans CJK JP が無い前提でも美しく見えてほしい

---

## 1. 調査セットアップ

| 項目 | 値 |
|---|---|
| サーバ (mmdc 実行環境) | Docker コンテナ内、Noto Sans CJK JP インストール済 |
| サーバ Mermaid 設定 | `theme=base`, `fontFamily="Noto Sans CJK JP", "IPAexGothic", sans-serif`, `themeCSS="svg { padding: 20px; }"` |
| PNG レンダリングスケール | `PNG_RENDER_SCALE=3`(`.env`) |
| コンシューマ側ブラウザ | playwright-cli(Chromium)、ホスト WSL2 |
| ホストの利用可能 CJK フォント | `WenQuanYi Zen Hei`, `Unifont-JP`(**Noto Sans CJK JP は無し**) |
| 計測手法 (SVG) | playwright-cli + `eval` で `getBBox()` / `scrollWidth/Height` を取得 |
| 計測手法 (PNG) | Pillow でピクセル走査(透明・濃色ピクセル bbox) |

テストケース: `scripts/cases.json` の 10 ケース(単行 ASCII、単行 CJK、複数行 CJK + `<br>`、複数行 ASCII + `<br>`、角丸・スタジアム・ひし形、長文 CJK、TD 方向 など)。

成果物:
- 入力: `cases/*.mmd`
- 出力: `renders/*.svg`, `renders/*.png`
- インスペクション HTML: `renders/index.html`(SVG/PNG 横並び)
- ブラウザ全画面スクショ: `screenshots/all-cases-host-browser.png`
- 計測 JSON: `measurements.json`(SVG)、`png_measurements.json`(PNG)

---

## 2. 計測サマリ — SVG (ホストブラウザ実描画)

### 2.1 ノード矩形 (shape) と テキスト実寸 (scrollWidth/Height) の差 = 「ノード内余白」

| ケース | 形状 | shape (W×H) | text (W×H) | **余白 W / H** | 形状種別 |
|---|---|---|---|---|---|
| 01-single-ascii (A) | rect | 141.5 × 54 | 79 × 24 | **62.5 / 30** | rect |
| 01-single-ascii (B) | rect | 99.3 × 54 | 38 × 24 | **61.3 / 30** | rect |
| 02-single-cjk (A) | rect | 108 × 54 | 49 × 24 | **59 / 30** | rect |
| 02-single-cjk (B) | rect | 92 × 54 | 32 × 24 | **60 / 30** | rect |
| 03-multiline-cjk-br (A) | rect | 189.5 × 78 | 126 × 48 | **63.5 / 30** | rect |
| 03-multiline-cjk-br (B) | rect | 124 × 54 | 65 × 24 | **59 / 30** | rect |
| 04-multiline-cjk-3lines (A) | rect | 172.9 × 102 | 115 × 72 | **57.9 / 30** | rect |
| 05-multiline-ascii-br (A) | rect | 199.5 × 78 | 135 × 48 | **64.5 / 30** | rect |
| 06-rounded (A) | path | 159.5 × 78 | 126 × 48 | **33.5 / 30** | path |
| 07-stadium (A) | path | 160.3 × 63 | 126 × 48 | **34.3 / 15** | path |
| 08-diamond (A) | polygon | 207.5 × 207.5 | 126 × 48 | **81.5 / 159.5** | polygon |
| 09-long-cjk (A) | rect | 260 × 102 | 200 × 72 | **60 / 30** | rect |
| 10-td-multiline-cjk (A) | rect | 189.5 × 78 | 126 × 48 | **63.5 / 30** | rect |
| 10-td-multiline-cjk (B) | rect | 129.8 × 78 | 74 × 48 | **55.8 / 30** | rect |

#### 観察

- **`rect` ノードはテキスト周囲に常時 約 60px(横) / 30px(縦) の余白がある。** ノードの内容量によらず一定。これは Mermaid の `dagre-wrapper` レンダラの hardcoded ノードパディング(片側 30px 横 / 15px 縦) × 2 に対応する量。
- **`path`(stadium/rounded)では横余白がほぼ半減(33–34px)、縦余白も 15px に減る。** 形状の計算方法が異なるため。
- **`polygon`(ひし形)は形状特性上、外接矩形が大きくなる(159.5px の縦余白)。** ユーザー視点では「ひし形使うと余白が酷い」となる。

### 2.2 `foreignObject` 公称サイズ vs テキスト実描画サイズ

`foreignObject` は Mermaid がサーバ側のフォント(Noto Sans CJK JP)で測定した値で固定されているが、ホストブラウザは WenQuanYi で描画するので幅がズレる:

| ケース | ラベル | fo_w | text_sW | overflow |
|---|---|---|---|---|
| 02-single-cjk | 集める | 48.0 | 49 | **+1px** |
| 03/06/07/08 | 整理する | 64.0 | 65 | **+1px** |
| 04-3lines | 「行3: 確認」を含む最長行 | 112.9 | 115 | **+2.1px** |
| 10-td | 整理する(手動 + ✓) | 69.8 | 74 | **+4.2px** |

- **CJK ラベルではホストブラウザの実テキスト幅 > Mermaid 計算幅** が再現された。最大 +4.2px、平均 +1〜2px 程度。
- ASCII ラベル / 長文単行 CJK では overflow は発生しない(09 は折返しが効いて wrappingWidth=200 で揃う)。
- **ただし「ノード形状の矩形(shape)」からは絶対に overflow しない**(shape はもともと 60px 余白を持つため、fo の +4px overflow は shape 内に余裕で収まる)。

### 2.3 改修案の主張に対する事実関係

| 改修案の記述 | 実測 | 評価 |
|---|---|---|
| 「`foreignObject` の高さ・幅がテキストの実描画サイズより小さく確定し、はみ出した部分が clip される」 | 実際に `fo_w` < `text_sW` は再現(最大 +4.2px)。**だが** Mermaid の生成 SVG には `<foreignObject>` に `overflow:visible` 相当(明示クリップ無し)で出力されており、shape 矩形には 60px の余白があるため、実描画上の視覚的 clip は発生していない | **半分正しい**: 数値オーバーフローは確かに起きるが、視覚的見切れには直結しない |
| 「ラベルの一部が枠線にめり込む」 | 本セットでは再現せず。すべて shape 矩形内に収まっている | **再現せず**(別フォント / 別ラベルでは起こり得るが、現状の検証範囲では発生しない) |
| 「`MERMAID_PADDING` は `svg { padding }` を themeCSS に注入するだけ」 | コード(`src/config.ts:24`, `src/server/server.ts:32`)で事実確認済 | **正しい** |
| 「ノード単位の余白(`flowchart.nodePadding` / `flowchart.diagramPadding`)には介入していない」 | API は `flowchart.*` を一切受け付けない(構造的にハードコード) | **正しい** |
| 「`flowchart.nodePadding` (default=8)」 | Mermaid v11 の `config.schema.yaml` に `flowchart.nodePadding` は**存在しない**。flowchart 系の余白キーは `diagramPadding` (8) / `nodeSpacing` (50) / `rankSpacing` (50) / `padding` (15, experimental only) | **誤り**(`nodePadding` は Sankey 専用キー) |

---

## 3. 計測サマリ — PNG (サーバ rasterize、scale=3)

PNG_RENDER_SCALE=3 のため、画像 1px = SVG 1/3 px。outer_pad の数値を 3 で割れば SVG 座標系の余白に近い:

| ケース | img W×H | diagram bbox | outer pad (top/left/right/bottom px) | 同 ÷3 |
|---|---|---|---|---|
| 01-single-ascii | 738×165 | 22,22,693,138 | 22/22/45/27 | ~7/7/15/9 |
| 02-single-cjk | 591×162 | 22,21,547,136 | 22/21/44/26 | ~7/7/15/9 |
| 03-multiline-cjk-br | 783×225 | 22,21,738,196 | 22/21/45/29 | ~7/7/15/10 |
| 04-3lines | 717×273 | 21,21,672,242 | 21/21/45/31 | ~7/7/15/10 |
| 05-multiline-ascii-br | 813×225 | 22,21,768,196 | 22/21/45/29 | ~7/7/15/10 |
| 06-rounded-cjk-multi | 686×226 | 21,22,641,196 | 22/21/45/30 | ~7/7/15/10 |
| 07-stadium-cjk-multi | 945×237 | 21,22,900,209 | 22/21/45/28 | ~7/7/15/9 |
| 08-diamond | 1176×672 | 21,21,1131,637 | 21/21/45/35 | ~7/7/15/12 |
| 09-long-cjk | 1209×354 | 22,22,1163,326 | 22/22/46/28 | ~7/7/15/9 |
| 10-td-multiline-cjk | 618×666 | 21,21,573,620 | 21/21/45/46 | ~7/7/15/15 |

#### 観察

- **PNG 外周余白は左右非対称**: 左/上 ≈ 7 SVG-px、右 ≈ 15 SVG-px、下 ≈ 9〜15 SVG-px。
  - これは Mermaid の `flowchart.diagramPadding` デフォルト 8 と整合(8 ≈ 7 で四捨五入誤差)し、右側に余分な余白が乗っている。原因は puppeteer screenshot がノードの外側ラインを含めて bbox を取るため、`useMaxWidth: true` 由来のレイアウト計算と矢印終端の余裕分だと推測される。
- **`MERMAID_PADDING=20` の効果は PNG では確認しづらい**: PNG bbox は viewBox + diagram の bbox で決まるため、CSS padding は SVG ルートのスタイルとして残るが mmdc の PNG 出力ではトリミングされている可能性が高い(20px のはずが ~7px しか出ていない)。

→ **`MERMAID_PADDING` は SVG 形式でしか実質的に効いておらず、しかも SVG 外周にしか作用しない**(改修案の指摘どおり)。

---

## 4. 視覚確認 (`screenshots/all-cases-host-browser.png`)

- **左列**: SVG をホストブラウザ(Noto Sans CJK JP **なし**、WenQuanYi 描画)で表示。 `max-width:200px` の縮小表示。
- **右列**: PNG(サーバ rasterize、Noto Sans CJK JP あり)、フルサイズ。

視認できた事項:

1. **全ケースでテキストが枠内に収まっている**(SVG 側でも見切れ無し)。改修案で報告されている「枠線にめり込む」事象は、本検証セット & 標準フォント環境では発生しなかった。
2. **PNG / SVG いずれもノードの内側余白が広く感じる**(片側 30px 横 / 15px 縦)。とくに `flowchart LR` で `<br>` 改行を入れない短いラベル(02 / 09 の B ノード「完了」「次」)は枠の半分以上が余白で、ユーザーの「余白多すぎ」主張と整合。
3. **ひし形(case 08)** は外接矩形の特性上、ラベルに対して矩形が極端に大きい。これは Mermaid の形状ジオメトリで、`flowchart.padding` を弄っても改善は限定的。

---

## 5. 結論

### 再現できた事象(定量的)

1. **ノード内余白が固定で大きい**: rect ノードで横 60px / 縦 30px、stadium/rounded で横 33px / 縦 15px、polygon は形状特性で更に大。ユーザー主訴(「余白多すぎ」)は **再現** された。
2. **CJK ラベルでホストブラウザ実テキスト幅 > Mermaid 計算幅 が +1〜+4px**: 改修案が指摘する `foreignObject` 寸法ズレは **数値上は再現**(コンシューマ側のフォント差に依存)。
3. **`MERMAID_PADDING` 環境変数は SVG 形式の外周にしか効かず、ノード余白の制御手段は API として提供されていない**: **再現**。

### 再現できなかった事象

- **「テキストが枠線にめり込む」程の見切れ**: 本セット & 標準的なフォント環境では発生せず。
  - 数値オーバーフロー (+4px) は起きるが、`shape` 矩形が常に 60px の余白を持っているため、視覚上は枠内に収まる。
  - 改修案の発端ケース「集める ✓<br>(PrimeDrive 自動)」も、検証では shape 内に余裕を持って収まった。
  - **配布先環境のフォント / ズーム倍率次第で見切れが現出する可能性は残る**が、その再現条件はもう少し具体化が必要。

### 改修方針への含意(再確認)

- ユーザーの主な不満は「**余白が多すぎる**」側。これは API に **減らす方向の制御**(`flowchart.nodeSpacing` / `rankSpacing` / `diagramPadding` のリクエスト時上書き、`MERMAID_PADDING=0` 許容)を入れれば解決する。
- 改修案が掲げた `flowchart.nodePadding` というキーは Mermaid v11 の flowchart には**存在しない**(Sankey 専用)。本来効くキーに置き換える必要がある:
  - **ノード間隔**: `flowchart.nodeSpacing`(default 50) / `flowchart.rankSpacing`(default 50)
  - **ダイアグラム外周**: `flowchart.diagramPadding`(default 8)
  - **ノード内側のラベル余白**: `flowchart.padding`(default 15、ただし "experimental renderer only" と注記。`dagre-wrapper` では効かない可能性)
  - **SVG ルート CSS パディング**: 既存 `MERMAID_PADDING`(`themeCSS` 注入)
- 「見切れ対策」はサブ目的とし、メインは「**ノード余白を小さくして見栄えを締める**」方向で改修するのが筋。
- 配布用 HTML 埋込のレスポンシブ対応は、改修案の `svg_post_process.strip_inline_max_width` よりも **Mermaid 側 `flowchart.useMaxWidth: false`** をリクエストで制御するほうが直接的。

---

## 6. 添付ファイル一覧

```
inbox/svg-padding-investigation/
├── REPORT.md                         (本ファイル)
├── measurements.json                 (SVG 計測 raw)
├── png_measurements.json             (PNG 計測 raw)
├── cases/                            (テストケース *.mmd)
├── renders/
│   ├── 01..10-*.svg                  (取得した SVG)
│   ├── 01..10-*.png                  (取得した PNG)
│   └── index.html                    (横並びインスペクション)
├── screenshots/
│   └── all-cases-host-browser.png    (ホストブラウザ全画面スクショ)
└── scripts/
    ├── cases.json                    (ケース定義)
    ├── render_all.sh                 (API へ POST して保存)
    ├── build_index.py                (検査用 HTML 生成)
    └── png_measure.py                (PNG 外周余白計測)
```

再実行: `bash scripts/render_all.sh && python3 scripts/build_index.py && python3 scripts/png_measure.py`
