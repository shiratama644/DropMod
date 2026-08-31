/**
 * 検索関連の共通定数。
 *
 * 以前は `app/page.tsx` (SSR 初期取得) と
 * `components/HomeInteractive.tsx` (CSR 追加読み込み) に同じ値
 * (`SEARCH_LIMIT = 24`) が個別定義されており、片方だけ変更した際に
 * SSR/CSR で件数が不一致になる潜在バグがあった。両者から本ファイルを
 * import することで DRY を担保する。
 */
export const SEARCH_LIMIT = 24;

/** Modrinth /search の project_type facet */
export const PROJECT_TYPES = ['mod', 'modpack', 'resourcepack', 'shader'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export function parseProjectType(raw: string | string[] | undefined | null): ProjectType {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (PROJECT_TYPES as readonly string[]).includes(value)) {
    return value as ProjectType;
  }
  return 'mod';
}

// ==========================================================================
// URL 設計 (docs/planning/ROUTING_REDESIGN_PLAN.md)
//   検索一覧       : /discover/<複数形>          (mods / modpacks / resourcepacks / shaders)
//   プレビューモーダル : /discover/<複数形>/<slug>
//   詳細ページ     : /<単数形>/<slug>            (mod / modpack / resourcepack / shader)
//   ※ Modrinth 公式と詳細 URL を一致させるため詳細は単数形。
//   ※ すべての URL 生成はこのセクションの関数経由で行う（一元化）。
// ==========================================================================

/** 検索一覧のパスセグメント（複数形） */
export const DISCOVER_SEGMENTS = ['mods', 'modpacks', 'resourcepacks', 'shaders'] as const;
export type DiscoverSegment = (typeof DISCOVER_SEGMENTS)[number];

const PROJECT_TYPE_TO_DISCOVER_SEGMENT: Record<ProjectType, DiscoverSegment> = {
  mod: 'mods',
  modpack: 'modpacks',
  resourcepack: 'resourcepacks',
  shader: 'shaders'
};

/** 詳細ページのパスセグメント（単数形 = ProjectType そのまま） */
export const DETAIL_SEGMENTS = PROJECT_TYPES; // ['mod','modpack','resourcepack','shader']

/** ProjectType → 詳細ページ URL。例: detailPathForType('mod', 'sodium') => '/mod/sodium' */
export function detailPathForType(type: ProjectType, slug: string): string {
  return `/${type}/${slug}`;
}

/** ProjectType → プレビューモーダル URL。例: modalPathForType('mod', 'sodium') => '/discover/mods/sodium' */
export function modalPathForType(type: ProjectType, slug: string): string {
  return `${discoverPathForType(type)}/${slug}`;
}

/** 任意の project_type 文字列 → 詳細ページ URL（未知型は 'mod' 扱い） */
export function detailPathFromProject(
  projectType: string | undefined | null,
  slug: string
): string {
  return detailPathForType(parseProjectType(projectType), slug);
}

/** 任意の project_type 文字列 → プレビューモーダル URL（未知型は 'mod' 扱い） */
export function modalPathFromProject(
  projectType: string | undefined | null,
  slug: string
): string {
  return modalPathForType(parseProjectType(projectType), slug);
}

export function discoverPathForType(type: ProjectType): string {
  return `/discover/${PROJECT_TYPE_TO_DISCOVER_SEGMENT[type]}`;
}

/** `/discover/:segment`（複数形）を ProjectType にする。未知なら null */
export function parseDiscoverSegment(raw: string | string[] | undefined | null): ProjectType | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  for (const t of PROJECT_TYPES) {
    if (PROJECT_TYPE_TO_DISCOVER_SEGMENT[t] === value) return t;
  }
  return null;
}

/** 詳細セグメント（単数形）を ProjectType にする。未知なら null */
export function parseDetailType(raw: string | string[] | undefined | null): ProjectType | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (PROJECT_TYPES as readonly string[]).includes(value)) {
    return value as ProjectType;
  }
  return null;
}

/** 詳細ページの「一覧に戻る」用。未知は Mods 検索へ。 */
export function discoverPathFromProjectType(raw: string | undefined | null): string {
  return discoverPathForType(parseProjectType(raw));
}

const MODRINTH_SITE_SEGMENT: Record<ProjectType, string> = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  shader: 'shader'
};

/** Modrinth 公式サイトのプロジェクト URL（種別を間違えると 404） */
export function modrinthProjectUrl(slug: string, projectType?: string | null): string {
  const type = parseProjectType(projectType);
  return `https://modrinth.com/${MODRINTH_SITE_SEGMENT[type]}/${slug}`;
}

export function sanitizeSearchQuery(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 200);
}

/** 検索一覧の種別タブ (PC 専用。モバイルは BottomNav の「探す」) */
export const PROJECT_TYPE_TABS: ReadonlyArray<{
  id: ProjectType;
  label: string;
  icon: string;
}> = [
  { id: 'mod', label: 'Mods', icon: 'fa-solid fa-cube' },
  { id: 'modpack', label: 'Modpacks', icon: 'fa-solid fa-boxes-stacked' },
  { id: 'resourcepack', label: 'Resource Packs', icon: 'fa-solid fa-palette' },
  { id: 'shader', label: 'Shaders', icon: 'fa-solid fa-wand-sparkles' }
];

/** 検索結果カードの表示形式 (2026-08-27: 「自動」は廃止) */
export const SEARCH_LAYOUTS = ['max', '1', '2', '3'] as const;
export type SearchLayout = (typeof SEARCH_LAYOUTS)[number];

export const SEARCH_LAYOUT_OPTIONS: ReadonlyArray<{ label: string; value: SearchLayout }> = [
  { label: '最大 (ヘッダー画像あり)', value: 'max' },
  { label: '1カラム', value: '1' },
  { label: '2カラム', value: '2' },
  { label: '3カラム', value: '3' }
];

export const SEARCH_LAYOUT_STORAGE_KEY = 'dropmod_search_layout';

export function parseSearchLayout(raw: string | null | undefined): SearchLayout {
  if (raw && (SEARCH_LAYOUTS as readonly string[]).includes(raw)) {
    return raw as SearchLayout;
  }
  return '3';
}

export function searchGridClass(layout: SearchLayout): string {
  switch (layout) {
    case 'max':
      return 'grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4';
    case '1':
      return 'grid grid-cols-1 gap-3 sm:gap-4';
    case '2':
      // 2026-08-27: sm: prefix を外した。モバイルでも 2 カラムが
      // ユーザー指定どおり反映される (Modrinth と同じ挙動)。
      return 'grid grid-cols-2 gap-2 sm:gap-4';
    case '3':
      // モバイル 3 カラムは compact カード (ModCard 側で切り替え)
      return 'grid grid-cols-3 gap-2 sm:gap-4';
    default:
      return 'grid grid-cols-3 gap-2 sm:gap-4';
  }
}
