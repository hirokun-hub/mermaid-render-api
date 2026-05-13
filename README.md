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

このリポジトリの標準 Docker 構成は、安全な厨房（Chromium sandbox）を使う前提です。Mermaid は内部で Chromium を使って描画するため、標準では `--no-sandbox` を使わず、コンテナ側も非 root / read-only filesystem / tmpfs / capability drop を前提にしています。

この API はローカル起動、または Tailscale などの VPN 内利用を想定しています。インターネットへ直接公開しないでください。

1) `.env` を作成
```bash
cp .env.example .env
```

2) 標準起動（安全寄り）
```bash
docker compose up --build -d
```

3) Docker Desktop / WSL で起動しない場合

Docker Desktop や Docker Desktop 経由の WSL では、Chromium sandbox が隔離部屋（namespace / chroot）を作れず、コンテナが restart loop になることがあります。この場合のみ、ローカル開発用の臨時許可証（capability overlay）を併用します。

```bash
docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml up --build -d
```

`docker-compose.dev-sysadmin.yml` は Docker Desktop fallback 専用です。本番標準構成として `SYS_ADMIN` / `SYS_CHROOT` を付与しないでください。本番相当の Linux 環境では、実行基盤側の seccomp / AppArmor / user namespace 設定で Chromium sandbox が通ることを確認してください。

4) 動作確認
```bash
curl -i http://localhost:3100/healthz
curl -i http://localhost:3100/readyz
curl -i http://localhost:3100/livez
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

WSL でも Docker Desktop 経由で実行している場合は、標準起動で Chromium sandbox の権限エラーが出ることがあります。その場合は Docker Desktop と同じく、開発用 overlay を併用してください。

```bash
docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml up --build -d
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

Phase 4.5 時点では、production dependency の critical / high advisory を 0 にする方針です。残存する moderate / low advisory は `docs/dependency-overrides.md` に到達性、緩和策、解除条件、再評価期限を記録します。

## Chromium sandbox運用

本番では `--no-sandbox` と `cap_add: SYS_ADMIN` を標準構成にしません。非root実行、`chromium-sandbox`、`tini`、read-only filesystem、tmpfs、PID/メモリ制限を前提にし、Linux本番相当環境ではChrome向けcustom seccomp / AppArmor / user namespace設定を検証してください。

日常語で言うと、標準構成は「安全な厨房（Chromium sandbox）で調理する」方針です。Docker Desktop で標準起動できない場合の overlay は「ローカル開発用の臨時入室許可証（追加 capability）」です。便利ですが、本番で常用するものではありません。

`--no-sandbox` は現在の標準運用には含めません。ローカル / Tailscale 内利用でも、外部入力の Mermaid を Chromium で処理するため、可能な限り sandbox 有効のまま運用してください。

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

### Docker Desktop でコンテナが Restarting になる

`docker compose ps` で `Restarting` と表示され、ログに以下のようなエラーが出る場合があります。

```text
Failed to move to new namespace ... Operation not permitted
FATAL:zygote_host_impl_linux.cc
```

これはアプリ本体の起動失敗ではなく、Chromium sandbox が隔離部屋（namespace）を作る権限を Docker Desktop からもらえない状態です。ローカル開発では Docker Desktop 用 overlay を重ねて起動してください。

```bash
docker compose -f docker-compose.yml -f docker-compose.dev-sysadmin.yml up --build -d
```

起動後は以下を確認します。

```bash
curl -i http://localhost:3100/healthz
curl -i http://localhost:3100/readyz
curl -i -X POST http://localhost:3100/render \
  -H "Content-Type: application/json" \
  -d '{"code":"graph TD\nA-->B","format":"svg"}'
```

この overlay はローカル Docker Desktop fallback 用です。本番で同じエラーが出る場合は、overlay を入れるのではなく、実行基盤側の seccomp / AppArmor / user namespace 設定を見直してください。

## 現在の確認済み状態

Phase 4.5 時点の確認済み状態です。

- `npm run build`: pass
- `npm test`: 31 files / 140 tests pass
- `npm audit --omit=dev --audit-level=high`: pass
- `docker compose build`: pass
- Docker Desktop では `docker-compose.dev-sysadmin.yml` 併用で `/healthz` / `/readyz` / `/livez` / `/render` SVG smoke が 200

## テスト

```bash
npm run test
```
