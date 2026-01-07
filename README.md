# Mermaid Render API

MermaidコードをSVG/PNG画像に変換するHTTP APIです。TypeScript + Express で `/render` と `/healthz` を提供し、`@mermaid-js/mermaid-cli`（mmdc）を内部で実行します。

## 前提

- Node.js 20
- Docker Desktop（WSL利用可）

## ローカル実行

```bash
npm install
npm run build
npm run start
```

## Docker 実行

1) `.env` を作成
```bash
cp .env.example .env
```

2) 起動
```bash
docker compose up --build -d
```

3) 動作確認
```bash
curl -i http://localhost:3000/healthz
curl -i -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"code":"graph TD\nA-->B","format":"svg"}'
```

## WSL での起動

WindowsでDocker Desktopを有効化し、対象のWSLディストリで以下を実行します。

```bash
cp .env.example .env
docker compose up --build -d
```

## 環境変数

`.env` で調整可能です（Docker起動時に読み込まれます）。

- `DEFAULT_TIMEOUT_MS`: Mermaid CLI のタイムアウト（ミリ秒、デフォルト 8000）
- `MAX_CONCURRENT_RENDERERS`: 同時レンダリング上限（デフォルト 2）
- `MAX_CODE_SIZE`: `code` の最大バイト数（デフォルト 51200）
- `PNG_RENDER_SCALE`: PNG出力時の拡大率（デフォルト 2、SVGには適用しない）

## Docker E2E 補助

`scripts/docker-e2e.sh` は `/healthz` と `/render` を叩く簡易検証スクリプトです。

```bash
chmod +x scripts/docker-e2e.sh
scripts/docker-e2e.sh
```

## よくある問題

### ポートが使用中

`Bind for 0.0.0.0:3000 failed` が出る場合は、`docker-compose.yml` のポートを変更してください。

```yaml
ports:
  - "3100:3000"
```

その場合の確認先は `http://localhost:3100/healthz` になります。

## テスト

```bash
npm run test
```
