# 要件定義書

## イントロダクション

本システムは、Mermaidコード（テキスト）をHTTP API経由で受け取り、`mmdc`（Mermaid CLI）を使用してSVGまたはPNG画像に変換して返すサービスです。変換失敗時には、エラーメッセージを加工せずそのまま返却することで、AIによるMermaid図の作成・修正を支援します。MVPとして個人利用を想定し、「まず動作すること」を最優先とします。

### 技術前提

- API実装はNode.jsを採用する（`mmdc`との整合性とMVPの成功確率を優先）
- 入力はMermaidコード（テキスト）のみ（画像入力は存在しない）
- Mermaid Frontmatter（YAML）を使用するため、Mermaid v10.5.0+ を含むCLI（例: `@mermaid-js/mermaid-cli`）を利用する
- Windows Docker環境で動作すること

### 技術的制約（開発環境）

- CodexのApps Connector（GitHub / Gmail / Google Calendar等）は、`codex_apps` MCP clientの起動に失敗すると利用できない。`tools/list`が30秒以内に返らず `failed to get client` になる場合、リポジトリ内の実装・テスト作業自体には影響しないが、PR確認・メール検索・カレンダー確認などの外部連携は利用不能になる。
- Codexの連携設定や認証情報を調査する場合、`~/.codex/auth.json` はアクセストークンを含む秘密情報として扱い、本文をログ・Issue・チャットへ貼り付けてはならない。
- Codex Apps Connectorの不調を切り分ける場合は、`~/.codex/log/codex-tui.log`、`~/.codex/config.toml`、`~/.codex/cache/codex_apps_tools/` を確認対象とし、設定変更やキャッシュ退避はCodexを再起動する前提で行う。

### 利用シナリオ（In Scope）

- Tailscale経由で、iPhone/iPad/MacからWindows上のDockerへアクセスして利用できることを想定する

## 用語集

- **System**: Mermaid画像変換APIシステム全体
- **Mermaid_Code**: Mermaid定義テキスト（`---`で始まるFrontmatterを含む場合がある）
- **mmdc**: Mermaid CLI（Mermaidコードを画像に変換するコマンドラインツール）
- **Request_ID**: リクエストを一意に識別するID（ログ突合用）
- **Stderr**: `mmdc`実行時に出力される標準エラー出力
- **Client**: APIを呼び出すクライアントアプリケーション
- **Render_Process**: Mermaidコードを画像に変換する処理
- **Timeout**: レンダリング処理の最大実行時間
- **Concurrent_Limit**: 同時に実行可能なレンダリング処理の上限数

## 要件

### 要件 1: Mermaidコードの受付と画像変換

**ユーザーストーリー**: 開発者として、MermaidコードをAPIに送信して画像を取得したい。そうすることで、Mermaid図を様々なアプリケーションで利用できる。

#### 受入基準

1. THE System SHALL Mermaid_Codeを入力として受け付ける
2. THE System SHALL `mmdc`を用いてMermaid_Codeを画像へ変換する
3. WHEN Render_Processが成功したとき、THE System SHALL 指定されたフォーマット（SVGまたはPNG）で画像を返却する
4. THE System SHALL すべてのレスポンスにRequest_IDを含める

### 要件 2: エラー情報の透過的な返却

**ユーザーストーリー**: AIエージェントとして、Mermaid変換エラーの詳細情報を取得したい。そうすることで、エラー原因を特定してMermaidコードを修正できる。

#### 受入基準

1. WHEN Render_Processが失敗したとき、THE System SHALL `mmdc`のStderrを加工せず返却する
2. THE System SHALL Stderrを要約・翻訳・改変してはならない
3. WHEN Render_Processが失敗したとき、THE System SHALL エラー種別、HTTPステータスコード、終了コードを含むJSONレスポンスを返却する

### 要件 3: 入力検証

**ユーザーストーリー**: 開発者として、不正な入力に対して適切なエラーメッセージを受け取りたい。そうすることで、問題を素早く特定して修正できる。

