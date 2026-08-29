/**
 * インポート時 (Discover から既存 Profile への Modpack 追加) の競合検出・適用
 * (Phase 12-D2 / bug 3 / D-3 の「インポート時」側)。
 *
 * ## 競合とは
 *
 * Modpack の中身 (`modrinth.index.json` files[]) を展開した ProjectItem と
 * **Profile に既にある ProjectItem が同一 projectId** で、
 * **versionId が異なる** (または片方が未設定) こと。
 * (ユーザー補足: 「プロファイルに元々ある Sodium も Modpack に入っているので
 *   競合するはずが競合しなかった」)
 *
 * ## 既定 = ユーザー版を残す (D-3)
 *
 * データ消失が起きない側を既定にする。ユーザーが「Modpack 版に置換」を
 * 選んだものだけ Profile のエントリを書き換える。
 * **ここでは Profile (SSOT) だけを変更し、ローカルファイルへの書き込みは行わない**
 * (書き込みは必ず Sync Preview 経由 — §4)。
 *
 * pure function のみ。DB / React への依存は呼び出し側 (`hooks/useModpackAdd.ts`)。
 */

import type { ContentCategory, Profile, ProjectItem } from '@/types';
import { modpackLocksFromItems } from './mrpack';

/** 競合 1 件: Profile 版と Modpack 版 */
export interface ModpackAddConflict {
  projectId: string;
  /** 表示名 (Modpack 側) */
  name: string;
  profileItem: ProjectItem;
  packItem: ProjectItem;
}

export interface ModpackAddPlan {
  /** 新規に追加するアイテム (競合なし) */
  additions: ProjectItem[];
  /** 競合しているアイテム (ユーザーが選択) */
  conflicts: ModpackAddConflict[];
  /** 同一 projectId + 同一 versionId で追加不要だった件数 */
  skipped: number;
}

export type ModpackConflictChoice = 'keep' | 'replace';

/** 同一 project のアイテムを Profile 全体から探す (3 カテゴリ横断) */
function findProfileItem(profile: Profile, projectId: string): ProjectItem | undefined {
  return (
    profile.mods.find((m) => m.projectId === projectId) ??
    profile.resourcepacks?.find((m) => m.projectId === projectId) ??
    profile.shaderpacks?.find((m) => m.projectId === projectId)
  );
}

/** 同一とみなすか。versionId が両方揃っていれば比較し、無ければ sha1 で fallback */
function isSameVersion(a: ProjectItem, b: ProjectItem): boolean {
  if (a.versionId && b.versionId) return a.versionId === b.versionId;
  const aSha = a.artifact?.sha1;
  const bSha = b.artifact?.sha1;
  if (aSha && bSha) return aSha === bSha;
  return true; // どちらも特定できない → 既に入っているものとして扱う (安全側)
}

/**
 * 展開済みアイテムを Profile と突き合わせ、追加 / 競合 / スキップに分類する。
 */
export function buildModpackAddPlan(
  profile: Profile,
  items: readonly ProjectItem[]
): ModpackAddPlan {
  const additions: ProjectItem[] = [];
  const conflicts: ModpackAddConflict[] = [];
  let skipped = 0;

  for (const packItem of items) {
    const profileItem = findProfileItem(profile, packItem.projectId);
    if (!profileItem) {
      additions.push(packItem);
      continue;
    }
    if (isSameVersion(profileItem, packItem)) {
      skipped++;
      continue;
    }
    conflicts.push({
      projectId: packItem.projectId,
      name: packItem.name,
      profileItem,
      packItem
    });
  }

  return { additions, conflicts, skipped };
}

/**
 * 選択結果を Profile に反映する (**pure function**)。
 *
 * - `keep` (既定) → Profile 版をそのまま残す
 * - `replace` → 該当 projectId のエントリを Modpack 版に書き換える
 * - `additions` はカテゴリ配列の末尾へ追加
 * - `modpackSource` を設定し、**収録物すべての lock** を記録する
 *   (keep を選んだ項目も「導入時の指定」として残す — P12-D3 の比較基準)
 */
export function applyModpackAddPlan(
  profile: Profile,
  plan: ModpackAddPlan,
  choices: ReadonlyMap<string, ModpackConflictChoice>,
  modpack: {
    projectId: string;
    slug?: string;
    name: string;
    versionId?: string;
    versionNumber?: string;
  },
  now: number = Date.now()
): Profile {
  const allPackItems = [...plan.additions, ...plan.conflicts.map((c) => c.packItem)];

  const replaceMap = new Map(
    plan.conflicts
      .filter((c) => (choices.get(c.projectId) ?? 'keep') === 'replace')
      .map((c) => [c.projectId, c.packItem])
  );

  /**
   * カテゴリ配列をマージする。
   * - replaceMap に載った projectId は Modpack 版に置換
   * - plan.additions は**同カテゴリのものだけ**末尾へ追加 (mods に
   *   resourcepacks が混入しないようにする)
   */
  const mergeCategory = (
    items: ProjectItem[] | undefined,
    category: ContentCategory
  ): ProjectItem[] | undefined => {
    const base = items ?? [];
    const replaced = base.map((item) => replaceMap.get(item.projectId) ?? item);
    const added = plan.additions.filter(
      (a) =>
        a.type === category && !replaced.some((r) => r.projectId === a.projectId)
    );
    const merged = [...replaced, ...added];
    return merged.length > 0 ? merged : undefined;
  };

  const mergedResourcepacks = mergeCategory(profile.resourcepacks, 'resourcepack');
  const mergedShaders = mergeCategory(profile.shaderpacks, 'shader');

  const next: Profile = {
    ...profile,
    mods: mergeCategory(profile.mods, 'mod') ?? [],
    ...(mergedResourcepacks ? { resourcepacks: mergedResourcepacks } : {}),
    ...(mergedShaders ? { shaderpacks: mergedShaders } : {}),
    modpackSource: {
      provider: 'modrinth',
      projectId: modpack.projectId,
      ...(modpack.slug ? { slug: modpack.slug } : {}),
      name: modpack.name,
      ...(modpack.versionId ? { versionId: modpack.versionId } : {}),
      ...(modpack.versionNumber ? { versionNumber: modpack.versionNumber } : {}),
      importedAt: now,
      lockedVersions: modpackLocksFromItems(allPackItems)
    }
  };
  return next;
}
