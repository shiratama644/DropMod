/**
 * ローダーバージョン候補。
 * 公式メタ (Fabric / Quilt / Forge / NeoForge) から取得し、
 * 失敗時は FALLBACK_LOADER_VERSIONS を使う。
 */
export {
  FALLBACK_LOADER_VERSIONS,
  LOADER_DROPDOWN_OPTIONS,
  LOADER_IDS,
  getLoaderVersions,
  isLoaderId,
  type LoaderId
} from './versions';