#### 受入基準

1. WHEN Clientが`/render`にリクエストを送信したとき、THE System SHALL `code`パラメータの存在とサイズを検証する
2. WHEN `code`が未指定または空のとき、THE System SHALL HTTP 400でエラーを返却する
3. WHEN `format`が未指定のとき、THE System SHALL デフォルト値として`svg`を使用する
4. WHEN `format`が`svg`または`png`以外のとき、THE System SHALL HTTP 400でエラーを返却する
5. WHEN `code`のサイズが上限を超えたとき、THE System SHALL HTTP 400でエラーを返却する
6. THE System SHALL 入力`code`の最大サイズ上限を設定する（例: 50KB）

### 要件 4: タイムアウト処理

**ユーザーストーリー**: システム管理者として、長時間実行されるレンダリング処理を制限したい。そうすることで、システムリソースを保護できる。

#### 受入基準

1. THE System SHALL Render_ProcessにTimeoutを設定する（例: 8000ms）
2. THE System SHALL リクエストで`timeout_ms`パラメータを受け付け、未指定時はサーバ既定値を使用する
3. WHEN Render_ProcessがTimeoutを超えたとき、THE System SHALL 処理を中断する
4. WHEN Render_ProcessがTimeoutを超えたとき、THE System SHALL HTTP 504でエラーを返却する
5. WHEN Render_ProcessがTimeoutを超えたとき、THE System SHALL `error_type`を`timeout`として返却する

### 要件 5: 同時実行制御

**ユーザーストーリー**: システム管理者として、同時実行されるレンダリング処理数を制限したい。そうすることで、システムの安定性を保てる。

#### 受入基準

1. THE System SHALL Concurrent_Limitを設定する（例: 2）
2. WHILE 実行中のRender_Process数がConcurrent_Limitに達している間、THE System SHALL 新規リクエストをHTTP 429で拒否する
3. WHEN 実行中のRender_Process数がConcurrent_Limitに達したとき、THE System SHALL `error_type`を`rate_limited`として返却する

### 要件 6: ログ記録とトレーサビリティ

**ユーザーストーリー**: システム管理者として、各リクエストの処理状況を追跡したい。そうすることで、問題発生時に原因を特定できる。

#### 受入基準

1. WHILE Render_Process実行中の間、THE System SHALL 同一Request_IDをすべてのログに関連付ける
2. THE System SHALL Request_ID、処理時間、成否、HTTPステータスコード、終了コードをログ出力する
3. THE System SHALL 起動時に`mmdc`のバージョン情報をログ出力してもよい

### 要件 7: 一時ファイル管理

**ユーザーストーリー**: システム管理者として、一時ファイルが適切にクリーンアップされることを確認したい。そうすることで、ディスク容量を節約できる。

#### 受入基準

1. WHEN Render_Processで一時ファイルを生成したとき、THE System SHALL レスポンス送信後に一時ファイルを削除する
2. THE System SHALL Mermaid_Codeを永続保存してはならない

### 要件 8: ヘルスチェック

**ユーザーストーリー**: 運用担当者として、APIの稼働状況を確認したい。そうすることで、サービスの可用性を監視できる。

#### 受入基準

1. THE System SHALL `/healthz`エンドポイントを提供する
2. WHEN `/healthz`にリクエストが送信されたとき、THE System SHALL HTTP 200で応答する
3. WHEN `/healthz`にリクエストが送信されたとき、THE System SHALL `text/plain`形式で`ok`を返却する

### 要件 9: Docker環境での動作

**ユーザーストーリー**: 開発者として、Dockerコンテナでシステムを実行したい。そうすることで、環境依存の問題を回避できる。

#### 受入基準

1. THE System SHALL Dockerコンテナとしてビルド可能である
2. THE System SHALL コンテナ内で`mmdc`を実行可能である
3. THE System SHALL Windows上のDockerで動作する

### 要件 10: レスポンス形式

**ユーザーストーリー**: 開発者として、一貫したレスポンス形式を受け取りたい。そうすることで、クライアント側の実装を簡素化できる。

