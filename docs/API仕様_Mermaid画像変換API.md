# Mermaid画像変換API 仕様書

この文書は、Mermaid画像変換APIを利用する開発者向けの仕様です。

## 概要

MermaidコードをHTTP経由で受け取り、SVG/PNG画像に変換して返却します。

- 提供エンドポイント: `/render`, `/healthz`
- 入力形式: JSON
- 出力形式: SVG/PNG（バイナリ）またはJSONエラー

## ベースURL

環境により異なります。以下は例です。

- ローカル: `http://localhost:3000`
- 変更例: `http://localhost:3100`

## 認証

MVPでは認証なし（Tailscale等の閉域前提）。

## 共通仕様

### リクエストID

- すべてのレスポンスに `X-Request-Id` ヘッダーを付与します。
- エラーレスポンスのJSONにも `request_id` が含まれます。

### Content-Type

- 成功時: `image/svg+xml` または `image/png`
- エラー時: `application/json`

---

## POST /render

Mermaidコードを画像に変換します。

### リクエスト

**ヘッダー**

- `Content-Type: application/json`

**ボディ**

```json
{
  "code": "graph TD\nA-->B",
  "format": "svg",
  "timeout_ms": 8000,
  "scale": 3
}
```

**フィールド**

- `code` (string, 必須)
  - Mermaidコード
- `format` (string, 任意)
  - `svg` または `png`
  - 未指定時は `svg`
- `timeout_ms` (number, 任意)
  - レンダリングタイムアウト（ミリ秒）
  - 未指定時はサーバー設定値
- `scale` (integer, 任意)
  - PNG の解像度倍率 (deviceScaleFactor)。`1`〜`4` の整数
  - 未指定時はサーバー既定値 `3`
  - `format=svg` と同時送信した場合は無視される（SVG はベクター形式のため解像度の概念がない）。レスポンスは `200 OK` で `scale` 未指定時と同一の SVG が返る
  - 範囲外 (`0`, `5+`, 非整数, 文字列, null) → `400 invalid_request`、`error_field: "scale"`

  | 入力 | 動作 |
  |---|---|
  | `{"format":"png","scale":1}` | 軽量モード（約 1/9 のファイルサイズ） |
  | `{"format":"png","scale":3}` | 標準（既定値と同等） |
  | `{"format":"png","scale":4}` | 高 DPI 用 |

### 成功レスポンス

- **ステータス**: `200 OK`
- **ヘッダー**:
  - `Content-Type: image/svg+xml` または `image/png`
  - `X-Request-Id: <uuid>`
- **ボディ**: 画像バイナリ

### エラーレスポンス

- **ステータス**: `400 / 429 / 500 / 504`
- **ヘッダー**:
  - `Content-Type: application/json`
  - `X-Request-Id: <uuid>`
- **ボディ**:

```json
{
  "request_id": "<uuid>",
  "error_type": "invalid_request",
  "status_code": 400,
  "stderr": "",
  "exit_code": null,
  "format": "svg"
}
```

**error_type の種類**

- `invalid_request` (400)
  - 入力不備（code未指定/空文字/サイズ超過/format不正）
- `rate_limited` (429)
  - 同時実行数の上限超過
- `parse_error` (400)
  - Mermaid構文エラー
- `render_error` (500)
  - 変換失敗（その他）
- `timeout` (504)
  - タイムアウト

---

## GET /healthz

ヘルスチェック用エンドポイントです。

### リクエスト

- ボディなし

### レスポンス

- **ステータス**: `200 OK`
- **ヘッダー**:
  - `Content-Type: text/plain`
  - `X-Request-Id: <uuid>`
- **ボディ**:
  - `ok`

---

## 制約

- `code` サイズ上限: 50KB（51200 bytes）
- 同時実行数上限: 2
- デフォルトタイムアウト: 8000ms

---

## サンプル

### SVG生成

```bash
curl -i -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"code":"graph TD\nA-->B","format":"svg"}'
```

### PNG生成（高解像度）

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"code":"flowchart LR\n A-->B","format":"png","scale":2}' \
  > output.png
```

### ヘルスチェック

```bash
curl -i http://localhost:3000/healthz
```
