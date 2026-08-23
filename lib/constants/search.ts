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

/** 検索一覧のパスセグメント (`/discover/mods` の mods) */
export const DISCOVER_SEGMENTS = ['mods', 'modpack', 'resourcepack', 'shader'] as const;
export type DiscoverSegment = (typeof DISCOVER_SEGMENTS)[number];

const PROJECT_TYPE_TO_SEGMENT: Record<ProjectType, DiscoverSegment> = {
  mod: 'mods',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  shader: 'shader'
};

export function discoverPathForType(type: ProjectType): string {
  return `/discover/${PROJECT_TYPE_TO_SEGMENT[type]}`;
}

/** `/discover/:segment` を ProjectType にする。未知なら null */
export function parseDiscoverSegment(raw: string | string[] | undefined | null): ProjectType | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'mods') return 'mod';
  if (value === 'modpack' || value === 'resourcepack' || value === 'shader') return value;
  return null;
}

export function sanitizeSearchQuery(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 200);
}

/** 検索結果カードの表示形式 */
export const SEARCH_LAYOUTS = ['max', '1', '2', '3', 'auto'] as const;
export type SearchLayout = (typeof SEARCH_LAYOUTS)[number];

export const SEARCH_LAYOUT_OPTIONS: ReadonlyArray<{ label: string; value: SearchLayout }> = [
  { label: '最大 (ヘッダー画像あり)', value: 'max' },
  { label: '1カラム', value: '1' },
  { label: '2カラム', value: '2' },
  { label: '3カラム', value: '3' },
  { label: '自動', value: 'auto' }
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
      return 'grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4';
    case 'auto':
      return 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 auto-rows-auto';
    default:
      return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4';
  }
}