#### 受入基準

1. WHEN Render_Processが成功し`format`が`svg`のとき、THE System SHALL `Content-Type: image/svg+xml`で画像を返却する
2. WHEN Render_Processが成功し`format`が`png`のとき、THE System SHALL `Content-Type: image/png`で画像を返却する
3. WHEN Render_Processが成功したとき、THE System SHALL レスポンスヘッダに`X-Request-Id`を含める
4. WHEN Render_Processが失敗したとき、THE System SHALL `Content-Type: application/json`でエラー情報を返却する
5. WHEN Render_Processが失敗したとき、THE System SHALL JSONレスポンスに`request_id`、`error_type`、`status_code`、`stderr`、`exit_code`、`format`を含める
6. THE System SHALL `error_type`として以下の値を使用する: `parse_error`、`render_error`、`timeout`、`rate_limited`、`invalid_request`
7. THE System SHALL HTTPステータスコードとして以下を使用する: 200（成功）、400（入力不正・Mermaid構文エラー）、429（同時実行上限）、500（内部エラー・`mmdc`起動失敗・依存不足）、504（タイムアウト）

## API仕様（MVP）

### POST /render

#### 目的

Mermaidコードを画像（SVG/PNG）に変換して返す

#### Request（JSON）

- `code`（string, required）: Mermaidコード（テキストのみ）
- `format`（string, optional）: `svg` / `png`（デフォルト: `svg`）
- `timeout_ms`（number, optional）: レンダリング上限時間（未指定時はサーバ既定値）

#### Response（成功: HTTP 200）

- `format=svg`の場合: `Content-Type: image/svg+xml`
- `format=png`の場合: `Content-Type: image/png`
- ヘッダ: `X-Request-Id: <request_id>`

#### Response（失敗: JSON）

- `Content-Type: application/json`
- ボディ（最低限）:
  - `request_id`（string）: リクエスト識別ID
  - `error_type`（string）: `parse_error` / `render_error` / `timeout` / `rate_limited` / `invalid_request`
  - `status_code`（number）: HTTPステータスコード
  - `stderr`（string）: `mmdc`の生ログ
  - `exit_code`（number|null）: `mmdc`の終了コード
  - `format`（string）: リクエストされたフォーマット

#### HTTPステータス使い分け指針

- **200**: 成功
- **400**: 入力不正（`code`が空、`format`が不正、Mermaid構文エラーの可能性を含む）
- **429**: 同時実行上限到達
- **500**: 内部エラー（`mmdc`起動失敗、依存不足等）
- **504**: タイムアウト

※ `mmdc` の stderr から `parse_error` と判定できた場合は 400 とする

### GET /healthz

#### 目的

死活確認

#### Response

- HTTP 200 + `text/plain`形式で`ok`を返却


### 要件 11: セキュリティ（MVP）

**ユーザーストーリー**: システム管理者として、セキュアな運用環境を構築したい。そうすることで、不正アクセスを防止できる。

#### 受入基準

1. THE System SHOULD Tailscale閉域で運用され、公開インターネットに直接公開されない
2. IF Systemが公開インターネットに露出する場合、THEN THE System MAY APIキー等の簡易認証を導入する

## Out of Scope（MVP外）

以下の機能はMVPの範囲外とし、将来拡張として検討します：

- エラーメッセージの翻訳・要約・修正提案（加工なし）
- 認証・課金・ユーザー管理（閉域前提）
- 画像の永続保存（オンデマンド生成のみ）
- 高度なキャッシュ・非同期ジョブ・大規模スケール
- Mermaid以外の図の変換

## 将来拡張（MVP後）

以下の機能は、MVP完成後の拡張として検討します：

- エラーメッセージからの「直し方」自動提案（ルールベース or AI補助）
- 変換結果キャッシュ（同一コードの再生成を回避）
- 非同期ジョブ（重いレンダリングでも安定）
- 画像保存とURL返却
- Mermaid以外の図への対応
