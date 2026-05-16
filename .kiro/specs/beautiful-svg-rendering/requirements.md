# 要件定義書: beautiful-svg-rendering

## 1. イントロダクション

### 1.1 目的

本改修は、`mermaid-render-api` が返す SVG/PNG を **AI 生成 Mermaid を単独 HTML(スタンドアロン) に直接埋め込んで配布する**ユースケースで美しく機能するように、レンダリング既定値・API パラメータ・エラー応答・内部アーキテクチャを刷新する。親要件定義書(`mermaid-image-converter/requirements.md`)で定めた **エラー透過性・タイムアウト・同時実行制御・ヘルスチェック・Docker 動作** 等の MVP 要件はすべて維持する。

### 1.2 背景

実機 10 ケースの定量調査(`docs/svg-padding-investigation/REPORT.md`)で次が確認された:

- **ノード内余白が固定で大きい**(`rect` で横 60px / 縦 30px、形状ごとに異なる)
- **配布先ブラウザのフォントが Noto Sans CJK JP を持たない場合に `<foreignObject>` 境界でテキストが視覚的にクリップされる**(case 10「整理する(手動 + ✓)」で再現)
- **SVG ルートに付与される `style="max-width: <px>"` が配布 HTML の responsive CSS と干渉する**
- **エラー応答が `mmdc` の生 stderr のみで、行番号やユーザー由来部分の特定が AI/利用者に難しい**

加えて、リクエストごとに `mmdc` を subprocess 起動するため、Puppeteer/Chromium のブート時間が 1〜2 秒/req の固定オーバーヘッドとして乗っている。

### 1.3 関連ドキュメント

- 親要件定義書: `mermaid-image-converter/requirements.md`(MVP 要件)
- 親 API 仕様: `docs/API仕様_Mermaid画像変換API.md`
- 定量調査: `docs/svg-padding-investigation/REPORT.md`
- 専門家レビュー: `docs/expert-reviews/2026-05-10_mermaid-svg-rendering-best-practices.md`
- 専門家レビュー: `docs/expert-reviews/2026-05-13_docker-chromium-sandbox-container-best-practices.md`
- 専門家レビュー: `docs/expert-reviews/2026-05-13_dependency-vulnerability-remediation-best-practices.md`
- 設計書: `design.md`(本ディレクトリ)

### 1.4 用語集

- **Beautiful_Defaults**: 配布 HTML embed 用途で美しく出力するためのサーバ側既定 Mermaid 設定の総称
- **Mermaid_Config_Override**: リクエストで明示指定される Mermaid 公式設定の部分集合
- **Post_Process_Option**: SVG 生成時または生成後にサーバ側で適用する後処理オプションの総称(ID 一意化、`max-width` 除去等)
- **Browser_Pool**: Puppeteer の **BrowserContext** をリクエスト間で再利用する内部仕組み(少数の `Browser` インスタンスが多数の `BrowserContext` を hosting し、`BrowserContext` 単位で同時実行を制御する)
- **Programmatic_API**: `@mermaid-js/mermaid-cli` が export する `renderMermaid` 関数(`Browser | BrowserContext` を第 1 引数に取り、`mmdc` subprocess を起動しない。本改修では `BrowserContext` 単位で渡す)
- **Server_Locked_Setting**: ユーザーが上書き不可能なサーバ側固定設定(セキュリティ目的)

### 1.5 本ドキュメントの読み方

- **§3「ユーザーストーリーと要件」が中心**。各 US セクション配下に、そのストーリーを達成するための機能要件(EARS)が直接埋め込まれている。
- 1 つの要件が複数 US に関連する場合、**主担当 US に本文を 1 回だけ書き、他 US は番号参照**にしている(DRY)。各 US の冒頭に「関連 REQ 一覧(主担当 / 参照)」の早見表を置く。
- どの US にも単独で紐付かない横断的要件(セキュリティガードレール、入力契約ガードレール、デフォルト挙動の禁止事項)は **§4「横断要件」**にまとめる。
- 具体的なデフォルト値・パラメータ命名・型定義・実装ロジックは本ファイルでは扱わず、`design.md` を参照する(DRY)。

## 2. 技術的制約

本セクションは、`docs/expert-reviews/2026-05-10_mermaid-svg-rendering-best-practices.md` および `docs/expert-reviews/2026-05-13_docker-chromium-sandbox-container-best-practices.md` で信頼性 ≥97% と判定した一次ソース確認済の事実を要件に転記したもの。設計判断の前提条件として扱う。

### 2.1 Mermaid v11 系の制約

