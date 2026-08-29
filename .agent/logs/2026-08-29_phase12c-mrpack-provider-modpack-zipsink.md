# Phase 12-C: .mrpack + Provider 抽象 + Modpack ハブ + ZipSink

**日付**: 2026-08-29
**タスクID**: P12-C (C1〜C6)
**ステータス**: 完了 (実環境検証待ち 90%)
**コミット**: `db648c2` → `69d97b6` → `a6d6f78` → `ec564f9` → `a9e7582` → `77caa4c` → `4cc6b27` → `b462bfa`

## 1. 指示内容 (Task Summary)

「計画書通りに進めることを最優先事項として次のセクションを実行してください」
— `PHASE12_PLAN.md` §9 の P12-C。成果物は「ZipSink / .mrpack パーサ /
Modpack UI / CF 検出表示」。§10.6 が仕様。

## 2. 実行内容 (Executed Actions)

### C1: `.mrpack` overrides (`db648c2`)

`lib/env/mrpack.ts` 新規。`overrides/` + `client-overrides/` のファイルのみ
`source:'modpack'` で台帳化。`server-overrides/` は読まない。
`mods/` `resourcepacks/` `shaderpacks/` 以外 (`config/` 等) は **skip** して
台帳に入れない — 入れると Sync の削除候補になる (§4 禁止事項)。

### C2: Provider 抽象 (`69d97b6` + `a6d6f78`)

`lib/providers/{types,modrinth,index}.ts` 新規。`ModrinthProvider` は
`lib/modrinth/client.ts` に委譲し、自身では HTTP しない。
`getProvider('curseforge')` は **`null`** (実装は P13-A)。

### C3: Modpack 更新検知 (`ec564f9`)

`types.ts` の `Profile.modpackSource` プレースホルダを実装。
`lib/env/modpackUpdate.ts` 新規 — Modpack 本体 + 収録 Mod を Modrinth と突き合わせ。
**更新検知は報告のみ**。書き込みは必ず Sync Preview を通す (§4)。

### C4: ZipSink (`a9e7582`)

`lib/env/sink/zip.ts` 新規。`EnvironmentSink` 実装なので
Executor / Journal / Backup / Rollback がそのまま動く。

### C5: Modpack ハブ + CurseForge 検知 (`77caa4c`)

`app/modpack/page.tsx` を予約ページから実ページへ。
`lib/env/modpack.ts` で ZIP の中身を見て形式判定 (拡張子では区別できない)。
CurseForge は **その場で止めて理由を伝える**。

### C6: ZIP Sync 経路 + 導線 (`4cc6b27` + `b462bfa`)

`lib/env/zipSync.ts` + `hooks/useZipSync.ts` + 設定ページの非対応ブラウザ分岐。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

### 🚨 `pnpm typecheck` を見ずにコミットした (§3.1 違反・自己修正済み)

`69d97b6` は **typecheck が失敗したままコミット・push された**。
`pnpm test:unit` (vitest は型を見ない) と `pnpm build` (テストファイルは
アプリのビルド対象外) が両方 green だったため見落とした。
`a6d6f78` で修正。**4 検証はすべて実行し、それぞれの出力を読む**。
`tail -2` で絞らない。

### `categoryDirs({})` は 1 件も走査しない (実バグ)

`categoryDirs()` は **dir が明示されたカテゴリだけ**を返す。
FileSystem 経路では `linkedSource.contentDirs` が常に埋まるため表面化していなかったが、
ZIP 経路では空になり **スキャン結果が常に 0 件**だった。
`DEFAULT_CONTENT_DIRS` を敷いて解決。

### ZipSink が OPFS を要求していた (設計の誤り)

`applySync` の既定 backup は `OpfsBackupStore`。しかし
**ZIP 経路を使う環境こそ OPFS が無い可能性がある** (Firefox / Safari / モバイル)。
`MemoryBackupStore` を `lib/env/backup.ts` に追加し、ZIP 経路の既定にした。

### JSZip は realm 違いの `Uint8Array` を弾く

Node の `TextEncoder` が返す `Uint8Array` は jsdom の `instanceof Uint8Array` に
失敗し「Can't read the data」となる。`new Uint8Array(data)` で作り直して解決。
実ブラウザは単一 realm だが堅牢性のため維持。

### `normalizeZipPath` が `..` を捨てるだけでは別ファイルになる

`mods/sub/../a.jar` → `mods/sub/a.jar` となり**意図と違うファイルに書かれる**。
スタックで畳む方式に修正。テストで発見。

### `applySync` は `resolveContent` を注入できない

常に `createContentResolver` を使うので、テストは `deps.fetchImpl` で差し替える。
さらに **本物の `Response` を返してはいけない** — `downloadFileWithRetry` は
`res.blob()` を呼ぶが、jsdom の `Response.blob()` が返す Blob には
`arrayBuffer()` が無く `blob.arrayBuffer is not a function` になる。
`{ok, status, blob}` だけの互換オブジェクトを返す。

### `vi.fn(async () => ...)` の `mock.calls` は空タプル

引数型を付けないと `calls[0][0]` が型エラーになる。
`vi.fn(async (_seed?: File) => undefined)` のように書く。

### テストのフィクスチャは実型に合わせる

`ManagedFileRecord` は `category` 必須・`versionId` 無し。`Profile` に `createdAt` 無し。
`ProjectItem` は `type` を使い `fileUrl` が必要。
`currentProfileId` は `string | undefined` (`null` 不可)。

### その他

- `revokeObjectURL` を即呼ぶと Safari でダウンロードが失敗することがある → 1 秒遅延
- JSZip は親ディレクトリエントリ (`mods/`) を自動生成する → テストはファイルだけを見る
- オブジェクトキーの `fabric-loader` はハイフンを含むのでクォート必須 (esbuild 変換エラー)

## 4. 未解決・次アクション (Next Steps)

- **実機 Firefox / Safari での ZIP Sync 確認はユーザー** (DoD の残りの 10%)
- P12-E2E (Sync の E2E spec) は未着手。PHASE12_PLAN §6 で「必須」
- P13-A: CurseForge Provider (`getProvider('curseforge')` は現在 `null`)
- `docs/task-list.md` の P12-C 行を「実環境検証待ち 90%」に更新済み
