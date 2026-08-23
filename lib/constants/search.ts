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

export function sanitizeSearchQuery(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 200);
}
