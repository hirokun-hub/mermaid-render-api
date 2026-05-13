# Mermaid Render API

MermaidコードをSVG/PNG画像に変換するHTTP APIです。TypeScript + Express で `/render`、`/healthz`、`/livez`、`/readyz`、`/metrics` を提供し、既定では `@mermaid-js/mermaid-cli` の Programmatic API と常駐 BrowserPool でレンダリングします。

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

Docker DesktopでChromium sandboxのnamespace / chroot 作成が拒否される場合のみ、開発用overlayを併用します。本番標準構成として `SYS_ADMIN` / `SYS_CHROOT` を付与しないでください。

```bash
docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml up --build -d
```

3) 動作確認
```bash
curl -i http://localhost:3100/healthz
curl -i -X POST http://localhost:3100/render \
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
- `RATE_LIMIT_MAX_INFLIGHT`: HTTP層の同時受付上限（デフォルト 15）
- `BROWSER_POOL_SIZE`: BrowserContextプールサイズ（デフォルト 4）
- `POOL_QUEUE_MAX`: BrowserPoolの待ちキュー上限（デフォルト 20）
- `MAX_CODE_SIZE`: `code` の最大バイト数（デフォルト 51200）
- `PNG_RENDER_SCALE`: PNG出力時の拡大率（デフォルト 2、SVGには適用しない）
- `MERMAID_PADDING`: CLI fallback互換用の余白（ピクセル、デフォルト 0）
- `RENDERER_MODE`: `programmatic` または `cli`（デフォルト `programmatic`）

## 依存更新ポリシー

`@mermaid-js/mermaid-cli` は Programmatic API が semver対象外のため exact pin で管理します。依存更新時は `npm ci` で lockfile を同期し、property test、統合テスト、画像差分確認、性能確認を通してから反映してください。

## Chromium sandbox運用

本番では `--no-sandbox` と `cap_add: SYS_ADMIN` を標準構成にしません。非root実行、`chromium-sandbox`、`tini`、read-only filesystem、tmpfs、PID/メモリ制限を前提にし、Linux本番相当環境ではChrome向けcustom seccomp / AppArmor / user namespace設定を検証してください。

## フォント

日本語表示の美観を優先するため、コンテナには `fonts-noto-cjk` を導入し、Mermaid設定で `Noto Sans CJK JP` を優先します。

## Docker E2E 補助

`scripts/docker-e2e.sh` は `/healthz` と `/render` を叩く簡易検証スクリプトです。

```bash
chmod +x scripts/docker-e2e.sh
scripts/docker-e2e.sh
```

## よくある問題

### ポートが使用中

`Bind for 0.0.0.0:3100 failed` が出る場合は、`docker-compose.yml` のポートを変更してください。

```yaml
ports:
  - "3100:3000"
```

その場合の確認先は `http://localhost:3100/healthz` になります。

## テスト

```bash
npm run test
```
