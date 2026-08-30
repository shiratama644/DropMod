# 2026-08-31 ORG-1 ファイル命名規則統一 (camelCase 化 + 意味のないドット排除)

## 指示内容

- 「丁寧に ORG-1 から進めてください。このサブフェーズはやることが多いので
  区切って細分化し、コミットなどをするようにしてください。ORG-1 が終わり次第、
  次の許可を僕にお願いしてください」
- ORG-1 = リネーム 25 件 + 付随移動 1 件 + import 参照更新（計画 §10.2）

## 実行内容

8 グループ + 漏れ修正 + docs 更新の計 10 コミット。各グループで 4 検証 (typecheck /
biome / test:unit 1244 passed / build exit 0) を PASS してからコミット。

| コミット | グループ | 内容 |
|---|---|---|
| `67f03f2a` | 1a | lib/platform (rate-limit→rateLimit / site-url→siteUrl) + seo (og-copy→ogCopy) + テスト 2 件 |
| `5c4a7f40` | 1b | scripts (build-env→buildEnv / build-fontawesome-subset→buildFontawesomeSubset) + テスト 1 件 + package.json |
| `87762436` | 1c | lib/env (hash.worker→hashWorker / fs-access.d→fsAccess.d) |
| `b25fd0cf` | 1d | e2e helper (annotation-reporter→annotationReporter) + discover-modal-metadata.test リネーム |
| `1e9cc622` | 1e | sync db テストを db/ フォルダにミラー (db.managed→db/managed / db.syncTransactions→db/transactions) |
| `ee11a0cf` | 1f | dexie.v4→dexieUpgrade (バージョン非依存) / dexie.migration→dexieMigration / next-config.security→nextConfigSecurity |
| `6d4f8726` | 1g | NewProfileModal テストをフォルダ化 (NewProfileModal/FolderImport.test.tsx 等) |
| `9750e3c8` | 1h | E2E spec 7 件 camelCase 化 |
| `097d3c3b` | 漏れ | useZipExport.test.tsx の E2E 参照コメント更新 |
| `4f368bcf` | docs | task-list 状態 (実環境検証待ち 95%) + 計画書 §12 実績 |

## 気づき

- **E2E spec の CI 確認が残る**: リネームはローカルで完了・testMatch はデフォルト
  (`*.spec.ts` 自動検出)・CI ワークフローは spec 名を列挙していないため CI で落ちる
  リスクは極小だが、§6.9.1 に従い「実環境検証待ち 95%」とした。workflow_dispatch で
  確認後に 100% にする。
- **grep の誤検出**: `db.syncTransactions` は Dexie テーブルプロパティとして多数残る
  (ファイル名ではない)。旧名チェック時は「ファイル名参照のみ」を区別する必要がある。
- **チェックリストのパス誤り**: ogCopy.test.ts の存在確認で誤ったパス
  (`__tests__/lib/platform/` と記述) を検証して一時 MISSING と誤判定。
  実ファイルは `__tests__/features/seo/utils/ogCopy.test.ts` に正しく存在。
- **git mv の検出**: すべて 100% 類似度の rename として検出され、バイナリ/内容の
  破損なし。`git diff --stat` で rename 表示を確認した。

## 次アクション

- ORG-2 (src/ 移行) の許可をユーザーに求める (指示された停止条件)。
- E2E CI 確認はユーザー/CI 側で workflow_dispatch 実行 → green 確認後に ORG-1 を 100% 化。
