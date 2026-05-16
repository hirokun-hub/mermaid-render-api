# Mermaid v11 foreignObject クリップ問題の公式報告草案に対する専門家レビュー(2026-05-16)

## 0. 本ドキュメントの位置付け

本ドキュメントは、`docs/expert-reviews/2026-05-16_foreignobject-clip-and-font-metrics-best-practices.md` の調査結果に基づき作成した公式 Mermaid リポジトリ向け Issue 報告草案について、3 名の独立専門家(O / A / G)に対し報告の妥当性と推奨アクションを問い合わせ、回答内容を相互照合のうえ**信頼度 97% 以上(複数の独立専門家が一次ソースで裏取り済、または公開仕様で直接確認できる事項)に限定して抽出**した記録。

報告草案そのものへの修正方針も併載するが、コードや SVG への変更は伴わない。

---

## 1. 信頼度 ≥97% と判定した修正事項

### 1.1 自分の仮説 (b) は実機 SVG 観測で裏取り済(2026-05-16 検証実施)

**事項**: 当方が「Mermaid の CSS パイプラインが `foreignObject` を小文字化することで standalone SVG モードでセレクタが失効する」と推定していた仮説は、本ドキュメント作成直後に実施した実機 SVG 観測で**裏取り成立**した。ただし「Mermaid 本体の文字列処理」「Puppeteer 内 CSSOM のシリアライズ仕様」「DOMPurify」のどの段で小文字化が発生しているかの**段の特定は未了**。

**当初の専門家見解(裏取り前)**:
- 専門家 O / A の 2 名が独立に Mermaid `packages/mermaid/src/mermaidAPI.ts` の `createUserStyles()` 経路を確認。`themeCSS` は `stylis` ライブラリの `compile()` → `stringify()` を経由するが、**stylis は要素名のケースを保持する設計**で、`foreignObject` を `foreignobject` へ変換する処理は本体ソース・stylis 単独テストともに確認できなかった。
- 専門家 O の手元検証(`serialize(compile('#id{.label foreignObject { overflow: visible; }}'), stringify)`)では出力 CSS が `foreignObject` のまま維持されていた。
- 一方で「ワークアラウンドが standalone SVG モードでは効かない」という現象自体は実機再現済(`docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md`)。

**実機検証結果(2026-05-16 実施、`docs/svg-themecss-lowercase-verification-2026-05-16.md` 詳細)**:

| 比較条件 | `<style>` 内 `foreignobject`(小文字) | DOM 上 `foreignObject`(大文字混じり) |
|---|---:|---:|
| `themeCSS: ".label foreignObject { overflow: visible; }"` 設定 | **1 件**(セレクタが小文字化) | 10 件(全 DOM ノードでケース保持) |
| `themeCSS` 未設定(コントロール) | **0 件** | 10 件 |

