# foreignObject 内側センタリング検証 (REQ-U-10) — 2026-05-17

## 環境

- ブランチ: `investigate/state-diagram-padding`
- コミット SHA: efee3bdbda23e10dc9bb390c6ce656298c40cb39 (実装前) → 実装コミットは本報告書の成果物コミット
- Docker compose 構成: `docker-compose.yml` + `docker-compose.dev-sysadmin.yml`、test サービス port 3101、`.env.test` 使用
- Mermaid version:

```bash
npm ls mermaid @mermaid-js/mermaid-cli
# mermaid-render-api@1.0.0
# └─┬ @mermaid-js/mermaid-cli@11.14.0
#   └── mermaid@11.15.0
```

- 検証実施者: Claude Code (hirokun-hub)
- 実施日時: 2026-05-17

## 単体テスト結果

### `npm test -- postProcess.foreignObjectInnerCenter` (14 tests)

```
✓ test/unit/postProcess.foreignObjectInnerCenter.test.ts (14 tests) 6ms
Test Files  1 passed (1)
Tests       14 passed (14)
```

### `npm test -- prop-19` (4 tests)

```
✓ test/property/prop-19_force_foreignobject_inner_center.property.test.ts (4 tests) 33ms
Test Files  1 passed (1)
Tests       4 passed (4)
```

### 既存 F-1 テスト (REQ-U-09 回帰なし)

```
✓ test/unit/postProcess.foreignObjectOverflow.test.ts
✓ test/property/prop-18_force_foreignobject_overflow.property.test.ts
```

### 全テスト

```
Test Files  53 passed (53)
Tests       218 passed (218)
```

## 結合テスト結果

### shift_px (12 ケース、修正前 → 修正後)

| case | node | text | shift_px (before) | shift_px (after) | 判定 |
|---|---|---|---:|---:|---|
| ex09-many-checks | A-0 | ✓ × 10 | +16.27 | 0 | ✓ |
| ex01-emoji-pile | A-0 | ✅✅✅ 集める ✅✅✅ | +13.12 | 0 | ✓ |
| ex02-mixed-emoji | A-0 | 📤 CSV出力 → ✓ 完了 🎉 | +9.53 | 0 | ✓ |
| ex10-long-emoji | A-0 | 🚀 デプロイ完了 🎉🎉🎉 | +9.53 | 0 | ✓ |
| ex03-tick-mark | A-0 | 集める ✓✓✓✓✓ | +6.99 | 0 | ✓ |
| ex07-narrow-i | B-1 | WWWWWWWWWW | +5.27 | 0 | ✓ |
| ex04-brackets | A-0 | 【重要】CSV連携 ✅ | +4.59 | 0 | ✓ |
| ex07-narrow-i | A-0 | iiiiiiiiii | -4.23 | 0 | ✓ |
| ex08-mixed-w-cjk | B-1 | 完了 ✅ | +2.41 | 0 | ✓ |
| ex12-square-bracket | A-0 | [INFO] 集める処理 ✓ | +2.23 | 0 | ✓ |
| ex10-long-emoji | B-1 | ✅ | +1.98 | 0 | ✓ |
| ex04-brackets | B-1 | END | +0.91 | 0 | ✓ |
| ex08-mixed-w-cjk | A-0 | 集める ✓ (PrimeDrive 自動) | +0.81 | 0 | ✓ |
| ex05-arrow-symbols | A-0 | → ★ ◯ ⚠ ☆ ← | +0.63 | 0 | ✓ |
| ex11-mixed-jpcn | A-0 | 日本語と中文混合 漢字漢字 | +0.62 | 0 | ✓ |
| ex12-square-bracket | B-1 | [OK] | -0.51 | 0 | ✓ |
| ex01-emoji-pile | B-1 | 完了 | -0.01 | 0 | ✓ |
| ex02-mixed-emoji | B-1 | 次 | -0.01 | 0 | ✓ |
| ex03-tick-mark | B-1 | 完了 | -0.01 | 0 | ✓ |
| ex05-arrow-symbols | B-1 | 了 | -0.01 | 0 | ✓ |
| ex06-fullwidth-w | A-0 | ＷＷＷＷＷＷＷＷ | -0.01 | 0 | ✓ |
| ex06-fullwidth-w | B-1 | 了 | -0.01 | 0 | ✓ |
| ex09-many-checks | B-1 | 了 | -0.01 | 0 | ✓ |
| ex11-mixed-jpcn | B-1 | 了 | -0.01 | 0 | ✓ |

