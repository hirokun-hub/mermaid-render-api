# Docker / Chromium Sandbox コンテナ運用ベストプラクティス評価

作成日: 2026-05-13

## 対象

`mermaid-render-api` の Phase 4 実装中に、Docker Desktop for macOS 上で `@mermaid-js/mermaid-cli` Programmatic API + Puppeteer BrowserPool を起動したところ、Chromium sandbox と Docker の namespace / seccomp / capability 設定が衝突した。専門家 O / A / G の回答を、一次情報を中心に照合し、信頼性 97% 以上と判断できる制約を整理する。

## 現状の定量情報

- Runtime image: `node:20-bullseye-slim`
- Node.js: 20 系
- Puppeteer: `23.11.1`
- Mermaid CLI: `@mermaid-js/mermaid-cli` `11.12.0` exact pin 方針
- Chromium: Debian `chromium`
- 追加済み/検討済み OS package: `chromium`, `chromium-sandbox`, `fonts-noto-cjk`, `tini`
- レンダリング方式: `renderMermaid()` Programmatic API + BrowserContext pool
- 入力信頼境界: 外部/AI 生成 Mermaid を untrusted input として扱う
- Docker Desktop for macOS で観測した起動結果:
  - root 実行 + sandbox 有効: `Running as root without --no-sandbox is not supported.`
  - 非 root + `chromium-sandbox` なし: `No usable sandbox!`
  - 非 root + `chromium-sandbox` あり + default seccomp 相当: `Failed to move to new namespace ... Operation not permitted`
  - 暫定 `cap_add: SYS_ADMIN`: `/livez`, `/readyz`, `/healthz` は 200

## 評価サマリ

3 名の専門家の中核意見はおおむね一致しており、一次情報とも整合する。特に「untrusted input を Chromium に処理させる本番構成では `--no-sandbox` を避け、Chromium sandbox を維持する」「`cap_add: SYS_ADMIN` を本番標準にしない」「Docker default seccomp / AppArmor / user namespace は Chromium sandbox 起動失敗の主要切り分け対象である」という点は高信頼と判断する。

一方、`no-new-privileges:true` は一般的な Docker hardening として有効だが、Debian `chromium-sandbox` の SUID helper を使う構成では衝突し得る。したがって、本プロジェクトでは無条件の制約ではなく、実測確認が必要な条件付き推奨として扱う。また、歴史的な Chrome 用 seccomp profile をそのまま採用する判断は、現在の Docker default profile / アーキテクチャ / Chromium version と照合してから行う必要がある。

## 信頼性 97% 以上と判断した制約

### 1. Chromium sandbox は本番で維持する

Puppeteer 公式 troubleshooting は `--no-sandbox` を使う例を示しつつ、sandbox なし実行を強く非推奨としている。Chromium 公式 Linux sandbox 文書も、Linux では setuid、namespaces、seccomp-BPF など複数層の sandbox を組み合わせる設計であると説明している。今回の API は untrusted Mermaid を Chromium/Puppeteer で処理するため、sandbox を外す構成を本番標準にしてはならない。

出典:
- Puppeteer Troubleshooting: https://pptr.dev/troubleshooting
- Chromium Linux Sandbox: https://chromium.googlesource.com/chromium/src/+/main/sandbox/linux/README.md

### 2. root 実行 + sandbox 有効 Chromium は失敗する

観測ログの `Running as root without --no-sandbox is not supported` は Chromium/Puppeteer の既知挙動と整合する。Docker runtime では非 root ユーザーで実行する必要がある。

出典:
- Puppeteer Troubleshooting: https://pptr.dev/troubleshooting
- OWASP Docker Security Cheat Sheet Rule #2: https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html

### 3. Docker default seccomp は Chromium sandbox の namespace 作成と衝突し得る

Docker 公式 seccomp 文書は、default profile が互換性と保護のバランスを取った既定値であり、`clone` による新しい namespace 作成や `setns` / `unshare` などを制限対象として説明している。観測ログの `Failed to move to new namespace ... Operation not permitted` は、この制限またはホスト側 user namespace / AppArmor 制限との衝突を示す強い手がかりである。

出典:
- Docker Seccomp security profiles: https://docs.docker.com/engine/security/seccomp/
- Chromium AppArmor user namespace restrictions: https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md

