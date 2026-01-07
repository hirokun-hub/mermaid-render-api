# Mermaid Render API

軽量な Mermaid 画像変換 API です。TypeScript + Express で `/render` と `/healthz` を提供し、`@mermaid-js/mermaid-cli` を内部で呼び出して `svg`/`png` を生成します。

## セットアップ

```bash
npm install
npm run build
npm run start
```

- `npm run build` で TypeScript を `dist/` に出力
- `npm run start` で `dist/server/server.js` を起動

## Docker での実行

Docker コンテナ内で Node と Mermaid CLI を含む環境を構築済みです。ビルドと起動は以下のように。

```bash
docker compose up --build
```

公開ポートはデフォルト `3000` です。手元の `curl` で `http://localhost:3000/healthz` と叩いて `ok` が返れば正常です。

### 個別コマンド

```bash
docker build -t mermaid-render-api .
docker run --rm -p 3000:3000 --env-file .env mermaid-render-api
```

## 環境変数

以下は `.env` に設定可能です。`docker-compose` や `npm` 実行時に `DEFAULT_TIMEOUT_MS`/`MAX_CONCURRENT_RENDERERS`/`MAX_CODE_SIZE` を調整してください（ローカル起動時も `.env` を読み込みます）。

- `DEFAULT_TIMEOUT_MS`: Mermaid CLI のタイムアウト（ミリ秒、デフォルト 8000）
- `MAX_CONCURRENT_RENDERERS`: 同時レンダリング上限（デフォルト 2）
- `MAX_CODE_SIZE`: `code` の最大バイト数（デフォルト 51200）

`.env.example` をコピーしてカスタマイズしてください。

## Docker 上での E2E 検証補助

`scripts/docker-e2e.sh` は `docker compose up --build` 後に `/healthz` と `/render` を叩く簡易検証スクリプトです（Docker と `curl` が使える環境でのみ実行してください）。

```bash
chmod +x scripts/docker-e2e.sh
scripts/docker-e2e.sh
```

## テストとビルド

```bash
npm run build
npm run test
```
