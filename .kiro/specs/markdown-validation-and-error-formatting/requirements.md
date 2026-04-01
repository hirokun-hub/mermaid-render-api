# 要件定義書: マークダウンバリデーション & エラーメッセージ整形

## イントロダクション

本ドキュメントは、既存の Mermaid 画像変換 API に対する2つの機能拡張の要件を定義する。

1. **マークダウン一括バリデーション**: マークダウン文書全体を受け取り、文書内に含まれるすべての Mermaid コードブロックの構文妥当性を一括で検証する機能
2. **エラーメッセージ整形**: `mmdc` が出力する生のエラー情報から、利用者に必要な情報だけを抽出して整形済みメッセージとして返却する機能

### 背景・動機

- 現状の `/render` エンドポイントは Mermaid コード単体のみを受け付ける。マークダウンファイル内に複数の Mermaid 図が含まれる場合、クライアントが自前で抽出・個別リクエストする必要がある
- 現状のエラーレスポンスは `mmdc` の `stderr` をそのまま返却している。この出力には一時ファイルパス、Puppeteer/Chromium 内部ログなど、エラー原因の特定に不要な情報が多く含まれる

### 前提

- 既存の `/render` エンドポイントの動作・レスポンス形式に対する後方互換性を維持する
- 既存の要件定義書（`mermaid-image-converter/requirements.md`）の要件はすべて引き続き有効である

## 用語集

既存の用語集に加え、以下を定義する。

- **Markdown_Text**: マークダウン形式のテキスト全体
- **Mermaid_Block**: Markdown_Text 内の ` ```mermaid ` で始まり ` ``` ` で終わるコードブロック1つ
- **Formatted_Message**: `mmdc` の Stderr から不要な情報を除去し、エラー原因の特定に必要な情報のみを整形したテキスト
- **Block_Index**: Markdown_Text 内で Mermaid_Block が出現する順序（0始まり）
- **Start_Line**: Markdown_Text 内で Mermaid_Block が開始する行番号（1始まり）

## 要件

### ユーザーストーリー 1: マークダウン内の Mermaid 一括バリデーション

**ストーリー**: AI エージェントとして、マークダウン文書内のすべての Mermaid 図の構文妥当性を一度のリクエストで確認したい。そうすることで、文書全体の品質を効率的に検証できる。

#### REQ-1.1: マークダウンバリデーションエンドポイントの提供

WHEN Client が `POST /validate` に Markdown_Text を送信したとき、THE System SHALL Markdown_Text 内のすべての Mermaid_Block を抽出し、各ブロックの構文妥当性を検証した結果を JSON で返却する。

#### REQ-1.2: Mermaid コードブロックの抽出

WHEN Markdown_Text を受け付けたとき、THE System SHALL ` ```mermaid ` で開始し ` ``` ` で終了するすべてのコードブロックを、出現順に抽出する。

#### REQ-1.3: 各ブロックの検証結果

WHEN Mermaid_Block の検証が完了したとき、THE System SHALL 各ブロックについて以下を返却する:
- `index`（number）: Block_Index
- `start_line`（number）: Start_Line
- `valid`（boolean）: 構文妥当性
- `message`（string|null）: 検証失敗時の Formatted_Message（成功時は null）
- `stderr`（string|null）: 検証失敗時の生 Stderr（成功時は null）

#### REQ-1.4: 集計情報の返却

THE System SHALL レスポンスに以下の集計情報を含める:
- `request_id`（string）: Request_ID
- `total`（number）: 抽出された Mermaid_Block の総数
- `valid_count`（number）: 検証成功したブロック数
- `invalid_count`（number）: 検証失敗したブロック数
- `results`（array）: 各ブロックの検証結果（REQ-1.3）

#### REQ-1.5: Mermaid ブロックが存在しない場合

WHEN Markdown_Text 内に Mermaid_Block が1つも存在しないとき、THE System SHALL `total: 0`、空の `results` 配列で HTTP 200 を返却する。

#### REQ-1.6: 入力検証

1. WHEN `markdown` パラメータが未指定または文字列でないとき、THE System SHALL HTTP 400 でエラーを返却する。
2. WHEN `markdown` パラメータが空文字列のとき、THE System SHALL HTTP 400 でエラーを返却する。
3. WHEN `markdown` のサイズが上限を超えたとき、THE System SHALL HTTP 400 でエラーを返却する。

