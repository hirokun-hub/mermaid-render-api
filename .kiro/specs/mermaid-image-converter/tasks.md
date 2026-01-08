# 実装計画: Mermaid画像変換API

## 概要

MermaidコードをSVG/PNG画像に変換するHTTP APIをTypeScript/Node.jsで実装します。
実装は4つのフェーズに分かれています。

---

## フェーズ 1: 基盤構築

**目標**: プロジェクトの基本構造とコアユーティリティを構築

**達成要件**: TypeScriptビルド成功、Request ID生成・ロガー・Input Validator動作

- [x] 1.1 プロジェクトセットアップ
  - TypeScript初期化、依存関係インストール、ディレクトリ構造作成

- [x] 1.2 Request ID生成とLoggerの実装
  - UUID v4生成、Logger（logRequest/logResponse/logError/logStartup）実装
  - _Requirements: 1.4, 6.1, 6.2_

- [x]* 1.3 Request ID・Loggerのユニットテスト

- [x] 1.4 Input Validatorの実装
  - 検証ルール（50KB上限、format検証、format未指定時はsvgをデフォルト適用）
  - invalid_request時stderr=""・exit_code=null
  - _Requirements: 3.1-3.6_

- [x]* 1.5 Input Validatorのユニットテスト
  - format未指定時にsvgがデフォルト適用されることの検証

- [x] 1.6 チェックポイント - 基盤確認

---

## フェーズ 2: コア機能

**目標**: Mermaidレンダリング、レート制限、APIエンドポイント実装

**達成要件**: /render・/healthz動作、エラーハンドリング機能

- [x] 2.1 Rate Limiterの実装
  - acquire/release、MAX_CONCURRENT=2
  - _Requirements: 5.1, 5.2_

- [ ]* 2.2 Rate Limiterのユニットテスト

- [x] 2.3 Mermaid Rendererの実装
  - mmdc実行、一時ファイル管理、タイムアウト（8000ms）、stderr/exit_code取得
  - 入力コードは一時ファイルのみ使用、レスポンス後削除、永続保存やログ出力は行わない
  - _Requirements: 1.2, 2.1, 4.1, 4.3, 7.1, 7.2_

- [ ]* 2.4 Mermaid Rendererのユニットテスト
  - 有効なMermaidコードのレンダリング、エラーハンドリング
  - 処理後に一時ファイルが残らないことの検証

- [x] 2.5 Expressアプリケーションセットアップ
  - サーバー初期化、ミドルウェア設定
  - _Requirements: 1.1_

- [x] 2.6 POST /renderエンドポイント実装
  - Request ID生成、Validator/RateLimiter/Renderer呼び出し、レスポンス生成
  - timeout_msパラメータの受け取り（未指定時はDEFAULT_TIMEOUT使用）
  - リクエスト開始時刻の記録、duration_ms算出
  - 成功/失敗どちらでもlogResponseを呼び出し（outcome、exit_code必須）
  - _Requirements: 1.1, 1.3, 1.4, 2.3, 4.2, 6.2, 10.1-10.5_

- [x] 2.7 GET /healthzエンドポイント実装
  - Request ID生成、text/plain・X-Request-Id返却
  - logRequest/logResponse呼び出し（duration_ms計測、outcome=success、exit_code=null）
  - _Requirements: 6.2, 8.1-8.3_

- [x] 2.8 サーバー起動スクリプト
  - mmdcバージョン取得、logStartup呼び出し
  - _Requirements: 6.3_

- [x] 2.9 チェックポイント - コア機能確認

---

## フェーズ 3: 統合・テスト

**目標**: 包括的テスト実施、全要件満足確認

**達成要件**: 全ユニット・プロパティ・統合テスト通過

- [x]* 3.1 統合テスト: POST /render基本機能
  - SVG/PNG返却、エラー処理、HTTP 400テスト
  - format省略時にSVGが返ることの検証
  - _Requirements: 1.3, 2.3, 3.2, 3.3, 3.4_

- [x]* 3.2 統合テスト: GET /healthz
  - HTTP 200、text/plain、'ok'の確認
  - X-Request-Idヘッダーの存在確認
  - _Requirements: 1.4, 8.1, 8.2, 8.3_

