# 要件定義書: beautiful-svg-rendering

## 1. イントロダクション

### 1.1 目的

本改修は、`mermaid-render-api` が返す SVG/PNG を **AI 生成 Mermaid を単独 HTML(スタンドアロン) に直接埋め込んで配布する**ユースケースで美しく機能するように、レンダリング既定値・API パラメータ・エラー応答・内部アーキテクチャを刷新する。親要件定義書(`mermaid-image-converter/requirements.md`)で定めた **エラー透過性・タイムアウト・同時実行制御・ヘルスチェック・Docker 動作** 等の MVP 要件はすべて維持する。

### 1.2 背景

実機 10 ケースの定量調査(`docs/svg-padding-investigation/REPORT.md`)で次が確認された:

- **ノード内余白が固定で大きい**(`rect` で横 60px / 縦 30px、形状ごとに異なる)
- **配布先ブラウザのフォントが Noto Sans CJK JP を持たない場合に `<foreignObject>` 境界でテキストが視覚的にクリップされる**(case 10「整理する(手動 + ✓)」で再現)
- **SVG ルートに付与される `style="max-width: <px>"` が配布 HTML の responsive CSS と干渉する**
- **エラー応答が `mmdc` の生 stderr のみで、行番号やユーザー由来部分の特定が AI/利用者に難しい**

加えて、リクエストごとに `mmdc` を subprocess 起動するため、Puppeteer/Chromium のブート時間が 1〜2 秒/req の固定オーバーヘッドとして乗っている。

### 1.3 関連ドキュメント

- 親要件定義書: `mermaid-image-converter/requirements.md`(MVP 要件)
- 親 API 仕様: `docs/API仕様_Mermaid画像変換API.md`
- 定量調査: `docs/svg-padding-investigation/REPORT.md`
- 専門家レビュー: `docs/expert-reviews/2026-05-10_mermaid-svg-rendering-best-practices.md`
- 設計書: `design.md`(本ディレクトリ)

### 1.4 用語集

- **Beautiful_Defaults**: 配布 HTML embed 用途で美しく出力するためのサーバ側既定 Mermaid 設定の総称
- **Mermaid_Config_Override**: リクエストで明示指定される Mermaid 公式設定の部分集合
- **Post_Process_Option**: SVG 生成後にサーバ側で適用する後処理オプションの総称(ID 一意化、`max-width` 除去等)
- **Browser_Pool**: Puppeteer ブラウザインスタンスをリクエスト間で共有する内部仕組み
- **Programmatic_API**: `@mermaid-js/mermaid-cli` が export する `renderMermaid` 関数(Puppeteer ブラウザを引数に取り、`mmdc` subprocess を起動しない)
- **Server_Locked_Setting**: ユーザーが上書き不可能なサーバ側固定設定(セキュリティ目的)

### 1.5 本ドキュメントの読み方

- **§3「ユーザーストーリーと要件」が中心**。各 US セクション配下に、そのストーリーを達成するための機能要件(EARS)が直接埋め込まれている。
- 1 つの要件が複数 US に関連する場合、**主担当 US に本文を 1 回だけ書き、他 US は番号参照**にしている(DRY)。各 US の冒頭に「関連 REQ 一覧(主担当 / 参照)」の早見表を置く。
- どの US にも単独で紐付かない横断的要件(セキュリティガードレール、入力契約ガードレール、デフォルト挙動の禁止事項)は **§4「横断要件」**にまとめる。
- 具体的なデフォルト値・パラメータ命名・型定義・実装ロジックは本ファイルでは扱わず、`design.md` を参照する(DRY)。

## 2. 技術的制約

本セクションは、`docs/expert-reviews/2026-05-10_mermaid-svg-rendering-best-practices.md` で信頼性 ≥97% と判定した一次ソース確認済の事実を要件に転記したもの。設計判断の前提条件として扱う。

### 2.1 Mermaid v11 系の制約

