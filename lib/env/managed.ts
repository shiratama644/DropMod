/**
 * Managed File Ownership Model の導出ロジック (Phase 12-A)。
 *
 * PHASE12_PLAN.md §10.5 を実装する:
 *   - Import 時の `ProjectItem.artifact` (sha1/path/size) を初期
 *     `ManagedFileRecord` として展開する
 *   - `source` は `'dropmod'` (DropMod の検索から追加) / `'import'` (Import 由来) /
 *     `'modpack'` (.mrpack 由来。Phase 12-C)
 *
 * **この台帳に無いファイルは Sync で絶対に削除しない** (§4 禁止事項)。
 * Phase 11 までの Profile は台帳を持たないため、紐付け直後の初回 Sync では
 * deletion が 1 件も発生しない (= 安全側の挙動)。
 *
 * pure function のみ。IndexedDB への読み書きは `lib/db/dexie.ts` が担う。
 */

import type {
  ContentCategory,
  ManagedFileRecord,
  ManagedFileSource,
  Profile,
  ProjectItem
} from '@/types';

/** `ManagedFileRecord.id` の区切り文字 (`${profileId}::${path}`) */
export const MANAGED_ID_SEPARATOR = '::';

/** カテゴリ → Profile 内の配列キー */
const CATEGORY_KEY: Record<ContentCategory, 'mods' | 'resourcepacks' | 'shaderpacks'> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks'
};

/** Sync / 台帳の対象となる 3 カテゴリ (固定順。UI 表示順もこれに揃える) */
export const MANAGED_CATEGORIES: readonly ContentCategory[] = [
  'mod',
  'resourcepack',
  'shader'
];

/** `ManagedFileRecord.id` を組み立てる */
export function buildManagedFileId(profileId: string, path: string): string {
  return `${profileId}${MANAGED_ID_SEPARATOR}${path}`;
}

/** `ManagedFileRecord.id` から profileId / path を分解する */
export function parseManagedFileId(id: string): { profileId: string; path: string } | null {
  const idx = id.indexOf(MANAGED_ID_SEPARATOR);
  if (idx <= 0) return null;
  return {
    profileId: id.slice(0, idx),
    path: id.slice(idx + MANAGED_ID_SEPARATOR.length)
  };
}

/** カテゴリに対応する ProjectItem 配列を返す (未設定カテゴリは空配列) */
export function itemsOfCategory(profile: Profile, category: ContentCategory): ProjectItem[] {
  return profile[CATEGORY_KEY[category]] ?? [];
}

/**
 * `ProjectItem` から `source` を導出する。
 *
 * - `artifact` あり → ローカル実体を取り込んだもの = `'import'`
 * - `artifact` なし → DropMod の検索 UI から追加したもの = `'dropmod'`
 *
 * ※ `'modpack'` は Phase 12-C の `.mrpack` Import が**明示的に**設定する。
 *   ここからは導出しない (ProjectItem 側に modpack 由来の印を持たないため)。
 */
export function deriveManagedSource(item: ProjectItem): ManagedFileSource {
  return item.artifact ? 'import' : 'dropmod';
}

/**
 * Profile から `ManagedFileRecord[]` を導出する。
 *
 * **`artifact` を持つ ProjectItem のみ**が対象。`artifact` 無しのアイテムは
 * ローカル実体が存在しない (= 台帳に載せるファイルが無い) ため除外し、
 * Diff Engine 側で「追加 (要ダウンロード)」として扱う。
 *
 * 同一 `path` に複数アイテムが割り当たる異常データは、projectId 昇順で
 * 先に来た 1 件だけを採用する (決定論的であること = テスト可能性を優先)。
 */
export function expandProfileToManaged(profile: Profile, now: number = Date.now()): ManagedFileRecord[] {
  const records: ManagedFileRecord[] = [];

  for (const category of MANAGED_CATEGORIES) {
    const items = itemsOfCategory(profile, category)
      .filter((item): item is ProjectItem & { artifact: NonNullable<ProjectItem['artifact']> } =>
        Boolean(item.artifact?.sha1 && item.artifact?.path)
      )
      .sort((a, b) => a.projectId.localeCompare(b.projectId));

    const seen = new Set<string>();
    for (const item of items) {
      const artifact = item.artifact;
      if (seen.has(artifact.path)) continue;
      seen.add(artifact.path);
      records.push({
        id: buildManagedFileId(profile.id, artifact.path),
        profileId: profile.id,
        category,
        projectId: item.projectId,
        path: artifact.path,
        sha1: artifact.sha1,
        size: artifact.size,
        source: deriveManagedSource(item),
        managedAt: now
      });
    }
  }

  return records.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 導出した台帳 (`candidates`) を DB 上の既存台帳 (`existing`) とマージする。
 *
 * **既存レコードから引き継ぐもの** (Profile 再導出で失ってはならない情報):
 *   - `source`      — D-6: modpack 解除で `'import'` に昇格させた結果を守る
 *   - `managedAt`   — 台帳登録時刻 (LRU 系の判定に使う可能性がある)
 *   - `syncedAt`    — 直近 Sync 時刻
 *
 * **candidates 側を正とするもの**:
 *   - `sha1` / `size` — Profile の `artifact` が最新値 (Sync で書き込んだ結果)
 *
 * 新規レコードは candidates のまま追加する。
 */
export function mergeManagedRecords(
  candidates: ManagedFileRecord[],
  existing: readonly ManagedFileRecord[]
): ManagedFileRecord[] {
  const existingById = new Map(existing.map((r) => [r.id, r]));
  return candidates.map((c) => {
    const prev = existingById.get(c.id);
    if (!prev) return c;
    return {
      ...c,
      source: prev.source,
      managedAt: prev.managedAt,
      ...(prev.syncedAt !== undefined ? { syncedAt: prev.syncedAt } : {})
    };
  });
}