- **C-M-01**: `flowchart.padding`(Mermaid デフォルト 15)は公式 schema で「**Only used in new experimental rendering**」と明記されているが、**実機検証(2026-05-16、Mermaid `11.15.0` bundled、`defaultRenderer: "dagre-wrapper"`、`htmlLabels: true`)で本リポジトリ構成でも効くことを確認した**(`docs/svg-node-padding-verification-2026-05-13.md` の Padding Probe 追補参照)。実測式: `rect.width − foreignObject.width = 4 × flowchart.padding`、`rect.height − foreignObject.height = 2 × flowchart.padding`(`padding=4 → 16 × 8`、`padding=15(default) → 60 × 30`、`padding=60 → 240 × 120` で線形)。schema コメント由来の挙動保証は無いため、Mermaid 依存更新時(NFR-02)はこの前提が崩れていないかを画像差分で再確認すること。`beautiful_defaults` での具体値は `design.md` §3.1 を参照。
- **C-M-02**: `flowchart.htmlLabels` は v11.12.3+ で **DEPRECATED**。ルートの `htmlLabels` を使用しなければならない。
- **C-M-03**: `htmlLabels: false` は v11.11+ で複数の Approved Bug が open。デフォルト適用してはならない。
  - [#7015](https://github.com/mermaid-js/mermaid/issues/7015) エンティティコード(`#quot;` 等)が無効化される
  - [#7016](https://github.com/mermaid-js/mermaid/issues/7016) 特殊文字(`<`,`>`,`\*`)の処理破綻
  - [#1177](https://github.com/mermaid-js/mermaid/issues/1177) 複数行ラベルの水平中央寄せ失敗
- **C-M-04**: ELK レイアウトエンジン(`layout: elk`)は v11 では `@mermaid-js/layout-elk` 別パッケージだが、本リポジトリの Phase 4 baseline `@mermaid-js/mermaid-cli`(`11.12.0` exact pin)は bundle 済のため追加導入不要。一方で title 消失([#4813](https://github.com/mermaid-js/mermaid/issues/4813))・empty subgraph クラッシュ([#5402](https://github.com/mermaid-js/mermaid/issues/5402))の既知不具合があり、デフォルト採用してはならない。Phase 4.5 でセキュリティ修復目的の exact pin 更新を行う場合も、ELK のデフォルト採用禁止は維持する。
- **C-M-05**: `mmdc` CLI には設定 JSON を inline で渡すフラグが存在しない(`-c, --configFile <path>` のみ)。設定変更は **ファイル経由** か、Programmatic_API を用いてオブジェクト直渡しのいずれか。
- **C-M-06**: Mermaid のパースエラー stderr に出る「`Parse error on line N:`」の `N` には [#3853](https://github.com/mermaid-js/mermaid/issues/3853) で long-open の行番号ずれバグがある。エラー応答で行番号を扱う場合は「N 行目付近」相当の曖昧度を残してよい。
- **C-M-07**: `@mermaid-js/mermaid-cli` の **Programmatic_API は semver 対象外**(README 明記)。依存バージョン pinning と移行検証手段を持つこと。
- **C-M-08**: `@mermaid-js/mermaid-cli` の Node.js API は **v11.3.0 (2024-11-01)** で `renderMermaid` 戻り値 `data: Buffer → Uint8Array` の破壊的変更を行った実績がある([PR #767](https://github.com/mermaid-js/mermaid-cli/pull/767))。バージョン更新時は API 形状の互換確認を必須とし、依存は **exact pin** で管理する。
- **C-M-09**: Mermaid 本体 **v11.13.0 (2026-03-09)** でプレーンテキストラベルの自動 Markdown 解釈が v10 互換へ巻き戻された。SVG **出力の見た目が変わる**種類の変更が minor リリースで発生し得るため、通常の依存更新 PR では画像差分(`pixelmatch` 等)による視覚回帰検証を必須とする。Phase 4.5 MVP では NFR-02 の例外条件に従い、SVG structural safety と主要 diagram regression を必須、PNG pixel diff は production rollout 前の推奨検証として扱ってよい。
- **C-M-10**: Phase 4 baseline の `@mermaid-js/mermaid-cli` peerDependency は `puppeteer ^23`(2026-05 時点)。Phase 4.5 で `@mermaid-js/mermaid-cli` を更新する場合は、更新先 package metadata の peerDependency を確認し、Puppeteer 側の version set も同期管理対象とする。

### 2.2 配布 HTML 埋込用途の制約

- **C-H-01**: 同一 HTML に複数 SVG を inline embed すると `<marker id="arrowhead">` 等の SVG 内部 ID が衝突し、2 つめ以降の矢印描画が破綻する。**本改修は単一ページに 1 SVG 埋込を想定**し、複数 SVG 配置は将来別票で扱う(§8)。
- **C-H-02**: `flowchart.useMaxWidth: true`(Mermaid デフォルト)は SVG ルートに `style="max-width: <px>px"` を付与する。`false` 指定でこれが消え、絶対 px の `width`/`height` 属性 + `viewBox` 出力に切り替わる。配布 HTML 側 CSS で responsive 化したい用途では `false` が好ましい。
- **C-H-03**: コンシューマ側ブラウザに Noto Sans CJK JP 等のサーバ側採用フォントが存在しない場合、`<foreignObject>` の事前計算幅と実描画幅にズレが生じる。foreignObject はブラウザ実装上 `overflow:hidden` 相当でクリップされる傾向があり、コンテンツが境界で見切れる。**2026-05-16 アップデート(実機検証)**: ズレの主因は半角文字(半角 ASCII 英字 / 半角空白 / `+` / 半角括弧)と Unicode dingbat / 絵文字(`✓` 等)のフォント間メトリクス差で、CJK / 全角文字は完全一致(overflow = 0)。CJK / 日本語固有の問題ではなく、純 ASCII でも `+9〜+15px` の overflow を実測している(`docs/expert-reviews/2026-05-16_foreignobject-clip-and-font-metrics-best-practices.md` §3 / §4)。加えて `themeCSS: ".label foreignObject { overflow: visible; }"` は HTML inline 描画(`<svg>` 直接埋込)では効くが standalone SVG 描画(`<img src=...>` 経由、GitHub Markdown / Slack / Notion 等の SVG 表示)では失効することを実機再現済(同 §4.2)。**失効の根本原因(実機観測で裏取り済)**: 同一の生成 SVG 内で **DOM ノード `<foreignObject>` は大文字混じり保持(10/10 件)**、**`<style>` 要素内の themeCSS 由来 CSS セレクタだけが `.label foreignobject` に小文字化(1/1 件)** となることを Mermaid 11.15.0(bundled in `@mermaid-js/mermaid-cli` 11.14.0)で観測。`themeCSS` 未設定では `<style>` 内に `foreignobject` 出現 0 件・DOM `<foreignObject>` 10 件のためコントロールも成立(`docs/svg-themecss-lowercase-verification-2026-05-16.md` 検証成果物 `docs/svg-themecss-lowercase-verification-2026-05-16/`)。XML 名前空間の CSS セレクタは case-sensitive(MDN: [CSS Type selectors / Case sensitivity](https://developer.mozilla.org/en-US/docs/Web/CSS/Type_selectors))のため、小文字化されたセレクタは standalone SVG モードでマッチせず失効する。小文字化が Mermaid 本体内文字列処理 / Puppeteer 内 CSSOM シリアライズ / DOMPurify のいずれで発生しているかの段の特定は未了で、Mermaid 公式 Issue 投稿時のメンテナ調査委任事項とする。本改修では REQ-U-09 の SVG 後処理で `<foreignObject>` 要素に直接 `style="overflow:visible"` を inline 注入することでモード差異を解消する経路を採用しており、小文字化発生段の特定に依存せず再現性のあるワークアラウンドとして妥当性を確認済(`docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md` で 7 パターン全てクリップ消滅、副作用なし)。SVG 仕様上は `<foreignObject>` への `overflow="visible"` 属性または inline `style` 付与が SVG / XML / HTML 文脈を問わず効くため、本体修正提案を行う場合は CSS セレクタ修正ではなく属性付与経路を優先する(`docs/expert-reviews/2026-05-16_mermaid-issue-report-validity-best-practices.md` §1.3)。CSS セレクタ書換え案として当初検討した `[*|local-name()="foreignObject"]` は XPath 関数であり CSS としては解釈されない(同 §1.2、修正候補から除外)。

### 2.3 セキュリティおよびリソース制限

- **C-S-01**: 入力 Mermaid テキストは信用してはならない(AI 生成想定)。`securityLevel` は `strict` を Server_Locked_Setting としてサーバ側で固定し、リクエストでの上書きを許可してはならない。
- **C-S-02**: Mermaid の `maxTextSize`(schema デフォルト 50000)と `maxEdges`(schema デフォルト 500)を遵守する。
- **C-S-03**: 親要件定義書 §3「入力検証」で定めた入力サイズ上限(現状 `MAX_CODE_SIZE=50KB`)を本改修でも遵守する。Express の `express.json()` の `limit` は **`MAX_CODE_SIZE` 由来の式で導出**(`BODY_LIMIT = MAX_CODE_SIZE × 2 + 16KB`)し、ハードコード値との二重管理を避ける。`{ strict: true }` を併用。
- **C-S-04**: ユーザー入力 JSON とサーバ既定設定の deep merge は **Prototype Pollution 脆弱性の典型的入口**([CVE-2019-10744](https://security.snyk.io/vuln/SNYK-JS-LODASH-450202) で `lodash.defaultsDeep` が CVSS 9.1、[CVE-2018-16487](https://security.snyk.io/vuln/SNYK-JS-LODASHMERGE-173732) で `lodash.merge` 同様の実績)。`mermaid_config` のマージでは禁止キー `__proto__` / `constructor` / `prototype` を **検出時に該当キーのみ merge 対象から除外し、警告コード `prototype_pollution_attempt` を記録、リクエスト処理は継続**する(REQ-UN-06)。base は `Object.create(null)` で開始。Node.js 起動オプション `NODE_OPTIONS="--disable-proto=delete"` の併用が defense in depth として推奨される(OWASP)。
- **C-S-05**: Puppeteer/Chromium 上で Mermaid コードを評価する構成は **untrusted JS 評価相当のリスク**を伴う。レンダリング page では Puppeteer の **request interception で外部ネットワーク通信(`http:` / `https:` / `file:`)を遮断**し、`data:` / `about:` / `blob:` のみ allow すること(SSRF / クラウドメタデータエンドポイントへの到達防止)。例外として、`@mermaid-js/mermaid-cli` パッケージ配下の static asset だけは canonical path の厳密一致で allow してよい。
- **C-S-06**: BrowserPool 導入により `timeout_ms` はブラウザリソース占有時間に直結する。上限なしの `timeout_ms` 受理は **プール枯渇攻撃の入口**となるため、validator 層で `[MIN_TIMEOUT_MS=1000, MAX_TIMEOUT_MS=30000]` の範囲外を `invalid_request` として拒否する。

### 2.4 Puppeteer / Chromium 運用上の制約

- **C-P-01**: Puppeteer 公式 troubleshooting は **`--no-sandbox` を strongly discouraged** と明記。本番では Chrome sandbox 維持、または同等のコンテナ隔離(`seccomp` / `AppArmor` / read-only filesystem / Linux capability drop / egress 制限 / `/tmp` サイズ制限)が必須。
- **C-P-02**: Puppeteer の page インスタンスを長期間再利用すると **メモリリークが発生**する(複数の本番運用事例で報告)。page 単位の **recycle policy(`maxUses`)** を実装すること(典型値: 50〜100 render / page)。browser 全体も定期再起動(典型値: 1000 render or 60 分)を行う。
- **C-P-03**: Node.js を Docker PID 1 で実行すると、クラッシュした Chromium の **ゾンビプロセスが回収されない**。Dockerfile に **init(`tini` / `dumb-init`)** または `docker run --init` が必須。`SIGTERM` 受信時は graceful shutdown(queue close → browser close)を実装する。
- **C-P-04**: `headless: 'shell'`(chrome-headless-shell)が Mermaid 用途では軽量で十分。`--disable-dev-shm-usage` / `--disable-gpu` / `--disable-extensions` 等の最小化オプションが標準。
- **C-P-05**: Chromium 公式 Linux sandbox は setuid / namespaces / seccomp-BPF 等の複数層で構成される。本 API は untrusted Mermaid 入力を Chromium/Puppeteer に処理させるため、本番標準構成で `--no-sandbox` を使用してはならない。根拠: [Puppeteer troubleshooting](https://pptr.dev/troubleshooting), [Chromium Linux Sandbox](https://chromium.googlesource.com/chromium/src/+/main/sandbox/linux/README.md)。
- **C-P-06**: Docker runtime では Chromium を非 root ユーザーで起動すること。root + sandbox 有効の Chromium は `Running as root without --no-sandbox is not supported` 系の起動失敗となる。Dockerfile / Compose / Kubernetes 等では数値 UID/GID または `USER node` 相当を明示する。
- **C-P-07**: Debian `chromium` を使用する runtime image では `chromium-sandbox` パッケージを明示導入する。`chromium-sandbox` が欠落すると `No usable sandbox` 系の起動失敗となり得る。
- **C-P-08**: Docker default seccomp は互換性と保護のバランスを取った既定値だが、`clone` による新 namespace 作成、`setns`、`unshare` 等を制限対象に含む。Chromium sandbox の namespace 作成失敗(`Failed to move to new namespace ... Operation not permitted`)が発生した場合、`seccomp=unconfined` へ安易に倒さず、Chrome 用 custom seccomp profile / AppArmor / user namespace 設定を切り分ける。根拠: [Docker seccomp](https://docs.docker.com/engine/security/seccomp/), [Chromium AppArmor userns restrictions](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md)。
- **C-P-09**: `cap_add: SYS_ADMIN` は Puppeteer 公式 Docker image で sandbox mode 用に案内されるが、本 API の本番標準構成として採用してはならない。使用する場合は Docker Desktop 等の開発環境の暫定回避、または隔離済み renderer worker の最後の手段に限定し、`cap_drop: ALL` / read-only filesystem / tmpfs / PID・メモリ制限 / egress 制限を併用する。根拠: [Puppeteer Docker guide](https://pptr.dev/guides/docker), [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)。
- **C-P-10**: `security_opt: no-new-privileges:true` は一般的な container hardening として有効だが、Debian `chromium-sandbox` の SUID helper と衝突し得る。SUID sandbox helper を使う構成では無条件に有効化せず、namespace sandbox / custom seccomp 構成で両立を実測確認してから採用する。
- **C-P-11**: 本番コンテナでは least privilege を前提とし、read-only root filesystem、書込先を `/tmp` / browser cache 用 tmpfs に限定、`cap_drop: ALL`、`pids_limit`、メモリ/CPU制限、Docker socket 非マウント、egress deny/allowlist を標準候補とする。根拠: [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html), [Docker Compose service reference](https://docs.docker.com/reference/compose-file/services/)。

### 2.5 依存脆弱性対応の制約

- **C-D-01**: production dependency の脆弱性対応は Phase 4 の Docker/API 統合作業と混ぜず、Phase 4.5 `Security dependency remediation` として独立させる。Mermaid/parser/sanitizer/Puppeteer/Express 推移依存の更新はレンダリング互換性とセキュリティ境界を変えるため、rollback と原因切り分けの単位を分ける。根拠: `docs/expert-reviews/2026-05-13_dependency-vulnerability-remediation-best-practices.md`。
- **C-D-02**: `npm audit fix --omit=dev` を無検証で一括適用してはならない。npm 公式は `audit fix` が install 相当の remediations を適用し、手動確認が必要な脆弱性もあると説明している。依存更新は direct dependency の exact pin 更新を優先し、必要最小限の `overrides` は advisory / 理由 / 解除条件を設計書または専用ドキュメントに記録する。根拠: [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/), [npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides)。
- **C-D-03**: Phase 4.5 MVP の依存セキュリティ基準は `npm audit --omit=dev --audit-level=high` が pass すること、すなわち production dependency の critical / high を 0 にすること。moderate / low を残す場合は exploit 経路、リスク受容理由、owner、再評価期限、解除条件を記録する。
- **C-D-04**: 本 API は untrusted Mermaid 入力を Chromium で SVG/PNG に変換し、返却 SVG が inline embed され得るため、Mermaid / DOMPurify / SVG sanitizer 系の XSS advisory は npm 表示上 moderate でも高優先度として扱う。DOMPurify CVE-2026-41238 は `>=3.0.1 <3.4.0` が対象で `3.4.0` で修正、Mermaid CVE-2025-54881 / CVE-2025-54880 は Mermaid `11.10.0` 以上で修正されている。根拠: [DOMPurify CVE-2026-41238](https://advisories.gitlab.com/npm/dompurify/CVE-2026-41238/), [Mermaid CVE-2025-54881](https://advisories.gitlab.com/npm/mermaid/CVE-2025-54881/), [Mermaid CVE-2025-54880](https://advisories.gitlab.com/npm/mermaid/CVE-2025-54880/)。
- **C-D-05**: `basic-ftp` は Puppeteer の browser download 系推移依存であり、本番では `PUPPETEER_SKIP_DOWNLOAD=true` と Debian `chromium` により実行到達性は低いが、CVE-2026-27699 は critical で `5.2.0` 以上が修正版のため production dependency tree に残してはならない。上位更新で解消しない場合は scoped override を検討する。根拠: [basic-ftp CVE-2026-27699](https://advisories.gitlab.com/npm/basic-ftp/CVE-2026-27699/)。
- **C-D-06**: Express の `path-to-regexp` ReDoS advisory は複雑な route pattern が主条件であり、本 API の固定 route (`/render`, `/healthz`, `/livez`, `/readyz`, `/metrics`) では実リスクは相対的に低い。ただし Express 公式は security release として `path-to-regexp` 更新を推奨しているため、production high advisory を残さない。根拠: [Express March 2026 Security Releases](https://expressjs.com/2026/03/30/security-releases.html)。
- **C-D-07**: Phase 4.5 の受入では `npm ci`、`npm run build`、`npm test`、Docker build、Docker Desktop dev overlay smoke、SVG/PNG render smoke に加え、locked settings、prototype pollution、request interception、SVG structural safety(`script` / `on*` / `javascript:` / 想定外外部参照なし)、主要 diagram type regression を必須検証とする。
- **C-D-08**: Phase 4.5 で `overrides` を追加する場合、対象 package、advisory URL、追加理由、影響範囲、解除条件、再評価期限を `design.md` または専用ドキュメントに記録しなければならない。上位 package 更新で同等以上の修正版に到達した場合は override を削除候補とする。
- **C-D-09**: Phase 4.5 の Mermaid 系更新では `@mermaid-js/mermaid-cli` の direct dependency 更新を第一候補とし、`mermaid` / `@mermaid-js/parser` / `dompurify` の個別 override は上位更新で advisory が残る場合の第二候補とする。Programmatic API は semver 対象外のため、更新後に import path、戻り値形状、error shape、CLI fallback の互換性を検証する。

### 2.6 Phase 4.5 MVP 要件

- **REQ-D-01**: THE System SHALL Phase 4.5 完了時点で `npm audit --omit=dev --audit-level=high` に成功する。
- **REQ-D-02**: THE System SHALL Phase 4.5 完了時点で production dependency tree に known critical/high advisory を残さない。
- **REQ-D-03**: THE System SHALL Phase 4.5 完了時点で Mermaid / DOMPurify / SVG sanitizer 系 XSS advisory を残さない。ただし上流未修正で残す場合は exploit 経路、暫定緩和策、解除条件、再評価期限を risk acceptance として記録しなければならない。
- **REQ-D-04**: THE System SHALL 依存更新後も `securityLevel` / `maxTextSize` / `maxEdges` / `startOnLoad` の Server_Locked_Setting をリクエストから上書きできない。
- **REQ-D-05**: THE System SHALL 依存更新後も `__proto__` / `constructor` / `prototype` payload によって `Object.prototype` が汚染されない。
- **REQ-D-06**: THE System SHALL 依存更新後も Puppeteer request interception により外部 `http:` / `https:` / 許可外 `file:` 参照を遮断する。
- **REQ-D-07**: THE System SHALL 依存更新後の SVG 出力に `<script>`、`on*=` イベント属性、`javascript:` URI、想定外の外部 URL / file 参照が含まれないことを検証する。
- **REQ-D-08**: THE System SHALL 依存更新後も主要 Mermaid diagram type の SVG レンダリングと PNG レンダリングが成功することを検証する。
- **REQ-D-09**: THE System SHOULD 残存 moderate/low advisory がある場合、GitHub issue または設計ドキュメントに CVE/advisory、実行到達性、リスク受容理由、owner、再評価期限を記録する。

## 3. ユーザーストーリーと要件

各 US セクションは「ストーリー本文 → 関連 REQ 早見表 → 主担当 REQ 本文 → 参照 REQ(他 US に本文があるもの)」の順で記述する。**主担当 REQ の本文はストーリーごとに 1 回だけ出現する**(DRY)。検証時に EARS 述語の網羅性を確認する場合は、本ドキュメント全体に対し `grep -E "SHALL|SHOULD"` を実行する。

### 3.1 US-01: 配布資料作成者(美しい単独 HTML 埋込)

> **ロール**: 配布資料作成者
> **やりたいこと**: AI 生成 Mermaid を単独 HTML(スタンドアロン)に直接埋め込み配布する
> **価値**: 配布先のフォント環境に依存せず、追加の SVG 後加工なしで美しく見える

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-01 | 美しい既定出力 | 主 |
| REQ-U-04 | Post_Process_Option の受理 | 主 |
| REQ-E-05 | PNG での SVG 専用オプション無視 | 参照 → US-04 |
| REQ-U-07 | Syntax error 図の混入防止 | 参照 → US-05 |

#### REQ-U-01: 美しい既定出力

THE System SHALL リクエストで Mermaid_Config_Override が一切指定されない場合でも、配布 HTML 用途で美しいと判定される Beautiful_Defaults を適用した SVG/PNG を返却する。

> 関連: US-02(見切れ回避)、US-03(余白圧縮)もこの要件に依存する。

#### REQ-U-04: Post_Process_Option の受理

THE System SHALL リクエスト本文に Post_Process_Option(API 独自の後処理指示)を含めることを許可し、SVG 生成時または生成後にサーバ側で適用する。

> 関連: US-04(responsive 化のための `max-width` 除去)もこの要件に依存する。

### 3.2 US-02: AI 利用者(見切れ回避)

> **ロール**: AI 利用者(Mermaid を出力する LLM 含む)
> **やりたいこと**: ノード見切れの心配なしに Mermaid コードを生成する
> **価値**: レイアウト調整の試行錯誤やラベル短縮を強制されない

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-09 | foreignObject overflow:visible の強制注入 | 主 |
| REQ-U-01 | 美しい既定出力(見切れ防止を含む) | 参照 → US-01 |
| REQ-E-01 | Mermaid_Config_Override 指定時のマージ | 参照 → US-03 |
| REQ-U-03 | リクエスト時設定上書きの受理 | 参照 → US-03 |

#### REQ-U-09: foreignObject overflow:visible の強制注入(C-H-03)

THE System SHALL `format=svg` のレスポンスにおいて、SVG 文字列中のすべての `<foreignObject>` 要素の `style` 属性に `overflow:visible` を含めて出力する。インライン属性(`<foreignObject style="overflow:visible" ...>`)として SVG 文字列に焼き込み、配布先のレンダリングモード(HTML inline / `<img>` 経由 standalone SVG / GitHub Markdown / Slack / Notion 等)に依らず効果が発揮されるよう保証する。

- 既存の `style` 属性に `overflow` 宣言があるノードは触らない(冪等)
- 既存の `style` 属性に他の宣言があるノードは `;overflow:visible` を追記する
- 利用者によるオプトアウトは許可しない(常時オン)
- `format=png` レスポンスには適用しない(SVG 経由でないため)

> 関連制約: C-H-03(themeCSS が standalone SVG で失効する根本原因)。実装仕様: `design.md` §7。実装位置: `src/renderer/postProcess.ts`。実機検証根拠: `docs/svg-foreignobject-overflow-fix-verification-2026-05-16.md`(7 パターン × 14 ノードで clip 消滅 + 副作用ゼロ確認済)。

このストーリーは US-01(`Beautiful_Defaults` で foreignObject クリップを最小化)、US-03(`Mermaid_Config_Override` で個別調整)、**REQ-U-09(後処理で `overflow:visible` 強制注入)** の組合せで達成する。Beautiful_Defaults 単体では standalone SVG モードで効果が失われるため、REQ-U-09 が**配布 HTML embed 用途における見切れ回避の最終保証**となる。具体的な後処理仕様は `design.md` §7 を参照。

### 3.3 US-03: 余白圧縮を求める利用者

> **ロール**: 配布資料作成者
> **やりたいこと**: ノード余白が小さくスッキリした図にしたい
> **価値**: 限られた紙面/画面で密度高く情報伝達できる

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-03 | リクエスト時設定上書きの受理 | 主 |
| REQ-E-01 | Mermaid_Config_Override 指定時のマージ | 主 |
| REQ-U-01 | Beautiful_Defaults による既定の余白圧縮 | 参照 → US-01 |

#### REQ-U-03: リクエスト時設定上書きの受理

THE System SHALL リクエスト本文に Mermaid_Config_Override(Mermaid 公式 schema 準拠キー)を含めることを許可し、Beautiful_Defaults より優先して適用する。ただし Server_Locked_Setting については §4.1(横断要件・セキュリティガードレール)に従う。

#### REQ-E-01: Mermaid_Config_Override 指定時のマージ

WHEN クライアントが Mermaid_Config_Override に正常な Mermaid 設定キーを含めて送信したとき、THE System SHALL Beautiful_Defaults を基底とし、上書き値で deep merge し、最後に Server_Locked_Setting を強制適用する。

### 3.4 US-04: 配布 HTML を responsive 化したい利用者

> **ロール**: 配布 HTML 作成者
> **やりたいこと**: SVG を `max-width: 100%; height: auto;` で responsive 表示したい
> **価値**: クライアント側で `style="max-width:..."` を正規表現で剥がすワークアラウンドが不要になる

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-E-05 | PNG での SVG 専用オプション無視 | 主 |
| REQ-U-04 | Post_Process_Option の受理(本ストーリーで具体活用) | 参照 → US-01 |
| REQ-U-01 | Beautiful_Defaults による既定 `useMaxWidth: false` | 参照 → US-01 |

**達成パス**: 本ストーリーは独自の主担当 REQ を必要最小限(REQ-E-05)に留め、責務は次の順で達成する:

1. `Beautiful_Defaults` の `useMaxWidth: false`(REQ-U-01 / `design.md` §3.1)で SVG ルートの `style="max-width: <px>px"` 付与を抑止する
2. それでも残る場合や PNG 等別経路で挿入されるケース向けに `post_process.strip_max_width=true`(REQ-U-04 / `design.md` §7.2)を任意で併用できる
3. PNG リクエストで上記オプションを誤指定しても 200 で PNG を返す(REQ-E-05)

#### REQ-E-05: PNG リクエストでの SVG 専用 Post_Process_Option

WHEN クライアントが `format=png` のリクエストで SVG 出力にのみ意味のある Post_Process_Option(例: SVG ルートの ID 一意化、`max-width` 除去)を指定したとき、THE System SHALL 当該オプションを無視し、警告ログを記録する。HTTP 200 で PNG を返却する。

> 注: `useMaxWidth: false` 指定で SVG ルートの `style="max-width:..."` を消すこと自体は Mermaid 設定で制御するが、配布側で responsive 化したい場合に `Post_Process_Option` を任意に併用できる(具体オプション名は `design.md` 参照)。

### 3.5 US-05: AI 利用者 / 開発者(エラー可読性)

> **ロール**: AI 利用者 / 開発者
> **やりたいこと**: Mermaid 構文エラー時に「どこが悪いか」を明確に知りたい
> **価値**: エラー自己修復(LLM が再生成)や手動修正がしやすい

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-05 | 構造化エラー応答(invalid_request 含む) | 主 |
| REQ-U-07 | Syntax error 図の混入防止 | 主 |
| REQ-E-03 | 構文エラー時の error_message 抽出 | 主 |
| REQ-E-04 | 行番号の抽出 | 主 |
| REQ-E-07 | 型不正な Mermaid_Config_Override / Post_Process_Option | 参照 → §4.2 横断要件 |

#### REQ-U-05: 構造化エラー応答

THE System SHALL バリデーション失敗および Mermaid のパース/レンダリング失敗時、レンダラ由来の raw stderr/例外メッセージに加えて、ユーザー由来部分を抽出した可読メッセージ(`error_message`)、抽出可能な場合の参照行情報(`line`)、機械可読のフィールド名(`error_field`)・制約名(`error_constraint`)を含む JSON を返却する。

#### REQ-U-07: エラー時の Syntax error 図の混入防止

THE System SHALL Mermaid 既定の「Syntax error 図」が SVG として返却されることを防ぐ。

#### REQ-E-03: 構文エラー時の error_message 抽出

WHEN Render_Process が Mermaid のパースエラーで失敗したとき、THE System SHALL `stderr` または例外メッセージから「ユーザー Mermaid コード由来のエラー本文」を抽出し、構造化応答に含める。抽出失敗時は空文字または `null` を許可する。

#### REQ-E-04: 行番号の抽出

WHEN error_message に Mermaid 由来の行番号情報が含まれるとき、THE System SHALL 行番号を整数値として抽出し、応答に含める。抽出できない場合は `null` を返す。行番号にずれがあり得る点(C-M-06)は応答メッセージに含意される表現にとどめる。

### 3.6 US-06: 既存 API 利用者(後方互換)

> **ロール**: 既存 API 利用者
> **やりたいこと**: 改修前と同じ最小リクエスト(`code` + `format` のみ)を出してもエラーにならず動かしたい
> **価値**: 自動化スクリプトやクライアント実装を変更せず移行できる

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-02 | 既存 API 形状の後方互換 | 主 |

#### REQ-U-02: 既存 API 形状の後方互換

THE System SHALL 親要件定義書(`mermaid-image-converter`)で定義された最小リクエスト形状(`code` + `format` + `timeout_ms` のみ)を引き続き受理し、HTTP 200 で画像を返却する。

> 注: 出力バイト互換は保証しない(Beautiful_Defaults により見た目は変わる)。詳細は §5.3「後方互換性ポリシー」参照。

### 3.7 US-07: 高頻度利用者(レイテンシ短縮)

> **ロール**: 高頻度利用者
> **やりたいこと**: 1 リクエストあたりの応答時間を短くしたい
> **価値**: バッチで多数の図を生成する際の待ち時間を圧縮できる

**関連要件早見表**:

| ID | 区分 | 担当 |
|---|---|---|
| REQ-U-08 | Browser_Pool の常駐 | 主 |
| REQ-S-01 | Browser_Pool 起動失敗時の挙動 | 主 |
| REQ-S-02 | Browser_Pool 障害検知時 | 主 |
| REQ-S-03 | HTTP 層 RateLimiter と Pool 層の責務分離 | 主 |

#### REQ-U-08: Browser_Pool の常駐

THE System SHALL Programmatic_API + Browser_Pool 方式でレンダリングを実行し、リクエストごとに Puppeteer/Chromium を起動・終了してはならない。

#### REQ-S-01: Browser_Pool 起動失敗時の挙動

WHILE Browser_Pool の初期化が完了していない間、THE System SHALL `/render` リクエストに対し HTTP 503 で `error_type=service_unavailable` を返却する。`/healthz` および `/livez` は **HTTP 200** を維持する(プロセス liveness、コンテナを起動中に kill されないため)。`/readyz` は **HTTP 503** を返す(readiness、新規トラフィックを受け付け可能でないため)。

#### REQ-S-02: Browser_Pool 障害検知時

WHILE Browser_Pool のいずれかのインスタンスが応答不能と判定されている間、THE System SHALL 当該インスタンスを除外し、健全なインスタンスでレンダリングを続行する。すべてのインスタンスが不能になった場合は REQ-S-01 と同じ応答とする。

#### REQ-S-03: HTTP 層 RateLimiter と Pool 層の責務分離

WHEN リクエストが HTTP 層の同時受付上限(`RATE_LIMIT_MAX_INFLIGHT`)を超えたとき、THE System SHALL **即時に HTTP 429**(`error_type=rate_limited`)を返却し、`Retry-After` ヘッダを付与する。WHILE BrowserPool acquire の wait queue が満杯(`POOL_QUEUE_MAX` 超過)または wait timeout(`POOL_WAIT_TIMEOUT_MS` 経過)に達した間、THE System SHALL **HTTP 503**(`error_type=service_unavailable`)を返却し、`Retry-After` ヘッダを付与する。RateLimiter と BrowserPool は責務を分離し、HTTP 層は即時拒否、Pool 層は wait 可とする。

## 4. 横断要件

どの US にも単独で紐付かず、システム全体に横断的に適用される要件。

### 4.1 セキュリティガードレール

#### REQ-U-06: securityLevel の固定(C-S-01)

THE System SHALL レンダリング時の `securityLevel` を `strict` に固定する。

#### REQ-E-02: Server_Locked_Setting への上書き試行(C-S-01)

WHEN クライアントが Mermaid_Config_Override 内で Server_Locked_Setting(`securityLevel` 等)を指定したとき、THE System SHALL 当該指定を無視し、警告ログを記録する。リクエストはエラーにせず処理を継続する。

#### REQ-UN-01: Server_Locked_Setting の上書き禁止(C-S-01)

THE System SHALL Mermaid_Config_Override を経由したいかなる入力に対しても、Server_Locked_Setting(少なくとも `securityLevel` を含む)を上書きしてはならない。

#### REQ-UN-04: Mermaid_Code の永続保存禁止(親要件継承)

THE System SHALL リクエストで受け取った Mermaid コードを永続ストレージに保存してはならない。

#### REQ-UN-05: 任意 CSS 注入の制限

THE System SHALL Mermaid_Config_Override 経由で渡される `themeCSS` 文字列の長さ・内容に対し、設計書で定める上限・拒否規約に反する指定を拒否する。

#### REQ-UN-06: Prototype Pollution 攻撃入力の拒否(C-S-04)

THE System SHALL Mermaid_Config_Override / Post_Process_Option の deep merge 処理において、`__proto__` / `constructor` / `prototype` を含むキーパスを **再帰的に検出**し、当該キーを merge 対象から除外して警告コード `prototype_pollution_attempt` を記録する。リクエストはエラーにせず処理を継続し、`Object.prototype` は不変であることを保証する。

### 4.2 入力契約のガードレール

#### REQ-E-06: 設定キーの allowlist 方式の適用

WHEN クライアントが Mermaid_Config_Override または Post_Process_Option を送信したとき、THE System SHALL `design.md` §3.3 で定義する **許可キー allowlist** に含まれないキーを API 層で削除した上で `renderMermaid` に渡し、警告コード `unknown_key`(allowlist 外)または `locked_setting_override_ignored`(`SERVER_LOCKED_SETTINGS` に列挙されたキー)を記録する。リクエストはエラーにせず処理を継続する。

#### REQ-E-07: 型不正な Mermaid_Config_Override / Post_Process_Option

WHEN クライアントが Mermaid_Config_Override または Post_Process_Option の値に明確に型不正(例: boolean 必須の場所に文字列)を指定したとき、THE System SHALL HTTP 400 で `error_type=invalid_request` を返却する。

### 4.3 デフォルト挙動の禁止事項

#### REQ-UN-02: htmlLabels の既定 false 化禁止(C-M-03)

THE System SHALL Beautiful_Defaults において `htmlLabels` を `false` に設定してはならない。`htmlLabels: false` はオプトインパラメータとしてのみ提供する。

#### REQ-UN-03: ELK レンダラの既定採用禁止(C-M-04)

THE System SHALL Beautiful_Defaults において `layout: "elk"` を既定としてはならない。ELK レイアウトはオプトインパラメータとしてのみ提供する。

## 5. API 仕様(MVP 改訂)

本セクションは API の入出力契約のみを定義する。**フィールドの値の取り得る範囲・データ型・JSON 例・処理ロジックは `design.md` を参照する**。

### 5.1 POST /render(改訂)

#### リクエスト本文の必須/任意フィールド

| フィールド | 必須/任意 | 由来 | 概要 |
|---|---|---|---|
| `code` | 必須 | 親要件継承 | Mermaid コード本文 |
| `format` | 任意 | 親要件継承 | 出力フォーマット |
| `timeout_ms` | 任意 | 親要件継承 | レンダリング上限時間 |
| `mermaid_config` | **任意(新規)** | 本要件 | Mermaid 公式 schema 準拠の設定(Mermaid_Config_Override) |
| `post_process` | **任意(新規)** | 本要件 | SVG 後処理オプション(Post_Process_Option) |

#### レスポンス(成功時)

親要件定義書「要件 10」を継承。SVG/PNG バイナリ + `Content-Type` + `X-Request-Id` ヘッダ。

#### レスポンス(失敗時、改訂)

親要件定義書「要件 10」で定めた最低限フィールドに加え、本改修で以下を**追加**する:

| フィールド | 型 | 概要 |
|---|---|---|
| `error_message` | string \| null | レンダラ由来の raw stderr/例外メッセージからユーザー由来部分を抽出した可読メッセージ(人間/LLM 可読) |
| `line` | integer \| null | Mermaid コード内の参照行番号(抽出可能時のみ、ずれの可能性あり) |
| `error_field` | string \| null | バリデーション失敗時のフィールド名(機械可読、例: `"code"`, `"timeout_ms"`, `"mermaid_config.themeCSS"`) |
| `error_constraint` | string \| null | バリデーション失敗時の制約名(機械可読、例: `"max_size"`, `"out_of_range"`, `"forbidden_pattern"`) |

既存フィールド(`request_id`、`error_type`、`status_code`、`stderr`、`exit_code`、`format`)は維持する。

#### HTTP ステータスコード

親要件「要件 10」の使い分けを継承し、以下を追加する:

- **400**: バリデーション失敗(`error_type=invalid_request`)。`error_field` / `error_constraint` を併せて返却(REQ-U-05、`timeout_ms` 範囲外含む、C-S-06)
- **429**: HTTP 層の同時受付上限(`RATE_LIMIT_MAX_INFLIGHT`)超過(REQ-S-03)。`error_type=rate_limited` + **`Retry-After` ヘッダ**を付与
- **503**: 次のいずれかで `error_type=service_unavailable` + **`Retry-After` ヘッダ**:
  - Browser_Pool 未初期化または全インスタンス不能(REQ-S-01 / REQ-S-02)
  - BrowserPool acquire の wait queue 満杯(`POOL_QUEUE_MAX` 超)または wait timeout(`POOL_WAIT_TIMEOUT_MS` 経過)(REQ-S-03)

### 5.2 観測可能性関連エンドポイント(NFR-05)

| パス | 用途 | 後方互換 |
|---|---|---|
| `GET /healthz` | 親要件「要件 8」継承。**liveness 相当**(プロセスが生きていれば常に 200、Browser_Pool 初期化前でも 200 を維持。コンテナを起動中に kill されないため) | **維持**(挙動・応答コードは後方互換) |
| `GET /livez` | **新規**。プロセス liveness、常に 200(`/healthz` のエイリアス兼新規名) | 新規追加 |
| `GET /readyz` | **新規**。BrowserPool が 1 BrowserContext 以上 acquire 可能かつ直近 5 分エラー率 < 50% で 200、それ以外 503(readiness、Kubernetes ロードバランサ向け) | 新規追加 |
| `GET /metrics` | **新規**。Prometheus 互換テキストで NFR-05 のメトリクスを expose | 新規追加 |

### 5.3 後方互換性ポリシー

- **リクエスト形状**: 既存の最小リクエストを引き続き受理し、HTTP 200 を返す(REQ-U-02)
- **レスポンス形状**: 既存フィールドはすべて維持。本改修ではフィールドを**追加するのみ**で削除・改名はしない
- **出力バイト互換**: **保証しない**。Beautiful_Defaults 適用により SVG/PNG の見た目は変わる(US-01〜US-03 の達成のため意図された変更)
- **エラーレスポンス**: 既存フィールド(`request_id` / `error_type` / `status_code` / `stderr` / `exit_code` / `format`)はすべて維持し、`error_message` / `line` / `error_field` / `error_constraint` の 4 フィールドを追加する形
- **エンドポイント**: 既存 `/healthz` は維持。`/livez` / `/readyz` / `/metrics` は新規追加(既存クライアントへの影響なし)

## 6. 受入基準サマリ(横断確認用)

| 確認項目 | 関連要件 | 関連 US |
|---|---|---|
| 改修前と同じ最小リクエストが HTTP 200 で動作する | REQ-U-02 | US-06 |
| 何も指定しないリクエストの SVG が、配布 HTML embed 用途で意図した「美しさ」を達成する | REQ-U-01 | US-01 |
| `mermaid_config` で指定した値がレンダリング結果に反映される | REQ-E-01 | US-03 |
| `securityLevel: "loose"` を指定しても無視され、`strict` のままレンダリングされる | REQ-E-02, REQ-UN-01, REQ-U-06 | 横断 |
| パース失敗時のレスポンスに `error_message` / `line` フィールドが含まれる | REQ-U-05, REQ-E-03, REQ-E-04 | US-05 |
| 構文エラー時に "Syntax error" 図 SVG が返却されない | REQ-U-07 | US-05 |
| 連続 100 リクエストで Puppeteer **browser プロセス**がリクエスト数に比例して増えず、設計上の少数(recycle 一時 +1 含む)に収まる | REQ-U-08 | US-07 |
| Browser_Pool 初期化前のリクエストが 503 を返す | REQ-S-01 | US-07 |
| `format=png` で SVG 専用 Post_Process_Option を指定しても PNG が返る | REQ-E-05 | US-04 |
| HTTP 層上限超で **即時 429** + `Retry-After`、Pool 層上限超で **wait 後 503** + `Retry-After` | REQ-S-03 | US-07 / 横断 |
| `mermaid_config.__proto__` 等の Prototype Pollution payload を送信しても `Object.prototype` が改変されない | REQ-UN-06 | 横断 |
| `timeout_ms=60000`(上限超)が `invalid_request` で 400、`error_field="timeout_ms"` / `error_constraint="out_of_range"` が含まれる | REQ-U-05, REQ-E-07, C-S-06 | US-05 / 横断 |
| Mermaid_Config_Override の許可キー外の未知キー(例: `nonexistent_key`、`unsupportedDiagram` 等。`SERVER_LOCKED_SETTINGS` 該当キーには含まれないもの)は **無視 + 警告 `unknown_key`** で処理継続。`SERVER_LOCKED_SETTINGS` 該当キー(`securityLevel` / `maxTextSize` / `maxEdges` / `startOnLoad` / `secure`)は **無視 + 警告 `locked_setting_override_ignored`** | REQ-E-06 | 横断 |
| `/metrics` で `render_total` / `render_duration_ms` / `browser_pool_in_use` 等を expose | NFR-05 | 横断 |
| `RENDERER_MODE=cli` 切替で `mmdc` subprocess 経由のレンダリングが機能する | NFR-06 | 横断 |
| `format=svg` レスポンスのすべての `<foreignObject>` 要素の `style` 属性に `overflow:visible` が含まれている(冪等、利用者によるオプトアウト不可) | REQ-U-09 | US-02 |
| Case 10 相当(`整理する<br>(手動 + ✓)` のような CJK + 半角混在ラベル)を `<img>` モード(standalone SVG)で描画してもクリップしない | REQ-U-09, C-H-03 | US-02 |
| 純 ASCII(`(test + ok)` 等)を `<img>` モードで描画してもクリップしない(日本語非依存) | REQ-U-09, C-H-03 | US-02 |
| `format=png` リクエストでは REQ-U-09 の SVG 後処理は実行されない | REQ-U-09 | US-02 |

## 7. 非機能要件

### NFR-01: レイテンシ目標

THE System SHALL 単純な flowchart(ノード 5 個以下)のレンダリングを定常状態で **応答時間中央値 500ms 以下**で完了する。具体的な計測条件・しきい値は `design.md` の性能計測戦略を参照。

### NFR-02: 依存バージョンの厳密管理

THE System SHALL `@mermaid-js/mermaid-cli` を **caret や tilde を付けない exact version**(例: `11.12.0`)で `package.json` に固定し、`package-lock.json` をリポジトリにコミットし、CI は `npm ci` を使用する。依存更新は Renovate / Dependabot に **自動マージを許可せず**、更新 PR では **画像差分(`pixelmatch` 等)+ property test + 性能ベンチ** の通過を必須要件とする。`puppeteer` の peerDependency バージョンも同様に同期管理する(C-M-10)。根拠: C-M-07 / C-M-08 / C-M-09 / C-M-10。

Phase 4.5 の security dependency remediation に限り、MVP 受入では `npm audit --omit=dev --audit-level=high`、SVG structural safety、主要 diagram regression、既存 property/security test、Docker/render smoke を必須とし、PNG pixel diff と詳細性能ベンチは production rollout 前の推奨検証として扱ってよい。ただし Mermaid の描画差分が大きい、または production rollout を同一 PR で行う場合は、画像差分と性能ベンチも必須に戻す。

### NFR-03: 段階的デプロイ

THE System SHALL 現行本番 Docker コンテナを稼働させたままテスト用 Docker コンテナで検証可能な状態を提供する。詳細手順は `design.md` のデプロイ戦略を参照。

### NFR-04: 観測可能性

THE System SHALL 新規パラメータが指定されたリクエストおよび警告条件(未知キー、Server_Locked_Setting 上書き試行等)を構造化ログで識別可能にする。

### NFR-05: 構造化ログとメトリクス

THE System SHALL リクエストごとに **構造化ログ**(JSON、最低限 `request_id` / `format` / `code_bytes` / `queue_ms` / `render_ms` / `post_process_ms` / `total_ms` / `pool_in_use` / `pool_waiting` / `result` を含む)を出力し、Prometheus 互換のメトリクスエンドポイント(`/metrics`)で次のメトリクスを expose する: `render_total{result,format}`, `render_duration_ms` (histogram), `queue_wait_ms` (histogram), `browser_pool_in_use` (gauge), `browser_pool_queue_size` (gauge), `render_timeout_total`, `browser_restarts_total`, `validation_error_total{field}`。

### NFR-06: レンダラ実装の切替可能性

THE System SHALL Programmatic API 実装の障害時に、環境変数 `RENDERER_MODE`(`programmatic` | `cli`、default `programmatic`)の切替で `mmdc` subprocess 経由のフォールバック実装に切り替え可能であること。Programmatic 実装と subprocess 実装はアプリ本体から見て同一のインターフェース(`MermaidRendererAdapter`)で隔離されること。

## 8. Out of Scope(本改修の範囲外、将来別票)

- **同一ページ複数 SVG embed の ID 衝突完全対応**: 軽量 ID 一意化(設計書 §7)のみ実装する。SVG 内部 ID(`<marker>`, `<clipPath>` 等)の完全 rewrite は別票。
- **ELK レイアウトのデフォルト採用**: 既知不具合(C-M-04)が解消された時点で再評価。
- **`htmlLabels: false` のサポート強化**: v11.11+ の既知バグ(C-M-03)が修正されるまでオプトインのまま。
- **Mermaid バージョンアップ**: 本改修では Phase 4 baseline として現行バージョン系統を使用(NFR-02)。ただし Phase 4.5 の security dependency remediation では、known advisory 解消に必要な範囲に限り `@mermaid-js/mermaid-cli` / Mermaid 系依存の exact pin 更新を例外的に対象とする(C-D-09)。
- **エラーメッセージの日本語化**: AI 自己修復・GitHub Issue 照合のために英語原文を保持。日本語化は将来検討。
- **Web フォント同梱・font subsetting**: 配布物の肥大化トレードオフが大きく別票。
- **キャッシュ・非同期ジョブ・大規模スケール**: 親要件定義書の Out of Scope を継承。

## 9. 親要件との関係

本要件定義書は親要件定義書(`mermaid-image-converter/requirements.md`)を**拡張**する位置付けであり、親要件のうち以下を**そのまま継承**する:

- 要件 1(Mermaid コードの受付と画像変換)
- 要件 2(エラー情報の透過的な返却)— ただし本改修で `error_message` / `line` / `error_field` / `error_constraint` の 4 フィールドを**追加**する
- 要件 3(入力検証)
- 要件 4(タイムアウト処理)
- 要件 5(同時実行制御)
- 要件 6(ログ記録とトレーサビリティ)
- 要件 7(一時ファイル管理)— Programmatic_API 採用により一時ファイル数は減るが、削除規約は維持
- 要件 8(ヘルスチェック)
- 要件 9(Docker 環境での動作)
- 要件 10(レスポンス形式)— 本改修で失敗時 JSON に `error_message` / `line` / `error_field` / `error_constraint` の 4 フィールドを**追加**する
- 要件 11(セキュリティ MVP)

親要件と本要件で齟齬が発生した場合、本要件を優先する(より新しい意思決定であるため)。
