# Codex Apps MCP 起動失敗に関する専門家意見の検証メモ

作成日: 2026-05-17

## 目的

Codex CLI の `codex_apps` が `tools/list` を30秒以内に返せず、GitHub / Gmail / Google Calendar などの連携（Apps Connector）が利用できない件について、専門家O/A/Gの回答を比較し、信頼度97%以上と判断できる情報だけを今後参照できる形で整理する。

## ローカル実測値

- 発生エラー: `MCP startup failed: timed out awaiting tools/list after 30s`
- 失敗した接続先: `codex_apps`
- 実ツール呼び出し時の追加エラー: `failed to get client`
- 実ツール呼び出しの失敗応答時間: 約0.038秒
- `~/.codex/config.toml` で有効な OpenAI curated plugin: 3個
  - `google-calendar@openai-curated`
  - `gmail@openai-curated`
  - `github@openai-curated`
- `~/.codex/cache/codex_apps_tools/*.json` のキャッシュサイズ: 481,504 bytes
- キャッシュ内のツール（tool）数: 123個
  - GitHub: 90個
  - Gmail: 21個
  - Google Calendar: 12個

## 確実と判断した情報

### 1. `codex_apps` は Apps Connector 側の問題として扱うべき

専門家O/Aは、今回の症状を「ツール定義のキャッシュは見えるが、実体の MCP client は起動失敗済み」と説明している。この説明はローカル実測と一致する。

根拠:
- `tool_search` ではツール定義が見える。
- 実ツール呼び出しは `failed to get client` で即時失敗した。
- GitHub Issue #19576 でも、`/mcp` では GitHub tools が見えるが、実際の tool call は `failed to get client` で失敗する例が報告されている。

参考:
- GitHub Issue #19576: https://github.com/openai/codex/issues/19576

### 2. `codex_apps` は `chatgpt.com/backend-api/wham/apps` との通信や初期化に関係する

専門家O/Aが指摘した `wham/apps` への通信は、複数の公開Issueで確認できる。特に `codex_apps` の起動失敗ログとして、`https://chatgpt.com/backend-api/wham/apps` へのリクエスト失敗、HTTP request failure、handshake failure が報告されている。

参考:
- GitHub Issue #16550: https://github.com/openai/codex/issues/16550
- GitHub Issue #20167: https://github.com/openai/codex/issues/20167
- GitHub Issue #11919: https://github.com/openai/codex/issues/11919

### 3. 通常の MCP server には起動待ち時間（startup timeout）設定がある

OpenAI公式ドキュメントでは、通常の `mcp_servers.<id>` に対して `startup_timeout_sec` と `tool_timeout_sec` が定義されている。MCPページでは、起動待ち時間（startup timeout）の既定値が10秒、ツール実行待ち時間（tool timeout）の既定値が60秒と説明されている。

ただし、この設定が内蔵の `codex_apps` にユーザー設定として適用できることは、公式ドキュメントからは確認できていない。

参考:
- OpenAI Codex MCP docs: https://developers.openai.com/codex/mcp
- OpenAI Codex config reference: https://developers.openai.com/codex/config-reference

### 4. Apps Connector は app単位・tool単位で制御できる設定がある

OpenAI公式設定リファレンスでは、`apps.<id>.enabled`、`apps.<id>.default_tools_enabled`、`apps.<id>.tools.<tool>.enabled` が定義されている。したがって、Apps Connector の有効化範囲を絞るという方針自体は公式設定に沿っている。

一方、このリポジトリの現在の `~/.codex/config.toml` では、旧来の plugin 形式で `google-calendar@openai-curated`、`gmail@openai-curated`、`github@openai-curated` が有効化されている。

参考:
- OpenAI Codex config reference: https://developers.openai.com/codex/config-reference

### 5. plugin を無効化する場合は `enabled = false` と Codex 再起動が公式手順

OpenAI公式 plugin ドキュメントでは、plugin をインストールしたまま無効化する場合、`~/.codex/config.toml` で `enabled = false` を設定し、その後 Codex を再起動する手順が示されている。

参考:
- OpenAI Codex plugins docs: https://developers.openai.com/codex/plugins

### 6. `~/.codex/auth.json` は秘密情報として扱う必要がある

OpenAI公式認証ドキュメントでは、Codex のログイン情報は `~/.codex/auth.json` またはOSの認証情報保管庫（credential store）に保存され、file-based storage の `auth.json` にはアクセストークン（access token）が含まれるため、パスワード同等に扱う必要があると説明されている。

参考:
- OpenAI Codex authentication docs: https://developers.openai.com/codex/auth

### 7. `codex_apps` には既知の起動・通信不安定性に近い公開報告がある

公開Issueには、`codex_apps` が起動時に `wham/apps` への通信、HTTPレスポンス解析、または初期化（initialize / handshake）で失敗する報告が複数ある。今回の `tools/list after 30s` と完全に同一原因とは断定しないが、調査時に優先して確認すべき既知パターンである。

参考:
- GitHub Issue #20167: https://github.com/openai/codex/issues/20167
- GitHub Issue #16550: https://github.com/openai/codex/issues/16550
- GitHub Issue #11919: https://github.com/openai/codex/issues/11919
- GitHub Issue #19576: https://github.com/openai/codex/issues/19576

## 採用しない、または保留する情報

### `mcp_servers.codex_apps.startup_timeout_sec = 60` の追加

専門家Gは `config.toml` に `[mcp_servers.codex_apps] startup_timeout_sec = 60` を追加する案を提示した。しかし、公式ドキュメントで確認できるのは通常のユーザー定義 `mcp_servers.<id>` の設定であり、内蔵 `codex_apps` にこの上書きが効くことは確認できない。

このため、現時点では確実情報として採用しない。

### 「123 tools だから30秒超過する」という断定

123個のツール定義があること、Apps Connector の初期化負荷が大きくなり得ることは妥当な推論である。しかし、123個という数だけで必ず30秒超過するという公式仕様や実測は確認できない。

このため、ツール数削減は有効な切り分け候補として扱うが、主因としては断定しない。

### 個別 OAuth 失効が主因という断定

OAuth 失効や権限不足は可能性として残る。ただし、今回の失敗点は `tools/list` の30秒待ち時間超過であり、実ツール呼び出し前に `codex_apps` client が取得できていない。専門家O/Aの「個別コネクタのOAuthより手前の問題」という評価の方が、現状の観測と整合する。

## 今後の調査方針

1. `~/.codex/log/codex-tui.log` で `codex_apps`、`wham/apps`、`tools/list`、`failed to get client` を確認する。
2. `auth.json` の本文は表示・共有せず、存在・更新日時・トップレベルキー程度に留める。
3. plugin 無効化や cache 退避を行う場合は、必ず設定とキャッシュをバックアップしてから実施する。
4. Apps Connector を常時有効にせず、必要な連携だけ有効化する運用を検討する。
5. `codex_apps` 固有の設定上書きは、公式根拠または実機検証が得られるまで採用しない。