- 同一の SVG ファイル内で **DOM ノードはケース保持・themeCSS 由来セレクタだけが小文字化** していることが確認された。
- コントロール群で `foreignobject` が出現しないことから、**小文字化は `themeCSS` パイプラインに特有**であり、Mermaid 出力 SVG マークアップ全体の小文字化ではない。
- XML 名前空間の CSS セレクタは case-sensitive のため、小文字化されたセレクタは standalone SVG モードで `<foreignObject>` にマッチせず失効する(MDN: [CSS Type selectors / Case sensitivity](https://developer.mozilla.org/en-US/docs/Web/CSS/Type_selectors))。

**残課題(Mermaid 公式 Issue でメンテナ調査委任)**:

専門家 O / A の独立検証で stylis 単独はケース保持を確認済のため、小文字化発生段は以下のいずれかと推定される(特定未了):

1. Mermaid 内 `createCssStyles` / `getStyles` の文字列前処理(stylis 渡し前)
2. Puppeteer 内 Chromium の CSSOM `selectorText` シリアライズ(ブラウザ仕様レベルでの ASCII lowercase 正規化)
3. DOMPurify などサニタイズ過程

**参考ソース**:
- [Mermaid `mermaidAPI.ts`](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/mermaidAPI.ts) — `createUserStyles` / stylis 使用箇所
- [stylis (thysultan/stylis)](https://github.com/thysultan/stylis) — AST / case 保持挙動の公式リポジトリ
- 本リポジトリ検証ドキュメント `docs/svg-themecss-lowercase-verification-2026-05-16.md`(成果物 `docs/svg-themecss-lowercase-verification-2026-05-16/`)

### 1.2 `[*|local-name()="foreignObject"]` は有効な CSS セレクタではない

**事項**: 当方の修正方針案 Q5(b) で提示した `[*|local-name()="foreignObject"]` は CSS の構文ではなく、**XPath の関数**である。CSS セレクタとしては解釈されないため、本体側修正候補から除外する。

**根拠**:
- 専門家 O が CSS 仕様および MDN を参照のうえ明示的に指摘。
- CSS で名前空間を意識する場合の正しい構文は CSS Namespaces Module Level 3 に基づく以下のいずれか:
  - `*|foreignObject { ... }` (`@namespace` 宣言と組み合わせる)
  - `svg|foreignObject { ... }` (`@namespace svg url(http://www.w3.org/2000/svg);` を先行宣言)
- ただし `@namespace` 宣言は `themeCSS` の単一行に収まりにくく、stylis スコープ化との相性も未検証。
- 結論: **本体側で CSS セレクタを書き換える方向は推奨度低**。代替案は §1.3 参照。

**参考ソース**:
- [MDN: CSS Namespaces](https://developer.mozilla.org/en-US/docs/Web/CSS/@namespace) — `@namespace` 構文
- [MDN: CSS Type selectors / namespace separator](https://developer.mozilla.org/en-US/docs/Web/CSS/Type_selectors) — `*|` / `ns|` 区切り
- [W3C CSS Namespaces Module Level 3](https://www.w3.org/TR/css-namespaces-3/)

### 1.3 本体側修正の最善候補は SVG 属性または inline style への直接付与

**事項**: 本体側でクリップ問題を修正する場合、CSS セレクタ依存のアプローチではなく、Mermaid が生成する各 `<foreignObject>` 要素自体に **SVG `overflow` 属性または inline `style` を付与**するのが最も堅牢である。

**根拠**:
- 専門家 O が明示的に推奨。理由は「CSS セレクタ・名前空間・スコープ化・DOMPurify との相互作用の影響をすべて回避できる」こと。
- SVG 仕様で `overflow="visible"` 属性は `<foreignObject>` のクリッピング矩形を作らない動作として定義されている。
- 専門家 A / G も同方向の見解(下流側 inline style 注入が「最も現実的で堅牢なワークアラウンド」)。

**具体的な書き方(本体への提案として有効)**:
```xml
<foreignObject overflow="visible" width="..." height="...">
<!-- または -->
<foreignObject style="overflow: visible" width="..." height="...">
```

**参考ソース**:
- [MDN: SVG `overflow` attribute](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/overflow)
- [SVG 2 spec: overflow](https://www.w3.org/TR/SVG2/render.html#OverflowAndClipProperties)

### 1.4 #7354 と本件は別現象(同一 issue にぶら下げるべきでない)

**事項**: 当方が報告先第一候補としていた `#7354` は「flowchart の box が以前は文字に合わせて**縦方向**に拡張していたが最近そうならなくなった(リグレッション)」が主題で、当方の「standalone SVG で横方向に +5〜15 px オーバーフローしてクリップ」とは現象が異なる。

**根拠**:
- 専門家 A が `#7354` の本文(`Long text clipped in flowchart boxes`、2026-01-28 起票)を確認のうえ指摘。
- Mermaid 創設者 knsv の "Approved for investigation" は `#7354` の縦方向リグレッションに対するもので、本件横方向の慢性問題に対するものではない。
- したがって `#7354` への追記は論点を散らかすリスクがあり、**新規 Issue を起票して `#7354` / `#790` / `#6424` 等を相互参照する形式**(C 案)が推奨される。

**参考ソース**:
- [Mermaid Issue #7354](https://github.com/mermaid-js/mermaid/issues/7354) — 縦方向リグレッション、knsv コメント

### 1.5 報告は「観察事実 / 仮説 / ワークアラウンド」を分離した構成にする

**事項**: 公式報告のメンテナ受容性を高めるには、`Observed behavior` / `Expected behavior` / `Minimal reproduction` / `Metrics` / `Hypothesis (unverified)` / `Workaround tested downstream` の節を明示的に分離する。

**根拠**:
- 専門家 O / A が独立に同じ構成を推奨。
- 「根本原因」と断定する書き方は、未検証の場合はメンテナの信頼を失うリスクがあり、特に §1.1 の仮説を「原因」として書くと議論が "have you confirmed this in source?" で停止する可能性が高い。
- Mermaid Contributing Guide も Bug 報告では再現コードと環境情報の併載を求めている。

**参考ソース**:
- [Mermaid Contributing Guide](https://mermaid.js.org/community/contributing.html)
- [Mermaid Questions and Suggestions](https://mermaid.js.org/community/questions-and-suggestions.html)

### 1.6 最小再現は CJK を含めない構成を併載すべき

**事項**: 最小再現コードは純 ASCII 構成(例: `"PrimeDrive auto + check"`, `"(test + ok)"`)で示すと、メンテナのレビューコストが下がる。

**根拠**:
- 専門家 O / A が独立に同様の指摘。CJK 環境固有の問題と誤認されると優先度が下がるため、ASCII でも再現することを冒頭で示すべき。
- 当方の実測でも純 ASCII で +9.07〜+14.63 px のオーバーフローを確認済。

### 1.7 Mermaid 出力の SVG サニタイズには DOMPurify が関与する

**事項**: Mermaid は出力 SVG のサニタイズに **DOMPurify** を使用しており、`<foreignObject>` の属性や style の扱いを変更した前例がある。

**根拠**:
- 専門家 A が DOMPurify Issue #1002 / Mermaid Issue #5904 で SVG/foreignObject の扱い変更が過去に発生したことを指摘。
- 当方の下流側ワークアラウンド(`overflow:visible` 注入)を将来の DOMPurify バージョンが剥がす可能性は理論上ある。
- 注入処理は **Mermaid 側のサニタイズの後に実施**しているかを確認し、DOMPurify バージョンは exact pin で固定して回帰検証する運用が必要。

**参考ソース**:
- [DOMPurify Issue #1002](https://github.com/cure53/DOMPurify/issues/1002) — SVG/foreignObject の扱い変更
- 本リポジトリ既存制約 `C-D-04`(`requirements.md`)

### 1.8 `htmlLabels: false` は `<foreignObject>` を出力しない代替経路として存在する

**事項**: Mermaid 設定 `htmlLabels: false` を指定すると、`<foreignObject>` + HTML ではなく純 SVG `<text>` でラベルが描画されるため、本件のクリップ問題は原理的に発生しない。

**根拠**:
- 専門家 A / G が独立に指摘。Cline #7398、Mermaid #7565(JCEF/IntelliJ で foreignObject が描画されない事例)など複数の事例で `htmlLabels: false` による回避が広く知られている。
- ただし本リポジトリでは既存制約 `C-M-03` で「`htmlLabels: false` は v11.11+ で複数の Approved Bug が open」のためデフォルト適用禁止としており、**本件解決のための代替経路として `htmlLabels: false` を採用してはならない**。報告本文に「`htmlLabels:false` では発生しない」を**切り分け証拠として含める**価値はある。

**参考ソース**:
- [Mermaid Issue #7565](https://github.com/mermaid-js/mermaid/issues/7565) — JCEF で `htmlLabels:false` 回避
- 本リポジトリ既存制約 `C-M-03`

### 1.9 #6424 は本件と最も近接する既存 issue

**事項**: 重複確認の結果、`themeCSS / CSS セレクタの大文字小文字 / standalone SVG モードでの失効`を正面から扱った issue は専門家 O / A の確認範囲では見つからなかったが、**現象として最も近い既存 issue は `#6424`**(v11.5.0 で長い単語が foreignObject の width に入りきらずクリップ)である。

**根拠**:
- 専門家 A が `#6424` の本文を確認のうえ「当方の事象と同種の現象」と評価。
- 本件の新規性(=報告価値)は以下の 3 点に整理される:
  1. 純 ASCII でも再現する(CJK 限定ではない)定量データ
  2. `<img>` / standalone SVG モードと inline SVG モードで `themeCSS` ワークアラウンドの効き方が異なる現象の実測
  3. 下流側 `<foreignObject style="overflow:visible">` 注入で 7/7 副作用 0 の検証結果

**参考ソース**:
- [Mermaid Issue #6424](https://github.com/mermaid-js/mermaid/issues/6424) — Long Words are Cut Off (Open, 2025-03)
- [Mermaid Issue #5785](https://github.com/mermaid-js/mermaid/issues/5785) — flowchart node label disappears when too wide (Open, 2024)

### 1.10 ラベル幅算出は Puppeteer 内 Chromium でレンダリングして決定される

**事項**: Mermaid は描画時に DOM の実測(`getBoundingClientRect()` 系)で `<foreignObject>` の width を確定する設計のため、サーバ側 Puppeteer 内の Chromium で利用可能なフォントと、エンドユーザ環境の表示フォントが異なる場合に幅予測ずれが発生する。これは仕様レベルで不可避な経路である。

**根拠**:
- 専門家 A / G が独立に確認。フォントメトリクスのずれそのものを消す根本的アプローチは、(i) Puppeteer 内 Chromium にエンドユーザと同等のフォントスタックを注入する、(ii) SVG 内に Web フォントを `@import` で埋め込む、のいずれか。
- 専門家 G の (ii) Web フォント埋込は、SVG が `<img>` で参照されるとセキュリティポリシー上 `@import` が機能しない環境(GitHub Markdown 等)があるため、ユニバーサルな解にはならない。
- 専門家 A の (i) Puppeteer フォント注入は実効性が高いが、本リポジトリの runtime image とフォント配布契約に踏み込む必要があり、本 Phase の範囲外。

### 1.11 mermaid-cli の Programmatic API は semver 対象外で本体 API 変更の影響を直接受ける

**事項**: 本リポジトリで使用している `@mermaid-js/mermaid-cli` の Programmatic API は semver 保証対象外で、minor リリースで戻り値型や API 形状が変わる実績がある(既存 `C-M-07` / `C-M-08`)。本件の下流側 SVG 後処理は、Mermaid CLI 出力の SVG 文字列に対して実施するため、CLI 出力形式が変わると後処理の正規表現マッチに影響しうる。

**根拠**:
- 既存制約 `C-M-07` / `C-M-08` に記載済、Mermaid CLI README で明示。
- 下流側ワークアラウンドの長期運用では、正規表現ベースより XML/HTML パーサベースの注入が望ましい(専門家 O 指摘)。
- 本ドキュメントは方針合意の確認のみで、実装はコーディング担当 AI に委ねるが、Phase 4.6 のテストで属性順違い・改行混入・既存 `style` 共存・自己終了タグ等のエッジを property test で網羅する設計を維持する。

---

## 2. 信頼度判定上、本ドキュメントに採用しなかった事項

以下は専門家のいずれかが言及したが、複数専門家の独立裏取りが取れない、または当方の現状運用と不整合なため採用を保留した:

- 専門家 G の「(b) 小文字化が根本原因である」断定。専門家 O / A の両者がソース確認で否定的見解のため、本ドキュメントでは仮説扱いに留める。
- 専門家 A の「本体修正リリース後に 6 ヶ月の cooling-off period を置く」具体的期間。判断基準としては妥当だが、6 ヶ月という数値の根拠は専門家見解のみで一次ソースなし。期間値は本ドキュメントから除外し、「リリース後に視覚回帰検証で 0 副作用を確認できるまで維持」という運用基準のみ採用する。
- 専門家 G の「Web フォント埋込で根本解決」案。`<img>` 経由表示で `@import` が機能しない実環境(GitHub Markdown 等)があり、ユニバーサル解にならない。
- 専門家 O / A が共通言及した「v11 → v12 の ELK レイアウト移行」。Mermaid 公式ロードマップでの確度は未確認のため、本ドキュメントでは将来の検討事項として記録するに留める。

---

## 3. 報告の進め方(本ドキュメント時点での合意ライン)

1. 公式報告は**新規 Bug Issue を起票**する(`#7354` への追記ではない)。
2. 本文では `Observed / Expected / Minimal Reproduction / Metrics / Hypothesis (unverified) / Workaround tested downstream` を分離し、§1.1 の小文字化仮説は**仮説として**列挙する。
3. 関連 issue として `#6424` / `#5785` / `#7354` / `#4918` / `#790` / `#58` / `#2688` を相互参照する。
4. 報告前に §1.1 の「実機検証の最小手順」を実施し、小文字化が実際に起きているかを直接観測する。
5. 報告本文の最小再現は純 ASCII 構成を含める。
6. 本体修正案として提示するなら、CSS セレクタ修正ではなく `<foreignObject overflow="visible">` 属性付与または inline `style` 注入を第一候補とする。
7. PR は新規 Issue へのメンテナ反応を得てから検討する。

---

## 4. 本リポジトリへの反映方針

1. **`requirements.md` の `C-H-03` を訂正**: 「Mermaid が themeCSS を小文字化する」という断定的記述を「実機未検証の仮説」へ書き換え、検証手順への参照を追加する。
2. 本ドキュメントを `docs/expert-reviews/` の正式レビュー資料として保管し、Phase 4.6 実装担当 AI および将来の公式報告作成者の参照先とする。

実装(コード変更・テスト追加)は別タスクとし、本ドキュメントは方針記録の位置付けに留める。

---

## 5. 参考ソース(本ドキュメントで引用した一次資料)

### Mermaid 公式
- [Mermaid Issue #790](https://github.com/mermaid-js/mermaid/issues/790) — themeCSS ワークアラウンド一次資料 (Closed 2019)
- [Mermaid Issue #7354](https://github.com/mermaid-js/mermaid/issues/7354) — 縦方向リグレッション、knsv コメント (Open)
- [Mermaid Issue #6424](https://github.com/mermaid-js/mermaid/issues/6424) — Long Words are Cut Off (Open)
- [Mermaid Issue #5785](https://github.com/mermaid-js/mermaid/issues/5785) — flowchart node label disappears when too wide (Open)
- [Mermaid Issue #4918](https://github.com/mermaid-js/mermaid/issues/4918) — Long labels truncated when exported as SVG (Open)
- [Mermaid Issue #2688](https://github.com/mermaid-js/mermaid/issues/2688) — Replace foreignObject with standard SVG (Closed)
- [Mermaid Issue #7565](https://github.com/mermaid-js/mermaid/issues/7565) — JCEF で htmlLabels:false 回避 (Open)
- [Mermaid `mermaidAPI.ts`](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/mermaidAPI.ts) — `createUserStyles` / stylis 使用箇所
- [Mermaid Contributing Guide](https://mermaid.js.org/community/contributing.html)
- [Mermaid Questions and Suggestions](https://mermaid.js.org/community/questions-and-suggestions.html)

### Web 標準・依存ライブラリ
- [stylis (thysultan/stylis)](https://github.com/thysultan/stylis) — AST / case 保持挙動
- [MDN: CSS `@namespace`](https://developer.mozilla.org/en-US/docs/Web/CSS/@namespace)
- [MDN: CSS Type selectors](https://developer.mozilla.org/en-US/docs/Web/CSS/Type_selectors)
- [W3C CSS Namespaces Module Level 3](https://www.w3.org/TR/css-namespaces-3/)
- [MDN: SVG `overflow` attribute](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/overflow)
- [SVG 2 spec: overflow and clip properties](https://www.w3.org/TR/SVG2/render.html#OverflowAndClipProperties)
- [DOMPurify Issue #1002](https://github.com/cure53/DOMPurify/issues/1002) — SVG/foreignObject 扱い変更

### 関連プロジェクト事例
- [Cline Issue #7398](https://github.com/cline/cline/issues/7398) — `foreignObject` クリップの背景解説
