# Mermaid v11 themeCSS 小文字化バグ Issue 投稿前最終レビュー(2026-05-16)

## 0. 本ドキュメントの位置付け

`docs/issue-drafts/2026-05-16_mermaid-themecss-lowercase-bug.md` の Issue ドラフトに対し、3 名の独立専門家(O / A / G)からのセカンドオピニオンを相互照合し、**信頼度 97% 以上(複数の独立専門家が一次ソースで裏取り済、または公開仕様で直接確認できる事項)に限定して抽出**した記録。Mermaid 公式リポジトリ(`mermaid-js/mermaid`)への投稿前の最終 fact-check として位置付ける。

レビュー日: 2026-05-16
専門家: O / A / G(同じ 3 名、前回レビュー `2026-05-16_mermaid-issue-report-validity-best-practices.md` の継続)
レビュー対象添付物(6 ファイル): Issue ドラフト本体 / 検証ドキュメント / 検証 SVG 2 種 / 前回専門家レビュー / クリップ事象の定量実測

---

## 1. 信頼度 ≥97% と判定した最終事項

### 1.1 Issue 投稿可否: 全員 **(B) 軽微な修正で投稿可** で合意

3 名いずれも Q1 で同じ判定を提示。ドラフトの主張、最小再現、検証根拠、Related issues 列挙、修正方向の提案バランス、英語のトーンに対する評価が一致。投稿は推奨される。

### 1.2 根本原因の最有力候補が判明: PR #7737 / commit `37ff937`(CSSOM 切替)

**事項**: Mermaid **11.15.0(2026-05-11〜12 リリース)** で取り込まれた PR #7737「fix: create CSS styles using the CSSOM」(@ashishjain0512、commit `37ff937`)が、本件 themeCSS セレクタ小文字化の根本原因の**最有力候補**として複数の独立検証で確認された。