- [x]* 3.3 統合テスト: レート制限・タイムアウト
  - HTTP 429テスト、error_type=rate_limitedの検証
  - HTTP 504テスト、error_type=timeoutの検証
  - _Requirements: 4.4, 4.5, 5.2, 5.3_

- [x]* 3.4 プロパティテスト: Request IDの一貫性
  - **Property 1** - _Requirements: 1.4, 6.1, 10.3_

- [x]* 3.5 プロパティテスト: フォーマット別Content-Type
  - **Property 2** - _Requirements: 1.3, 10.1, 10.2_

- [x]* 3.6 プロパティテスト: エラーレスポンス完全性
  - **Property 3** - _Requirements: 2.3, 10.5_

- [x]* 3.7 プロパティテスト: 不正フォーマット拒否
  - **Property 4** - _Requirements: 3.4_

- [x]* 3.8 プロパティテスト: エラー時Content-Type
  - **Property 5** - _Requirements: 10.4_

- [x]* 3.9 プロパティテスト: 入力サイズ制限
  - **Property 6** - _Requirements: 3.5, 3.6_

- [x]* 3.10 プロパティテスト: タイムアウト正確性
  - **Property 7** - _Requirements: 4.4, 4.5_

- [x]* 3.11 プロパティテスト: レート制限正確性
  - **Property 8** - _Requirements: 5.2, 5.3_

- [x] 3.12 チェックポイント - テスト確認

---

## フェーズ 4: デプロイ準備

**目標**: Docker化、ドキュメント整備

**達成要件**: Dockerイメージビルド成功、Windows Docker動作、ドキュメント完備

- [x] 4.1 Dockerfileの作成
  - Node.jsイメージ、mmdc インストール、/tmp/mermaid作成、ポート3000公開
  - mmdc実行に必要なPuppeteer/Chromium依存を用意（例: 既存イメージ利用またはChromium/依存ライブラリ導入＋起動オプション調整）
  - _Requirements: 9.1, 9.2_

- [x] 4.2 .dockerignore・docker-compose.yml作成

- [x] 4.3 Dockerビルド・テスト
  - Windows Docker環境確認
  - _Requirements: 9.3_

- [x] 4.4 READMEの作成
  - 概要、セットアップ、API仕様、Docker実行、テスト実行

- [x] 4.5 環境変数設定ファイル作成
  - .env.example（MAX_CODE_SIZE、DEFAULT_TIMEOUT、MAX_CONCURRENT等）

- [x] 4.6 エンドツーエンドテスト（Docker環境）

- [x] 4.7 最終チェックポイント

---

## 追加タスク（マルチアーキ対応）

**目的**: arm64/amd64 環境での安定動作を担保する

- [x] 4.8 Chromium固定運用の導入
  - OS配布の`chromium`を使用する構成へ変更
  - `PUPPETEER_SKIP_DOWNLOAD=true` を設定
  - `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` を設定

- [x] 4.9 arm64/amd64 での `/render` 動作確認
  - Apple Silicon（arm64）で `/render` が成功することを確認
  - Windows/amd64 環境で `/render` が成功することを確認

- [x] 4.10 Docker環境向け Puppeteer 設定の追加
  - `--no-sandbox` / `--disable-setuid-sandbox` を指定する設定ファイルを用意
  - mmdc 呼び出し時に設定ファイルを参照する

## 追加タスク（日本語フォント対応）

**目的**: 日本語の豆腐化/欠落を防ぐ

- [x] 4.11 日本語フォントの導入
  - Dockerfileに`fonts-ipaexfont-gothic`を追加（必要なら`fonts-ipaexfont-mincho`）
  - 必要に応じて`fonts-noto-cjk`への切替を検討

- [x] 4.12 Mermaidフォント設定の追加
  - `themeVariables.fontFamily` を指定したMermaid設定ファイルを追加
  - mmdc実行時に`--configFile`で読み込む

- [x] 4.13 日本語表示の動作確認
  - PNGで日本語ラベルが正しく表示されることを確認
  - SVGは閲覧環境に依存するため、注意事項として確認する

## 注意事項

- `*`付きタスクはオプション（テスト関連）
- フェーズは順番に実行
- プロパティテストは100回反復
- エラー時は一時ファイル必ずクリーンアップ
- stderrは加工せず返却