### 4. `cap_add: SYS_ADMIN` は本番標準にしない

Puppeteer 公式 Docker guide は、Puppeteer 公式イメージを sandbox mode で動かす際に `SYS_ADMIN` capability が必要と説明している。ただし Docker 公式文書では `SYS_ADMIN` が mount など強い操作に関係する capability として扱われ、OWASP は capability を全 drop して必要最小限だけ追加する方針を推奨している。したがって、本プロジェクトでは `SYS_ADMIN` は Docker Desktop 等の開発環境における暫定回避、または隔離済み renderer worker の最後の手段に限定する。

出典:
- Puppeteer Docker guide: https://pptr.dev/guides/docker
- Docker run capabilities: https://docs.docker.com/engine/containers/run/
- OWASP Docker Security Cheat Sheet Rule #3: https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html

### 5. 本番候補は custom seccomp / AppArmor / user namespace の調整

Docker 公式は default seccomp profile を安易に無効化しないことを推奨しつつ、必要に応じて `--security-opt seccomp=/path/to/profile.json` で profile を渡せると説明している。Docker 公式 user namespace remap は、コンテナ内 root をホストの非特権 UID に対応付ける防御策として説明されている。Ubuntu 系ホストでは AppArmor が unprivileged user namespace を制限する場合があるため、本番相当 Linux での検証では seccomp / AppArmor / user namespace の状態を記録する必要がある。

出典:
- Docker Seccomp security profiles: https://docs.docker.com/engine/security/seccomp/
- Docker user namespace remap: https://docs.docker.com/engine/security/userns-remap/
- Chromium AppArmor user namespace restrictions: https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md

### 6. `tini` または Docker init は必要

Puppeteer 公式 Docker guide は、Puppeteer が起動したプロセスを適切に管理するために `--init` または custom `ENTRYPOINT` を指定するよう注意している。Node.js が PID 1 になる構成では、Chromium 子プロセスの回収のため init process を入れる制約は妥当である。

出典:
- Puppeteer Docker guide: https://pptr.dev/guides/docker

### 7. container hardening は多層で行う

OWASP Docker Security Cheat Sheet は、非 root 実行、capability 最小化、`no-new-privileges`、seccomp/AppArmor/SELinux、リソース制限、read-only filesystem を推奨している。Compose 仕様/公式 reference は `cap_add` / `cap_drop` / `read_only` / `tmpfs` / `pids_limit` / `cpus` 等のサービス設定を定義している。

出典:
- OWASP Docker Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html
- Docker Compose service reference: https://docs.docker.com/reference/compose-file/services/
- Compose Specification: https://compose-spec.github.io/compose-spec/spec.html

## 条件付きで扱うべき主張

- `no-new-privileges:true` は一般論では有効だが、Debian `chromium-sandbox` の SUID helper と衝突し得る。採用は「namespace sandbox だけで動く」または「SUID helper と両立する」ことを実測してからにする。
- `chrome.json` 等の既存 Chrome 用 seccomp profile は出発点にはなるが、古い profile は現在の Docker default profile、Chromium version、CPU architecture と合わない可能性がある。moby/profiles の default profile をベースに最小差分で作る方針が妥当。
- Docker Desktop for macOS で `SYS_ADMIN` が必要だった事実は、Linux 本番でも必要であることを意味しない。Docker Desktop は Linux VM 上で動作するため、VM 側 kernel / seccomp / namespace 設定の影響を受ける。

## 本プロジェクトへの設計判断

1. 本番標準構成では `--no-sandbox` を使わない。
2. 本番標準構成では `cap_add: SYS_ADMIN` を使わない。
3. Dockerfile は非 root実行、`chromium-sandbox`、`tini`、CJK fonts を含める。
4. Docker Desktop 用の暫定 `SYS_ADMIN` は、標準 compose ではなく dev overlay / profile に分離する。
5. Linux 本番相当環境で、`SYS_ADMIN` なし + custom seccomp + AppArmor / user namespace 状態記録のスモークテストを行う。
6. read-only filesystem、tmpfs、PID/メモリ/CPU制限、capability drop、egress 制限を container hardening の標準候補にする。
