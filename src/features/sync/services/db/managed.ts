/**
 * managedFiles / dirHandles の Dexie 操作 (ARCH-2D)。
 */

import { generateId } from '@/lib/utils/id';
import { db, type DirHandleRow, type ManagedFileRow } from '@/lib/db/dexie';

export type { DirHandleRow, ManagedFileRow };

/**
 * Profile 1 件分の `ManagedFileRecord` を台帳へ**差分同期**する。
 *
 * 「現在の Profile から導出した台帳」を正として、
 * DB にあるが records に無い行を削除し、records を bulkPut する。
 * 単一 transaction のため中断されても整合性が保たれる (`syncProfiles` と同じ方針)。
 */
export async function syncManagedFiles(
  profileId: string,
  records: ManagedFileRow[]
): Promise<void> {
  await db.transaction('rw', db.managedFiles, async () => {
    const currentIds = new Set(records.map((r) => r.id));
    const dbIds = await db.managedFiles.where('profileId').equals(profileId).primaryKeys();
    const idsToDelete = dbIds.filter((id) => !currentIds.has(String(id)));
    if (idsToDelete.length > 0) {
      await db.managedFiles.bulkDelete(idsToDelete as string[]);
    }
    if (records.length > 0) {
      await db.managedFiles.bulkPut(records);
    }
  });
}

/** Profile 1 件分の台帳を取得 (path 昇順。Diff Engine / Preview 表示用) */
export async function getManagedFiles(profileId: string): Promise<ManagedFileRow[]> {
  const rows = await db.managedFiles.where('profileId').equals(profileId).toArray();
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Profile の台帳を全削除する。
 * Profile 削除時・ローカル環境の紐付け解除時に呼ぶ。
 * ⚠️ 台帳を消すと Sync は該当ファイルを「管理外」とみなし**削除対象外**にする
 *    (§10.2 の 3 条件の 1 つ目を満たさなくなるため)。安全側の挙動。
 */
export async function deleteManagedFilesForProfile(profileId: string): Promise<void> {
  await db.managedFiles.where('profileId').equals(profileId).delete();
}

/**
 * `FileSystemDirectoryHandle` を保存し、参照用 ID を返す。
 * 返り値を `Profile.linkedSource.handleId` に保存する。
 */
export async function saveDirHandle(
  profileId: string,
  handle: FileSystemDirectoryHandle,
  name: string
): Promise<string> {
  const id = generateId('dh');
  await db.dirHandles.put({ id, profileId, handle, name, savedAt: Date.now() });
  return id;
}

/** 保存済み handle を取得。無ければ null (再選択を促す) */
export async function getDirHandle(id: string): Promise<DirHandleRow | null> {
  const row = await db.dirHandles.get(id);
  return row ?? null;
}

/** 保存済み handle を削除 (紐付け解除時) */
export async function deleteDirHandle(id: string): Promise<void> {
  await db.dirHandles.delete(id);
}