全 24 行で `|shift_px| < 2.0` か → **✓ (全24行 shift_px=0)**

### PNG パスへの F-2 不介入 (AC-4 = 正式担保)

- `npm test -- postProcess.foreignObjectInnerCenter` の #13 (format=png バイト一致) が pass
- 結果: ✓

### PNG バイト一致 (AC-P-1-Ref = 参考検証)

- 12 ケース × PNG = 12 ファイル、prod (port 3100) と test (port 3101) で `sha256sum` 比較
- 一致した行数: **12/12**
- 不一致: なし
- 結論: **F-2 は PNG 出力に一切影響しない (完全一致)**

## 視覚比較スクリーンショット

### 修正前

![before](./text-right-shift-investigation-2026-05-17/extreme-overview.png)

### 修正後

![after](./text-right-shift-investigation-2026-05-17/extreme-overview-after.png)

### 並列比較ハイライト

- ex09 (`✓ × 10`): before = +16.27px 右寄り明白 / after = 0 (完全中央)
- ex01 (`✅✅✅ 集める ✅✅✅`): before = +13.12px / after = 0
- ex07 (`iiiiiiiiii` / `WWWWWWWWWW`): before = A: -4.23px / B: +5.27px / after = 両方 0
- 全12ケース: flex ラッパにより内側 cell が中央アンカーとなり、フォント差オーバーフローが左右均等に分散

## 回帰チェックリスト (§4.3.5)

| ケース | SVG 生成 | 視覚確認 | 結果 |
|---|---|---|---|
| 単純 flowchart | OK (15869 bytes) | OK — A/B ノードテキスト中央 | ✓ |
| 複数行ラベル (集める ✓) | OK (15926 bytes) | OK — 2行ラベルも正常 | ✓ |
| State diagram (simple) | OK (32599 bytes) | OK — 状態ノード A/B 正常 | ✓ |
| State diagram (composite) | OK (15094 bytes) | OK — Active state 内 X/Y 正常 | ✓ |
| Edge label | OK (15936 bytes) | OK — 「処理」ラベル正常 | ✓ |
| Subgraph (cluster) | OK (16654 bytes) | OK — S1 内 A/B 正常 | ✓ |
| 短文のみ (了/完了) | OK (15886 bytes) | OK — テキスト中央配置 | ✓ |

全7パターン: 破綻なし

## 受入条件チェック

| ID | 条件 | 結果 |
|---|---|---|
| AC-1 | 全 24 行で `|shift_px| < 2.0` | ✓ (実測: 全行 shift_px=0) |
| AC-2 | 既存 F-1 テスト pass (REQ-U-09 回帰なし) | ✓ |
| AC-3 | 新規 F-2 単体 (14件) + property テスト (4件) pass | ✓ |
| AC-4 | PNG 出力 F-2 通らない (unit test #13 Buffer.compare===0) | ✓ |
| AC-5 | 回帰チェックリスト全 PASS | ✓ |
| AC-6 | 視覚回帰スクリーンショット OK (右寄り消滅を目視確認) | ✓ |
| AC-P-1-Ref | 実 API PNG sha256sum 12/12 一致 | ✓ |

## 結論

- 本 PR をマージしてよいか: **Yes**
- 全 AC 達成。F-2 の flex ラッパ挿入により shift_px が修正前最大 +16.27px → 修正後 0 に改善。PNG 出力への影響なし (完全バイト一致)。回帰なし。

## 派生発見

- flex ラッパ適用後、内側 `display:table-cell` div が flex item として配置される(CSS 仕様上 anonymous table-row が生成)。実機 Chromium では問題なく、State diagram を含む全7パターンで縦方向 baseline ズレも発生しなかった。
- AC-P-1-Ref が全一致したため、F-2 が PNG パスに全く影響しないことが結合テストレベルでも確認できた。
