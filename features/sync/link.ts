/**
 * フォルダ紐付け (Phase 12-B)。
 *
 * `Profile.linkedSource` の生成・解除・復元を担当する。Phase 11 は
 * 「毎回フォルダ選択 → 使い捨て」だったが、Phase 12 では Profile に保存して
 * Sync 先を固定する (§10.1)。
 *
 * ## D-7 (2026-08-29 確定): `readwrite` 権限の要求タイミング
 *
 * **紐付け時は `mode: 'read'`** (既存の `pickMinecraftDirectory()` をそのまま使用)。
 * `readwrite` への昇格は Sync 実行時に `FileSystemSink.ensureWritable()` で試みる。
 * 解析だけしたいユーザーに書き込み権限を迫らないため。
 * 昇格が拒否された場合は **D-2** の Read-only フォールバックに入る。
 */

import { deleteDirHandle, getDirHandle, saveDirHandle } from '@/lib/db/dexie';
import type { LinkedSource } from '@/types';
import { detectEnvironment, type DetectedEnvironment } from '@/lib/env/detector';
import { pickMinecraftDirectory, type PickedDirectory } from '@/lib/env/picker';
import type { EnvironmentSink } from './sink';
import { FileSystemSink } from './sink/filesystem';
import { FileSystemSource, type EnvironmentSource } from '@/lib/env/source';

/** 注入可能な依存 (テストで picker を差し替えるため) */
export interface FolderLinkDeps {
  pick?: () => Promise<PickedDirectory | null>;
}

/**
 * 復元した紐付け先 (Source = 読み取り / Sink = 書き込み)。
 *
 * `source` は**具体クラスではなく `EnvironmentSource` として公開する**。
 * 呼び出し側 (`prepareSync` 等) はインターフェースしか使わないため、
 * 具体型を露出させると差し替え (テストのスタブ等) ができなくなる。
 * 実体は常に `FileSystemSource`。
 */
export interface OpenedLinkedFolder {
  handle: FileSystemDirectoryHandle;
  source: EnvironmentSource;
  sink: EnvironmentSink;
  rootName: string;
}

/**
 * `DetectedEnvironment` から `LinkedSource` を組み立てる (**pure function**)。
 *
 * 検出できなかったフィールドは `undefined` のまま残す。D-1 の環境一致チェックは
 * 「ローカル側が値を持つフィールドのみ」を比較するため、Generic フォルダのように
 * 検出に失敗した場合でも Sync を妨げない (`environmentCheck.ts` の `unverified`)。
 */
export function buildLinkedSource(input: {
  handleId: string;
  rootName: string;
  detected: DetectedEnvironment;
  now?: number;
}): LinkedSource {
  const { handleId, rootName, detected, now = Date.now() } = input;
  return {
    kind: 'filesystem',
    rootName,
    handleId,
    environment: {
      mcVersion: detected.mcVersion,
      loader: detected.loader,
      loaderVersion: detected.loaderVersion
    },
    contentDirs: {
      mods: detected.contentDirs.mods,
      resourcepacks: detected.contentDirs.resourcepacks,
      shaderpacks: detected.contentDirs.shaderpacks
    },
    linkedAt: now
  };
}

/**
 * フォルダを選択させ、解析して `LinkedSource` を生成する。
 *
 * ハンドルは Dexie `dirHandles` に保存し、返り値の `handleId` から参照する
 * (Profile 自体は JSON 直列化可能なまま保つ)。
 *
 * @returns ユーザーがキャンセルしたら `null` (エラー扱いしない)
 */
export async function createFolderLink(
  profileId: string,
  deps: FolderLinkDeps = {},
  now?: number
): Promise<LinkedSource | null> {
  const pick = deps.pick ?? pickMinecraftDirectory;
  const picked = await pick();
  if (!picked) return null;

  const { handle, source } = picked;
  const detected = await detectEnvironment(source);
  const handleId = await saveDirHandle(profileId, handle, handle.name);
  return buildLinkedSource({ handleId, rootName: handle.name, detected, now });
}

/**
 * **P12-D1**: 選択済みフォルダ (picked) + 解析済み環境から `LinkedSource` を生成する。
 *
 * `createFolderLink` が「選択 → 再検出」を行うのに対し、こちらは
 * NewProfileModal が**既に解析済み**の `DetectedEnvironment` を渡す。
 * 二重解析 (detectEnvironment の再実行) を避け、選択から作成までを 1 回の I/O で済ませる。
 *
 * ハンドルは Dexie `dirHandles` に保存する (**D-7**: picker は read モードのまま)。
 * @returns 生成した `LinkedSource` (保存失敗は throw)
 */
export async function linkPickedDirectory(
  profileId: string,
  picked: PickedDirectory,
  detected: DetectedEnvironment,
  now?: number
): Promise<LinkedSource> {
  const handleId = await saveDirHandle(profileId, picked.handle, picked.source.rootName);
  return buildLinkedSource({
    handleId,
    rootName: picked.source.rootName,
    detected,
    now
  });
}

/**
 * 紐付けを解除する。Dexie に保存したハンドルを削除する。
 *
 * **Profile 内のファイル (mods 等) には一切触れない。** 削除するのは
 * 「Sync 先の参照」だけ (§10.5 の所有権モデルを壊さないため)。
 * `handleId` が無ければ何もしない (冪等)。
 */
export async function releaseFolderLink(handleId?: string): Promise<void> {
  if (!handleId) return;
  await deleteDirHandle(handleId);
}

/**
 * `LinkedSource` から実際のフォルダを復元する。
 *
 * 以下の場合はいずれも `null` を返し、**例外を投げない**
 * (呼び出し側は「再選択を促す」UI を出す):
 * - `linkedSource` が未設定
 * - `kind !== 'filesystem'` (ZIP 紐付けは Direct Write 不可)
 * - `handleId` が無い / `dirHandles` から消えている
 *
 * ## ハンドルの妥当性チェックを**意図的に持たない**理由
 *
 * `typeof handle.getDirectoryHandle === 'function'` のような検査は一見安全だが、
 * テスト環境 (fake-indexeddb) の構造化クローンは prototype を落とすため
 * 常に不合格になり、正常系を検証できなくなる。実 Chromium では
 * `FileSystemDirectoryHandle` に構造化クローン算法が定義されており
 * メソッドを保ったまま復元される。
 *
 * そこで `dirHandles` を書くのは `saveDirHandle()` だけであることに依拠し、
 * 万一データが壊れていた場合は最初の API 呼び出しで TypeError になるのに任せる。
 * 呼び出し側 (`useSync`) がそれを捕捉して「フォルダを再選択してください」を出す。
 */
export async function openLinkedFolder(
  linkedSource: LinkedSource | undefined
): Promise<OpenedLinkedFolder | null> {
  if (linkedSource?.kind !== 'filesystem' || !linkedSource.handleId) {
    return null;
  }
  const row = await getDirHandle(linkedSource.handleId);
  if (!row?.handle) return null;
  const handle = row.handle;

  return {
    handle,
    source: new FileSystemSource(handle, row.name),
    sink: new FileSystemSink(handle, row.name),
    rootName: row.name
  };
}