- **C-M-01**: `flowchart.padding`(Mermaid デフォルト 15)は公式 schema で「**Only used in new experimental rendering**」と明記されている。本リポジトリ採用の `dagre-wrapper`(v11 系の安定デフォルト)では効かない前提とする。
- **C-M-02**: `flowchart.htmlLabels` は v11.12.3+ で **DEPRECATED**。ルートの `htmlLabels` を使用しなければならない。
- **C-M-03**: `htmlLabels: false` は v11.11+ で複数の Approved Bug が open。デフォルト適用してはならない。
  - [#7015](https://github.com/mermaid-js/mermaid/issues/7015) エンティティコード(`#quot;` 等)が無効化される
  - [#7016](https://github.com/mermaid-js/mermaid/issues/7016) 特殊文字(`<`,`>`,`\*`)の処理破綻
  - [#1177](https://github.com/mermaid-js/mermaid/issues/1177) 複数行ラベルの水平中央寄せ失敗
- **C-M-04**: ELK レイアウトエンジン(`layout: elk`)は v11 では `@mermaid-js/layout-elk` 別パッケージだが、本リポジトリの `@mermaid-js/mermaid-cli@^11.12` は bundle 済のため追加導入不要。一方で title 消失([#4813](https://github.com/mermaid-js/mermaid/issues/4813))・empty subgraph クラッシュ([#5402](https://github.com/mermaid-js/mermaid/issues/5402))の既知不具合があり、デフォルト採用してはならない。
- **C-M-05**: `mmdc` CLI には設定 JSON を inline で渡すフラグが存在しない(`-c, --configFile <path>` のみ)。設定変更は **ファイル経由** か、Programmatic_API を用いてオブジェクト直渡しのいずれか。
- **C-M-06**: Mermaid のパースエラー stderr に出る「`Parse error on line N:`」の `N` には [#3853](https://github.com/mermaid-js/mermaid/issues/3853) で long-open の行番号ずれバグがある。エラー応答で行番号を扱う場合は「N 行目付近」相当の曖昧度を残してよい。
- **C-M-07**: `@mermaid-js/mermaid-cli` の **Programmatic_API は semver 対象外**(README 明記)。依存バージョン pinning と移行検証手段を持つこと。

### 2.2 配布 HTML 埋込用途の制約

- **C-H-01**: 同一 HTML に複数 SVG を inline embed すると `<marker id="arrowhead">` 等の SVG 内部 ID が衝突し、2 つめ以降の矢印描画が破綻する。**本改修は単一ページに 1 SVG 埋込を想定**し、複数 SVG 配置は将来別票で扱う(§8)。
- **C-H-02**: `flowchart.useMaxWidth: true`(Mermaid デフォルト)は SVG ルートに `style="max-width: <px>px"` を付与する。`false` 指定でこれが消え、絶対 px の `width`/`height` 属性 + `viewBox` 出力に切り替わる。配布 HTML 側 CSS で responsive 化したい用途では `false` が好ましい。
- **C-H-03**: コンシューマ側ブラウザに Noto Sans CJK JP 等のサーバ側採用フォントが存在しない場合、`<foreignObject>` の事前計算幅と実描画幅にズレが生じる。foreignObject はブラウザ実装上 `overflow:hidden` 相当でクリップされる傾向があり、コンテンツが境界で見切れる。

### 2.3 セキュリティおよびリソース制限

- **C-S-01**: 入力 Mermaid テキストは信用してはならない(AI 生成想定)。`securityLevel` は `strict` を Server_Locked_Setting としてサーバ側で固定し、リクエストでの上書きを許可してはならない。
- **C-S-02**: Mermaid の `maxTextSize`(schema デフォルト 50000)と `maxEdges`(schema デフォルト 500)を遵守する。
- **C-S-03**: 親要件定義書 §3「入力検証」で定めた入力サイズ上限(現状 `MAX_CODE_SIZE=50KB`)を本改修でも遵守する。

## 3. ユーザーストーリーと要件

各 US セクションは「ストーリー本文 → 関連 REQ 早見表 → 主担当 REQ 本文 → 参照 REQ(他 US に本文があるもの)」の順で記述する。**主担当 REQ の本文はストーリーごとに 1 回だけ出現する**(DRY)。検証時に EARS 述語の網羅性を確認する場合は、本ドキュメント全体に対し `grep -E "SHALL|SHOULD"` を実行する。

### 3.1 US-01: 配布資料作成者(美しい単独 HTML 埋込)

> **ロール**: 配布資料作成者
> **やりたいこと**: AI 生成 Mermaid を単独 HTML(スタンドアロン)に直接埋め込み配布する
> **価値**: 配布先のフォント環境に依存せず、追加の SVG 後加工なしで美しく見える

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-01 | 美しい既定出力 | 主 |
| REQ-U-04 | Post_Process_Option の受理 | 主 |
| REQ-E-05 | PNG での SVG 専用オプション無視 | 参照 → US-04 |
| REQ-U-07 | Syntax error 図の混入防止 | 参照 → US-05 |

#### REQ-U-01: 美しい既定出力

THE System SHALL リクエストで Mermaid_Config_Override が一切指定されない場合でも、配布 HTML 用途で美しいと判定される Beautiful_Defaults を適用した SVG/PNG を返却する。

> 関連: US-02(見切れ回避)、US-03(余白圧縮)もこの要件に依存する。

#### REQ-U-04: Post_Process_Option の受理

THE System SHALL リクエスト本文に Post_Process_Option(API 独自の後処理指示)を含めることを許可し、SVG 生成時または生成後にサーバ側で適用する。

> 関連: US-04(responsive 化のための `max-width` 除去)もこの要件に依存する。

### 3.2 US-02: AI 利用者(見切れ回避)

> **ロール**: AI 利用者(Mermaid を出力する LLM 含む)
> **やりたいこと**: ノード見切れの心配なしに Mermaid コードを生成する
> **価値**: レイアウト調整の試行錯誤やラベル短縮を強制されない

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-01 | 美しい既定出力(見切れ防止を含む) | 参照 → US-01 |
| REQ-E-01 | Mermaid_Config_Override 指定時のマージ | 参照 → US-03 |
| REQ-U-03 | リクエスト時設定上書きの受理 | 参照 → US-03 |

このストーリーは独自の機能要件を追加せず、US-01(`Beautiful_Defaults` で foreignObject クリップを抑制)および US-03(`Mermaid_Config_Override` で個別調整)を組み合わせて達成する。具体的な見切れ対策(themeCSS による `overflow: visible` 等)は `design.md` §3.1 の `BEAUTIFUL_DEFAULTS` テーブルを参照。

### 3.3 US-03: 余白圧縮を求める利用者

> **ロール**: 配布資料作成者
> **やりたいこと**: ノード余白が小さくスッキリした図にしたい
> **価値**: 限られた紙面/画面で密度高く情報伝達できる

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-03 | リクエスト時設定上書きの受理 | 主 |
| REQ-E-01 | Mermaid_Config_Override 指定時のマージ | 主 |
| REQ-U-01 | Beautiful_Defaults による既定の余白圧縮 | 参照 → US-01 |

#### REQ-U-03: リクエスト時設定上書きの受理

THE System SHALL リクエスト本文に Mermaid_Config_Override(Mermaid 公式 schema 準拠キー)を含めることを許可し、Beautiful_Defaults より優先して適用する。ただし Server_Locked_Setting については §4.1(横断要件・セキュリティガードレール)に従う。

#### REQ-E-01: Mermaid_Config_Override 指定時のマージ

WHEN クライアントが Mermaid_Config_Override に正常な Mermaid 設定キーを含めて送信したとき、THE System SHALL Beautiful_Defaults を基底とし、上書き値で deep merge し、最後に Server_Locked_Setting を強制適用する。

### 3.4 US-04: 配布 HTML を responsive 化したい利用者

> **ロール**: 配布 HTML 作成者
> **やりたいこと**: SVG を `max-width: 100%; height: auto;` で responsive 表示したい
> **価値**: クライアント側で `style="max-width:..."` を正規表現で剥がすワークアラウンドが不要になる

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-E-05 | PNG での SVG 専用オプション無視 | 主 |
| REQ-U-04 | Post_Process_Option の受理(本ストーリーで具体活用) | 参照 → US-01 |
| REQ-U-01 | Beautiful_Defaults による既定 `useMaxWidth: false` | 参照 → US-01 |

**達成パス**: 本ストーリーは独自の主担当 REQ を必要最小限(REQ-E-05)に留め、責務は次の順で達成する:

1. `Beautiful_Defaults` の `useMaxWidth: false`(REQ-U-01 / `design.md` §3.1)で SVG ルートの `style="max-width: <px>px"` 付与を抑止する
2. それでも残る場合や PNG 等別経路で挿入されるケース向けに `post_process.strip_max_width=true`(REQ-U-04 / `design.md` §3.3)を任意で併用できる
3. PNG リクエストで上記オプションを誤指定しても 200 で PNG を返す(REQ-E-05)

#### REQ-E-05: PNG リクエストでの SVG 専用 Post_Process_Option

WHEN クライアントが `format=png` のリクエストで SVG 出力にのみ意味のある Post_Process_Option(例: SVG ルートの ID 一意化、`max-width` 除去)を指定したとき、THE System SHALL 当該オプションを無視し、警告ログを記録する。HTTP 200 で PNG を返却する。

> 注: `useMaxWidth: false` 指定で SVG ルートの `style="max-width:..."` を消すこと自体は Mermaid 設定で制御するが、配布側で responsive 化したい場合に `Post_Process_Option` を任意に併用できる(具体オプション名は `design.md` 参照)。

### 3.5 US-05: AI 利用者 / 開発者(エラー可読性)

> **ロール**: AI 利用者 / 開発者
> **やりたいこと**: Mermaid 構文エラー時に「どこが悪いか」を明確に知りたい
> **価値**: エラー自己修復(LLM が再生成)や手動修正がしやすい

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-05 | 構造化エラー応答 | 主 |
| REQ-U-07 | Syntax error 図の混入防止 | 主 |
| REQ-E-03 | 構文エラー時の error_message 抽出 | 主 |
| REQ-E-04 | 行番号の抽出 | 主 |

#### REQ-U-05: 構造化エラー応答

THE System SHALL Mermaid のパース/レンダリング失敗時、レンダラ由来の raw stderr/例外メッセージに加えて、ユーザー由来部分を抽出した可読メッセージと、抽出可能な場合の参照行情報を含む JSON を返却する。

#### REQ-U-07: エラー時の Syntax error 図の混入防止

THE System SHALL Mermaid 既定の「Syntax error 図」が SVG として返却されることを防ぐ。

#### REQ-E-03: 構文エラー時の error_message 抽出

WHEN Render_Process が Mermaid のパースエラーで失敗したとき、THE System SHALL `stderr` または例外メッセージから「ユーザー Mermaid コード由来のエラー本文」を抽出し、構造化応答に含める。抽出失敗時は空文字または `null` を許可する。

#### REQ-E-04: 行番号の抽出

WHEN error_message に Mermaid 由来の行番号情報が含まれるとき、THE System SHALL 行番号を整数値として抽出し、応答に含める。抽出できない場合は `null` を返す。行番号にずれがあり得る点(C-M-06)は応答メッセージに含意される表現にとどめる。

### 3.6 US-06: 既存 API 利用者(後方互換)

> **ロール**: 既存 API 利用者
> **やりたいこと**: 改修前と同じ最小リクエスト(`code` + `format` のみ)を出してもエラーにならず動かしたい
> **価値**: 自動化スクリプトやクライアント実装を変更せず移行できる

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-02 | 既存 API 形状の後方互換 | 主 |

#### REQ-U-02: 既存 API 形状の後方互換

THE System SHALL 親要件定義書(`mermaid-image-converter`)で定義された最小リクエスト形状(`code` + `format` + `timeout_ms` のみ)を引き続き受理し、HTTP 200 で画像を返却する。

> 注: 出力バイト互換は保証しない(Beautiful_Defaults により見た目は変わる)。詳細は §5.3「後方互換性ポリシー」参照。

### 3.7 US-07: 高頻度利用者(レイテンシ短縮)

> **ロール**: 高頻度利用者
> **やりたいこと**: 1 リクエストあたりの応答時間を短くしたい
> **価値**: バッチで多数の図を生成する際の待ち時間を圧縮できる

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-08 | Browser_Pool の常駐 | 主 |
| REQ-S-01 | Browser_Pool 起動失敗時の挙動 | 主 |
| REQ-S-02 | Browser_Pool 障害検知時 | 主 |

#### REQ-U-08: Browser_Pool の常駐

THE System SHALL Programmatic_API + Browser_Pool 方式でレンダリングを実行し、リクエストごとに Puppeteer/Chromium を起動・終了してはならない。

#### REQ-S-01: Browser_Pool 起動失敗時の挙動

WHILE Browser_Pool の初期化が完了していない間、THE System SHALL `/render` リクエストに対し HTTP 503 で `error_type=service_unavailable` を返却する。`/healthz` の応答は維持する。

#### REQ-S-02: Browser_Pool 障害検知時

WHILE Browser_Pool のいずれかのインスタンスが応答不能と判定されている間、THE System SHALL 当該インスタンスを除外し、健全なインスタンスでレンダリングを続行する。すべてのインスタンスが不能になった場合は REQ-S-01 と同じ応答とする。

## 4. 横断要件

どの US にも単独で紐付かず、システム全体に横断的に適用される要件。

### 4.1 セキュリティガードレール

#### REQ-U-06: securityLevel の固定(C-S-01)

THE System SHALL レンダリング時の `securityLevel` を `strict` に固定する。

#### REQ-E-02: Server_Locked_Setting への上書き試行(C-S-01)

WHEN クライアントが Mermaid_Config_Override 内で Server_Locked_Setting(`securityLevel` 等)を指定したとき、THE System SHALL 当該指定を無視し、警告ログを記録する。リクエストはエラーにせず処理を継続する。

#### REQ-UN-01: Server_Locked_Setting の上書き禁止(C-S-01)

THE System SHALL Mermaid_Config_Override を経由したいかなる入力に対しても、Server_Locked_Setting(少なくとも `securityLevel` を含む)を上書きしてはならない。

#### REQ-UN-04: Mermaid_Code の永続保存禁止(親要件継承)

THE System SHALL リクエストで受け取った Mermaid コードを永続ストレージに保存してはならない。

#### REQ-UN-05: 任意 CSS 注入の制限

THE System SHALL Mermaid_Config_Override 経由で渡される `themeCSS` 文字列の長さ・内容に対し、設計書で定める上限・拒否規約に反する指定を拒否する。

### 4.2 入力契約のガードレール

#### REQ-E-06: 未知キーの受理

WHEN クライアントが Mermaid_Config_Override または Post_Process_Option に本 API が認識しないキーを含めて送信したとき、THE System SHALL 当該未知キーを API 層で削除した上で `renderMermaid` に渡し、警告コード `unknown_key` を記録する。リクエストはエラーにせず処理を継続する。

#### REQ-E-07: 型不正な Mermaid_Config_Override / Post_Process_Option

WHEN クライアントが Mermaid_Config_Override または Post_Process_Option の値に明確に型不正(例: boolean 必須の場所に文字列)を指定したとき、THE System SHALL HTTP 400 で `error_type=invalid_request` を返却する。

### 4.3 デフォルト挙動の禁止事項

#### REQ-UN-02: htmlLabels の既定 false 化禁止(C-M-03)

THE System SHALL Beautiful_Defaults において `htmlLabels` を `false` に設定してはならない。`htmlLabels: false` はオプトインパラメータとしてのみ提供する。

#### REQ-UN-03: ELK レンダラの既定採用禁止(C-M-04)

THE System SHALL Beautiful_Defaults において `layout: "elk"` を既定としてはならない。ELK レイアウトはオプトインパラメータとしてのみ提供する。

## 5. API 仕様(MVP 改訂)

本セクションは API の入出力契約のみを定義する。**フィールドの値の取り得る範囲・データ型・JSON 例・処理ロジックは `design.md` を参照する**。

### 5.1 POST /render(改訂)

#### リクエスト本文の必須/任意フィールド

| フィールド | 必須/任意 | 由来 | 概要 |
|---|---|---|---|
| `code` | 必須 | 親要件継承 | Mermaid コード本文 |
| `format` | 任意 | 親要件継承 | 出力フォーマット |
| `timeout_ms` | 任意 | 親要件継承 | レンダリング上限時間 |
| `mermaid_config` | **任意(新規)** | 本要件 | Mermaid 公式 schema 準拠の設定(Mermaid_Config_Override) |
| `post_process` | **任意(新規)** | 本要件 | SVG 後処理オプション(Post_Process_Option) |

#### レスポンス(成功時)

親要件定義書「要件 10」を継承。SVG/PNG バイナリ + `Content-Type` + `X-Request-Id` ヘッダ。

#### レスポンス(失敗時、改訂)

親要件定義書「要件 10」で定めた最低限フィールドに加え、本改修で以下を**追加**する:

| フィールド | 型 | 概要 |
|---|---|---|
| `error_message` | string \| null | レンダラ由来の raw stderr/例外メッセージからユーザー由来部分を抽出した可読メッセージ |
| `line` | integer \| null | Mermaid コード内の参照行番号(抽出可能時のみ、ずれの可能性あり) |

既存フィールド(`request_id`、`error_type`、`status_code`、`stderr`、`exit_code`、`format`)は維持する。

#### HTTP ステータスコード

親要件「要件 10」の使い分けを継承し、以下を追加する:

- **503**: Browser_Pool 未初期化または全インスタンス不能(REQ-S-01 / REQ-S-02)
  - `error_type=service_unavailable`

### 5.2 GET /healthz

親要件定義書「要件 8」を継承(変更なし)。

### 5.3 後方互換性ポリシー

- **リクエスト形状**: 既存の最小リクエストを引き続き受理し、HTTP 200 を返す(REQ-U-02)
- **レスポンス形状**: 既存フィールドはすべて維持。本改修ではフィールドを**追加するのみ**で削除・改名はしない
- **出力バイト互換**: **保証しない**。Beautiful_Defaults 適用により SVG/PNG の見た目は変わる(US-01〜US-03 の達成のため意図された変更)
- **エラーレスポンス**: 既存フィールドはすべて維持し、`error_message` / `line` を追加する形

## 6. 受入基準サマリ(横断確認用)

| 確認項目 | 関連要件 | 関連 US |
|---|---|---|
| 改修前と同じ最小リクエストが HTTP 200 で動作する | REQ-U-02 | US-06 |
| 何も指定しないリクエストの SVG が、配布 HTML embed 用途で意図した「美しさ」を達成する | REQ-U-01 | US-01 |
| `mermaid_config` で指定した値がレンダリング結果に反映される | REQ-E-01 | US-03 |
| `securityLevel: "loose"` を指定しても無視され、`strict` のままレンダリングされる | REQ-E-02, REQ-UN-01, REQ-U-06 | 横断 |
| パース失敗時のレスポンスに `error_message` / `line` フィールドが含まれる | REQ-U-05, REQ-E-03, REQ-E-04 | US-05 |
| 構文エラー時に "Syntax error" 図 SVG が返却されない | REQ-U-07 | US-05 |
| 連続 100 リクエストで Puppeteer プロセスがリクエスト数に比例して増えない | REQ-U-08 | US-07 |
| Browser_Pool 初期化前のリクエストが 503 を返す | REQ-S-01 | US-07 |
| `format=png` で SVG 専用 Post_Process_Option を指定しても PNG が返る | REQ-E-05 | US-04 |

## 7. 非機能要件

### NFR-01: レイテンシ目標

THE System SHALL 単純な flowchart(ノード 5 個以下)のレンダリングを定常状態で **応答時間中央値 500ms 以下**で完了する。具体的な計測条件・しきい値は `design.md` の性能計測戦略を参照。

### NFR-02: 互換性

THE System SHALL `@mermaid-js/mermaid-cli@^11.12.0` 系を継続採用する。本改修のためのバージョンアップは行わない(必要性が判明した時点で別票)。

### NFR-03: 段階的デプロイ

THE System SHALL 現行本番 Docker コンテナを稼働させたままテスト用 Docker コンテナで検証可能な状態を提供する。詳細手順は `design.md` のデプロイ戦略を参照。

### NFR-04: 観測可能性

THE System SHALL 新規パラメータが指定されたリクエストおよび警告条件(未知キー、Server_Locked_Setting 上書き試行等)を構造化ログで識別可能にする。

## 8. Out of Scope(本改修の範囲外、将来別票)

- **同一ページ複数 SVG embed の ID 衝突完全対応**: 軽量 ID 一意化(設計書 §7)のみ実装する。SVG 内部 ID(`<marker>`, `<clipPath>` 等)の完全 rewrite は別票。
- **ELK レイアウトのデフォルト採用**: 既知不具合(C-M-04)が解消された時点で再評価。
- **`htmlLabels: false` のサポート強化**: v11.11+ の既知バグ(C-M-03)が修正されるまでオプトインのまま。
- **Mermaid バージョンアップ**: 本改修では現行バージョン系統を使用(NFR-02)。
- **エラーメッセージの日本語化**: AI 自己修復・GitHub Issue 照合のために英語原文を保持。日本語化は将来検討。
- **Web フォント同梱・font subsetting**: 配布物の肥大化トレードオフが大きく別票。
- **キャッシュ・非同期ジョブ・大規模スケール**: 親要件定義書の Out of Scope を継承。

## 9. 親要件との関係

本要件定義書は親要件定義書(`mermaid-image-converter/requirements.md`)を**拡張**する位置付けであり、親要件のうち以下を**そのまま継承**する:

- 要件 1(Mermaid コードの受付と画像変換)
- 要件 2(エラー情報の透過的な返却)— ただし本改修で `error_message` / `line` フィールドを**追加**する
- 要件 3(入力検証)
- 要件 4(タイムアウト処理)
- 要件 5(同時実行制御)
- 要件 6(ログ記録とトレーサビリティ)
- 要件 7(一時ファイル管理)— Programmatic_API 採用により一時ファイル数は減るが、削除規約は維持
- 要件 8(ヘルスチェック)
- 要件 9(Docker 環境での動作)
- 要件 10(レスポンス形式)— 本改修で失敗時 JSON にフィールドを**追加**する
- 要件 11(セキュリティ MVP)

親要件と本要件で齟齬が発生した場合、本要件を優先する(より新しい意思決定であるため)。