**根拠**:
- 専門家 A が一次ソース確認(Mermaid リリースノート、PR 本文、commit diff)。
- 専門家 O が独立に develop ブランチ `mermaidAPI.ts` を確認し、`themeCSS` が `CSSStyleSheet.replaceSync(config.themeCSS)` → `cssStyleSheetToString(...)` → `compileCSS(...)` の経路を通ることを把握済。
- W3C CSSOM Module Level 1 仕様([selectorText シリアライズ規則](https://www.w3.org/TR/cssom-1/))では、`CSSStyleSheet` API 経由で構築された CSS の `selectorText` シリアライズは、ホスト文書が HTML として解釈されている場合に**型セレクタ(type selector)を ASCII lowercase に正規化する**と定義されている。
- Puppeteer 内 Chromium は HTML 文脈で動作するため、Mermaid が `CSSStyleSheet.replaceSync()` 経由で themeCSS を構築するパイプラインに変えた結果、出力される `selectorText` が ASCII lowercase に正規化される、という仕様レベルで説明可能な事象が起きている。
- 前回ラウンド(2026-05-16 前半)では「stylis 経路ではケース保持が確認されている」と確定していたが、Mermaid は 11.15.0 で stylis ではなく CSSOM 経路に切り替わっており、専門家 O / A 両者が「stylis レビューは過去の経路に対する確認だった」と整理。

**帰結**:
- 「小文字化が起きる事実」は実機観測で verified(`docs/svg-themecss-lowercase-verification-2026-05-16.md`)。
- 「小文字化の発生段」は CSSOM 仕様準拠の挙動として**ほぼ確定**(verified ではなく highly likely、ただし bisect 未完)。
- これは **Mermaid 側の「過失」ではなく、新しい CSSOM 経路と Web プラットフォーム仕様の相互作用**として中立的に記述すべき。

**参考一次ソース**:
- [Mermaid PR #7737](https://github.com/mermaid-js/mermaid/pull/7737) — CSSOM 経路への切替
- Mermaid `mermaidAPI.ts` develop ブランチ(`createUserStyles` / CSSOM パイプライン)
- [W3C CSSOM Module Level 1: serialize a selector](https://www.w3.org/TR/cssom-1/) — type selector の ASCII lowercase 正規化規則
- [WHATWG CSSOM Editor's Draft (latest)](https://drafts.csswg.org/cssom-1/)

### 1.3 本件は **11.15.0 で導入された新規リグレッションの可能性が極めて高い**

**事項**: PR #7737 が 11.15.0 で初めて取り込まれているため、本件が同バージョンで導入された新規リグレッションである可能性が高い。投稿前に **11.14.0(PR #7737 取込前)での回帰検証**を行うべき。

**根拠**:
- 専門家 A が PR #7737 のマージタイミング(2026-05 リリース)を一次ソースで確認。
- 11.14.0 で同事象が再現しなければ「regression introduced by PR #7737」と明示でき、報告の優先度が大きく上がる。
- 11.14.0 でも再現するなら「long-standing, surfaced by recent CSSOM-based rewrite」となり、フレーミングが変わる。
- いずれにせよ事実関係が確定するため、投稿前のこの 1 ステップは費用対効果が極めて高い。

**実施手順**(専門家 A 提案、投稿前必須):
1. `@mermaid-js/mermaid-cli` の 11.13.x 系(同梱 Mermaid core が 11.14.0 以下になる版)をインストール。
2. 本リポジトリの検証手順(`docs/svg-themecss-lowercase-verification-2026-05-16.md` §2.3 コマンド)を再実行。
3. 生成 SVG の `<style>` 内に `foreignobject` が出現するかを `grep` で計測。
4. 結果を Issue 本文の "Verified output behavior" 節に反映。

### 1.4 develop ブランチでの再現確認も投稿前必須

**事項**: Mermaid 公式の Bug Report template には「There is a chance that the bug is already fixed in the git develop branch, but is not released yet. So please check in Live Editor - Develop before raising an issue」と明記されている。

**根拠**:
- 専門家 A / O が独立に同テンプレート要求を確認(`.github/ISSUE_TEMPLATE/bug_report.yml`)。
- 投稿前に `https://develop.git.mermaid.live` で再現確認し、本文に「Confirmed reproducible on develop branch as of YYYY-MM-DD」の 1 行を入れることで、メンテナの初動コストを下げる。
- ただし develop Live Editor は **inline SVG モード**で動作するため、Live Editor 単独では本件 standalone SVG mode の問題を直接再現できない。Live Editor で本件と関連する `<style>` 内 selector の小文字化が観測できるかは、DevTools で生成 SVG の `<style>` 要素を直接 grep して確認する必要がある。

**参考一次ソース**:
- [Mermaid Bug Report template (develop)](https://github.com/mermaid-js/mermaid/blob/develop/.github/ISSUE_TEMPLATE/bug_report.yml)
- [Mermaid Contributing Guide](https://mermaid.js.org/community/contributing.html)
- [Mermaid Live Editor - Develop](https://develop.git.mermaid.live)

### 1.5 セキュリティ文脈との混同を避けるため明示的に切り分ける必要

**事項**: Mermaid **11.15.0 では同時に CVE-2026-41159(themeCSS 経由の CSS injection)、CVE-2026-41148(classDefs CSS injection)、CVE-2026-41149(state classDef HTML injection)が修正されている**。本件 Issue が機能性のリグレッション報告であり、セキュリティ脆弱性報告ではないことを本文で明示すべき。

**根拠**:
- 専門家 A が一次ソース確認(GitLab advisory database)。
- 専門家 O も「themeCSS / CSSOM / DOMPurify が絡むため、メンテナがセキュリティ文脈を警戒する可能性」を独立に指摘。
- Mermaid Bug template は security vulnerabilities を別ルートに送るよう案内しており、メンテナの誤分類リスクがある。

**追記推奨フレーズ**(Issue 本文 "Additional Context" 等に 1 行):

```
I do not believe this is a security vulnerability; this report is about a 
functional regression in casing handling of themeCSS selectors. I noticed 
11.15.0 includes CSS-injection hardening (CVE-2026-41159 / -41148 / -41149) 
in the same themeCSS pipeline, and want to be explicit this is a separate 
concern from those.
```

**参考一次ソース**:
- [CVE-2026-41159 (themeCSS CSS injection)](https://advisories.gitlab.com/npm/mermaid/CVE-2026-41159/)
- [CVE-2026-41148 (classDefs CSS injection)](https://advisories.gitlab.com/npm/mermaid/CVE-2026-41148/)
- [CVE-2026-41149 (state classDef HTML injection)](https://advisories.gitlab.com/npm/mermaid/CVE-2026-41149/)

### 1.6 歴史的文脈: PR #445(2017)で同種の lowercase 問題が修正済

**事項**: 2017-01-03 に knsv 自身がマージした PR #445「added tests and fix cli css style selector lowercase problem」が存在する。CLI の `cloneCssStyles` 経路で同種の lowercase 問題を解決した記録。

**根拠**:
- 専門家 A が一次ソースで確認(PR タイトル、merge 履歴、knsv のコメント "Great! Mermaid is really benefiting form your work.")。
- 9 年後に別経路(themeCSS + CSSOM)で類似の問題が再発しているという興味深い文脈。
- Issue 本文の "Related issues" 末尾に "Historical context (not duplicates)" として 1 段落言及することで、「再発防止のテスト追加候補」を示唆できる。

**参考一次ソース**:
- [Mermaid PR #445 (2017-01-03)](https://github.com/mermaid-js/mermaid/pull/445)

### 1.7 Issue template フォーマットへの構造的寄せが必要

**事項**: Mermaid 公式の Bug Report template は以下のフィールドを要求している:
- Description(必須)
- Steps to reproduce(必須、番号付きステップ推奨)
- Screenshots(任意)
- Code Sample(任意)
- Setup(Mermaid version + Browser and Version)
- Suggested Solutions
- Additional Context

**根拠**:
- 専門家 O / A が独立に同テンプレートを確認。
- 現ドラフトは内容として全要件を満たしているが、投稿画面でテンプレートに合わせて貼り分ける方がメンテナに親切。
- 特に "Steps to reproduce" は番号付きの明示的ステップに整形すべき(現状は文章ベース)。
- "Setup" 内に Browser and Version(Headless Chromium via Puppeteer bundled in mermaid-cli 11.14.0 等)の行を追加すべき。

### 1.8 SVG ファイル直接検査でドラフト主張と完全一致

**事項**: 添付の `output-with-themeCSS.svg` / `output-no-themeCSS.svg` を XML テキストとして直接検査した結果、ドラフト本文の主張(themeCSS あり: `foreignobject` 1 件 / `foreignObject` 10 件、themeCSS なし: 0 件 / 10 件)と**完全に一致**することが確認された。

**根拠**:
- 専門家 A が `/mnt/user-data/uploads/` でファイルを直接検査済、計測値一致を報告。
- 専門家 G が検証ドキュメントから論理的一致を確認。
- ただし**専門家 O の環境では SVG が JPEG として認識されており XML テキスト確認が未完了**だったため、A の検査結果が唯一の直接検査根拠。投稿者自身がローカルで再 grep して最終確認する必要がある(冗長化として)。

### 1.9 表現の微調整(主観・断定の弱化)

**事項**: ドラフトは概ね自然な技術英語だが、以下の表現は OSS 初投稿としてやや強すぎる。

**根拠**:
- 専門家 O / G が独立に同種の指摘(過剰な自信表現を弱める方向)。
- 専門家 A は「概ね自然」と評価しつつ、個別箇所で同方向の調整提案あり。

**確定的に弱化すべき表現(複数専門家が独立に指摘)**:

| 現状 | 推奨 | 理由 |
|---|---|---|
| `the popular workaround` | `a commonly suggested workaround` | "popular" は主観 |
| `This neatly explains` | `This appears to explain` | "neatly" は自信過剰に見える |
| `Root cause analysis (verified)` | `Verified output behavior vs. remaining unknown` | "Root cause" は実装段までの特定を示唆 |
| `Avoid the CSS pipeline entirely` | `Consider bypassing the CSS pipeline` | 命令形を避ける |
| `documented workaround` | `workaround shared in previous issues` | Mermaid 公式ドキュメントに正式掲載とは限らない |
| `I am not opening a PR at this point` | `I am holding off on a PR for now` | より軽い印象 |

---

## 2. 信頼度判定上、本ドキュメントに採用しなかった事項

以下は専門家のいずれかが言及したが、複数専門家の独立裏取りが取れない、または優先度が低いため採用を保留:

- 専門家 O の「`#my-svg` 固定 ID の由来説明 or `--id my-svg` コマンド追加」(O のみ言及、本件再現性に直接影響しない)
- 専門家 O の「`htmlLabels` の二重指定整理」(O のみ言及、害は少ない)
- 専門家 O の「`#2688` の open/closed 状態を再確認」(O のみ言及、投稿時に確認すれば足りる)
- 専門家 O の「`#1845` を関連 issue として追加候補」(本件の焦点がぼやけるため O 自身も「本文には入れず」と判断)
- 専門家 A の「別件報告(フォントメトリクス問題)の言及位置を『責任ある起票を条件にする』表現に変更」(A のみ言及、現状表現でも実害なし)
- タイトル短縮提案の具体形(O は `[Bug] themeCSS lowercases ... breaking SVG workaround in standalone mode` を提案、A は触れず。短縮自体は方向性として正しいが、具体形は確定とまでは言えない)

---

## 3. 投稿前の必須実施事項(本ドキュメント時点の合意ライン)

専門家レビュー結果を受け、本 Issue 投稿前に以下を**すべて完了**させる:

1. **11.14.0(PR #7737 取込前)での回帰検証**を実施し、結果を本文に反映(§1.3)
2. **develop ブランチ**(`https://develop.git.mermaid.live`)で再現確認し、本文に確認日を記載(§1.4)
3. ドラフト本文を **Mermaid Bug Report template の構造**(Description / Steps to reproduce / Setup / Suggested Solutions / Additional Context)に整形(§1.7)
4. 主観・断定表現を §1.9 の対応表に従って弱化
5. **CVE 修正済の文脈を切り分ける 1 段落を Additional Context に追加**(§1.5)
6. **PR #445(2017)を Historical context として Related issues 末尾に追加**(§1.6)
7. **PR #7737 への明示的言及**を "Root cause" 節に組み込み、stage 仮説を Highly likely / Remaining unknown に再構成(§1.2)
8. **タイトルから `v11.15.0` を外し、Environment 節に移動**(O 提案、A も同方向)
9. ローカルで両 SVG ファイルを再 grep し、計測値が `1/10` および `0/10` であることを再確認(§1.8 の冗長化)
10. **Setup 節に "Browser and Version: Headless Chromium via Puppeteer (bundled in mermaid-cli 11.14.0)" を追加**(§1.7)

---

## 4. 投稿後のメンテナ反応シナリオ(複数専門家が独立に予測した範囲)

確度の高い順(専門家 A の予測を中心に、O / G が補強した範囲):

| 確度 | 想定反応 | 事前準備すべき素材 |
|---|---|---|
| 高 | "This looks like it's caused by PR #7737. Confirmed." + Status: Approved | PR #7737 commit `37ff937` 直前(11.14.0)・直後(11.15.0)で切り替えた再現結果(§1.3) |
| 高 | "Can you reproduce on develop branch?" | `develop.git.mermaid.live` での確認結果(§1.4) |
| 中 | "Why not just use `htmlLabels: false`?" | 「v11.11+ で別の Approved Bug が複数 open(`#7565` 含む)」の 2 行説明 |
| 中 | "Would you submit a PR adding `overflow=visible` to the foreignObject elements?" | develop fork、`packages/mermaid/src/rendering-util/rendering-elements/createLabel.ts` 周辺の特定 |
| 低〜中 | "This is browser/CSSOM-spec behavior, not a Mermaid bug" | 「CSSOM lowercasing は仕様準拠だが、ユーザ可視の contract(themeCSS workaround)が silently 壊れたことが回帰」と返す文面 |
| 低 | "Insufficient repro, please use the live editor" | 「Live editor は inline SVG モードで本件 standalone モード問題を再現できない」と返す文面 |

---

## 5. 本リポジトリへの反映方針

1. 本ドキュメントを `docs/expert-reviews/` の正式レビュー資料として保管
2. `requirements.md` の `C-H-03` を更新し、PR #7737 と CSSOM 経路に関する情報を追記
3. Issue ドラフト本文(`docs/issue-drafts/2026-05-16_mermaid-themecss-lowercase-bug.md`)の修正は**ユーザー承認後**に着手(本ドキュメントは方針記録のみ、コード/ドラフト変更は含まない)

---

## 6. 参考一次資料

### Mermaid 公式
- [Mermaid PR #7737 (CSSOM 経路への切替)](https://github.com/mermaid-js/mermaid/pull/7737)
- [Mermaid PR #445 (2017-01-03 lowercase 修正)](https://github.com/mermaid-js/mermaid/pull/445)
- [Mermaid Bug Report template](https://github.com/mermaid-js/mermaid/blob/develop/.github/ISSUE_TEMPLATE/bug_report.yml)
- [Mermaid Contributing Guide](https://mermaid.js.org/community/contributing.html)
- [Mermaid Live Editor - Develop](https://develop.git.mermaid.live)
- [Mermaid Issue #7354 (縦方向リグレッション)](https://github.com/mermaid-js/mermaid/issues/7354)
- [Mermaid Issue #6424 (Long Words are Cut Off)](https://github.com/mermaid-js/mermaid/issues/6424)
- [Mermaid Issue #7565 (htmlLabels:false 回避事例)](https://github.com/mermaid-js/mermaid/issues/7565)
- [Mermaid `mermaidAPI.ts` (develop)](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/mermaidAPI.ts)

### Web 標準
- [W3C CSSOM Module Level 1 (selectorText シリアライズ規則)](https://www.w3.org/TR/cssom-1/)
- [WHATWG CSSOM Editor's Draft](https://drafts.csswg.org/cssom-1/)
- [MDN: CSS Type selectors / Case sensitivity](https://developer.mozilla.org/en-US/docs/Web/CSS/Type_selectors)
- [MDN: SVG `overflow` attribute](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/overflow)

### セキュリティ advisory
- [CVE-2026-41159 (themeCSS CSS injection)](https://advisories.gitlab.com/npm/mermaid/CVE-2026-41159/)
- [CVE-2026-41148 (classDefs CSS injection)](https://advisories.gitlab.com/npm/mermaid/CVE-2026-41148/)
- [CVE-2026-41149 (state classDef HTML injection)](https://advisories.gitlab.com/npm/mermaid/CVE-2026-41149/)

### 本リポジトリ内連動資料
- `docs/issue-drafts/2026-05-16_mermaid-themecss-lowercase-bug.md` — Issue ドラフト本体(本レビュー対象)
- `docs/svg-themecss-lowercase-verification-2026-05-16.md` — 検証手順と結果
- `docs/svg-themecss-lowercase-verification-2026-05-16/output-{with,no}-themeCSS.svg` — 検証成果物
- `docs/expert-reviews/2026-05-16_mermaid-issue-report-validity-best-practices.md` — 前回ラウンド専門家レビュー
- `docs/expert-reviews/2026-05-16_foreignobject-clip-and-font-metrics-best-practices.md` — クリップ事象の定量実測
