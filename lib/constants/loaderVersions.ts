/**
 * ローダーバージョン候補。
 * ブラウザから Fabric/Forge メタへ直 fetch すると CSP connect-src に引っかかるため
 * よく使う安定版を静的に持つ (Phase 11 の自動検出とは別)。
 */

export const LOADER_IDS = ['Fabric', 'Forge', 'NeoForge', 'Quilt'] as const;
export type LoaderId = (typeof LOADER_IDS)[number];

const FABRIC = [
  '0.16.14',
  '0.16.10',
  '0.16.9',
  '0.16.5',
  '0.15.11',
  '0.14.25'
];

const QUILT = ['0.29.1', '0.28.1', '0.27.1', '0.26.4'];

const FORGE = ['55.0.3', '51.0.33', '49.2.0', '47.4.0', '43.4.4'];

const NEOFORGE = ['21.4.47', '21.1.133', '20.6.119', '20.4.237'];

const BY_LOADER: Record<LoaderId, readonly string[]> = {
  Fabric: FABRIC,
  Quilt: QUILT,
  Forge: FORGE,
  NeoForge: NEOFORGE
};

export function isLoaderId(value: string): value is LoaderId {
  return (LOADER_IDS as readonly string[]).includes(value);
}

export function getLoaderVersions(loader: string): string[] {
  if (!isLoaderId(loader)) return [];
  return [...BY_LOADER[loader]];
}

export const LOADER_DROPDOWN_OPTIONS = LOADER_IDS.map((id) => ({
  label: id,
  value: id
}));
