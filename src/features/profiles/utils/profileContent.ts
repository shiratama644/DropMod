/**
 * Profile のコンテンツ配列 (mods / resourcepacks / shaderpacks) を横断するヘルパー。
 *
 * Phase 11 で resourcepacks / shaderpacks が Profile に追加されて以降、
 * 「選択中一覧」は 3 配列をまとめて表示する (`allContentItems` 相当) 一方、
 * 追加/削除/導入済み判定が mods[] だけを参照していたため、
 * - Resource Packs / Shaders タブの削除が効かない
 * - ゴミ箱ボタンが「追加」として動く (重複追加)
 * - 詳細ページの「追加」ボタンが「削除」にならない
 * という不整合があった。本ファイルの関数は 3 配列を横断して解消する。
 */

import type { ContentCategory, Profile, ProjectItem } from '@/types';
import { contentCategoryOf } from './contentCategory';

/** Profile の全コンテンツ (表示順: mods → resourcepacks → shaderpacks) */
export function allContentItemsOf(profile: Profile): ProjectItem[] {
  return [
    ...profile.mods,
    ...(profile.resourcepacks ?? []),
    ...(profile.shaderpacks ?? [])
  ];
}

/**
 * projectId または slug で該当アイテムを 3 配列横断で探す。
 * 無ければ null。
 */
export function findContentItem(
  profile: Profile,
  projectId: string | undefined | null,
  slug?: string | undefined | null
): ProjectItem | null {
  if (!projectId && !slug) return null;
  return (
    allContentItemsOf(profile).find(
      (m) =>
        (projectId != null && m.projectId === projectId) ||
        (slug != null && m.slug === slug)
    ) ?? null
  );
}

/** 該当アイテム (projectId または slug 一致) を**所属配列から**除去した Profile を返す。 */
export function removeContentItems(
  profile: Profile,
  ids: ReadonlySet<string>
): Profile {
  const matches = (m: ProjectItem) =>
    ids.has(m.projectId) || (m.slug != null && ids.has(m.slug));
  const noMatch = (m: ProjectItem) => !matches(m);
  return {
    ...profile,
    mods: profile.mods.filter(noMatch),
    resourcepacks: profile.resourcepacks ? profile.resourcepacks.filter(noMatch) : undefined,
    shaderpacks: profile.shaderpacks ? profile.shaderpacks.filter(noMatch) : undefined
  };
}

/** 指定カテゴリのアイテムを 3 配列横断で除去した Profile を返す。 */
export function removeCategoryItems(
  profile: Profile,
  category: ContentCategory
): Profile {
  const noMatch = (m: ProjectItem) => contentCategoryOf(m) !== category;
  return {
    ...profile,
    mods: profile.mods.filter(noMatch),
    resourcepacks: profile.resourcepacks ? profile.resourcepacks.filter(noMatch) : undefined,
    shaderpacks: profile.shaderpacks ? profile.shaderpacks.filter(noMatch) : undefined
  };
}