#### REQ-1.7: 同時実行制御との統合

THE System SHALL `/validate` リクエスト全体で Concurrent_Limit のスロットを1つだけ消費する。個々の Mermaid_Block の検証は順次実行し、スロットを追加消費しない。

### ユーザーストーリー 2: エラーメッセージの整形

**ストーリー**: AI エージェントとして、Mermaid 変換エラーの要点を素早く把握したい。そうすることで、不要な情報を読み飛ばす手間なく、エラー原因の特定と修正に集中できる。

#### REQ-2.1: 整形済みメッセージの生成

WHEN Render_Process が失敗したとき、THE System SHALL Stderr から Formatted_Message を生成する。

#### REQ-2.2: 除去対象の情報

THE System SHALL Formatted_Message の生成時に、以下の情報を Stderr から除去する:
- 一時ファイルの絶対パス（例: `/tmp/mermaid-render-api/...`）
- Puppeteer / Chromium の内部ログおよび警告
- Node.js のスタックトレース
- 連続する空行（1行に圧縮）

#### REQ-2.3: 保持対象の情報

THE System SHALL Formatted_Message に、以下の情報を保持する:
- 構文エラーの内容（例: `Syntax error`、`Parse error` とその詳細）
- エラーが発生した行・列の情報（mmdc が出力する場合）
- Mermaid 固有のエラーメッセージ

#### REQ-2.4: `/render` エンドポイントへの適用

WHEN `/render` エンドポイントで Render_Process が失敗したとき、THE System SHALL 既存のエラーレスポンス JSON に `message` フィールドを追加し、Formatted_Message を格納する。

#### REQ-2.5: 生データの保持

THE System SHALL 既存の `stderr` フィールドを変更せず、`mmdc` の生出力をそのまま返却し続ける。

#### REQ-2.6: 整形失敗時のフォールバック

IF Stderr から有用な情報を抽出できなかった場合、THEN THE System SHALL `message` フィールドに Stderr の先頭部分（切り詰め）をそのまま格納する。

### ユーザーストーリー 3: 後方互換性の維持

**ストーリー**: 既存の API 利用者として、今回の機能追加によって既存の動作が変わらないことを期待する。そうすることで、既存のクライアントコードを修正せずに済む。

#### REQ-3.1: 既存フィールドの維持

THE System SHALL `/render` エンドポイントの既存レスポンスフィールド（`request_id`、`error_type`、`status_code`、`stderr`、`exit_code`、`format`）をすべて維持する。

#### REQ-3.2: 成功時レスポンスの不変

WHEN `/render` エンドポイントで Render_Process が成功したとき、THE System SHALL 既存のレスポンス形式（画像バイナリ + Content-Type ヘッダ）を変更しない。

#### REQ-3.3: 既存エンドポイントの URL 不変

THE System SHALL `/render` および `/healthz` エンドポイントの URL パスを変更しない。

## API 仕様

### POST /validate

#### 目的

マークダウン文書内のすべての Mermaid コードブロックの構文妥当性を一括検証する。

#### Request（JSON）

- `markdown`（string, required）: マークダウン形式のテキスト全体

#### Response（成功: HTTP 200, JSON）

```json
{
  "request_id": "abc-123",
  "total": 2,
  "valid_count": 1,
  "invalid_count": 1,
  "results": [
    {
      "index": 0,
      "start_line": 3,
      "valid": true,
      "message": null,
      "stderr": null
    },
    {
      "index": 1,
      "start_line": 12,
      "valid": false,
      "message": "Syntax error on line 2: unexpected token 'X'",
      "stderr": "(raw mmdc stderr output)"
    }
  ]
}
```

#### Response（入力不正: HTTP 400, JSON）

```json
{
  "request_id": "abc-124",
  "error_type": "invalid_request",
  "status_code": 400,
  "message": "markdown must be a string"
}
```

### POST /render（変更点のみ）

#### エラーレスポンスへのフィールド追加

既存フィールドに加え、`message` フィールドを追加する。

```json
{
  "request_id": "abc-125",
  "error_type": "parse_error",
  "status_code": 400,
  "message": "Syntax error on line 2: unexpected token 'X'",
  "stderr": "(raw mmdc stderr output)",
  "exit_code": 1,
  "format": "svg"
}
```

## 技術的制約

（今後追記予定）
