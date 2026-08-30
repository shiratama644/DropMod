export const LOADER_IDS = ['Fabric', 'Forge', 'NeoForge', 'Quilt'] as const;
export type LoaderId = (typeof LOADER_IDS)[number];

/** 公式メタが取れない時の最低限。先頭が最新。 */
export const FALLBACK_LOADER_VERSIONS: Record<LoaderId, readonly string[]> = {
  Fabric: [
    '0.19.3',
    '0.19.2',
    '0.19.1',
    '0.19.0',
    '0.18.4',
    '0.18.3',
    '0.18.2',
    '0.17.3',
    '0.16.14',
    '0.16.10',
    '0.16.9',
    '0.16.5',
    '0.15.11',
    '0.14.25'
  ],
  Quilt: ['0.29.1', '0.28.1', '0.27.1', '0.26.4', '0.26.3'],
  Forge: ['55.0.3', '51.0.33', '49.2.0', '47.4.0', '43.4.4'],
  NeoForge: ['21.4.47', '21.1.133', '21.0.167', '20.6.119', '20.4.237']
};

export const LOADER_DROPDOWN_OPTIONS = LOADER_IDS.map((id) => ({
  label: id,
  value: id
}));
