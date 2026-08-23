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

/** 検索結果カードの表示形式 */
export const SEARCH_LAYOUTS = ['max', '1', '2', '3', 'auto'] as const;
export type SearchLayout = (typeof SEARCH_LAYOUTS)[number];

export const SEARCH_LAYOUT_OPTIONS: ReadonlyArray<{ label: string; value: SearchLayout }> = [
  { label: '最大 (ヘッダー画像あり)', value: 'max' },
  { label: '1カラム', value: '1' },
  { label: '2カラム', value: '2' },
  { label: '3カラム', value: '3' },
  { label: '自動 (アスペクト比で再配置)', value: 'auto' }
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
      // カラム数は viewport 幅で自動、カード幅は画像アスペクト比で col-span
      return 'search-grid-auto';
    default:
      return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4';
  }
}

/**
 * 「自動」レイアウトのカード幅。
 * 横長ギャラリーは 2 カラム分、縦長・正方形は 1 カラム。
 * 画像未ロード時は説明文の長さで仮置きする。
 */
export function autoCardSpanClass(input: {
  descriptionLength: number;
  hasBanner: boolean;
  aspectRatio: number | null;
}): string {
  const { descriptionLength, hasBanner, aspectRatio } = input;
  if (aspectRatio != null) {
    return aspectRatio >= 1.55 ? 'sm:col-span-2' : '';
  }
  if (hasBanner && descriptionLength > 160) return 'sm:col-span-2';
  return '';
}

/** 「自動」レイアウトのバナー高さ。縦長ほど高く、超横長は低く。 */
export function autoBannerHeightClass(aspectRatio: number | null): string {
  if (aspectRatio == null) return 'h-24 sm:h-28';
  if (aspectRatio >= 2) return 'h-20 sm:h-24';
  if (aspectRatio >= 1.4) return 'h-24 sm:h-32';
  if (aspectRatio >= 0.9) return 'h-36 sm:h-44';
  return 'h-44 sm:h-56';
}
