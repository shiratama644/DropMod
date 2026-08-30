/**
 * GenericDetector (PHASE11_PLAN.md §10.3)。
 *
 * mods/ 等のコンテンツディレクトリが直接あるだけの構造向け fallback。
 * 環境情報 (MC Version / Loader) は検出できないため undefined を返し、
 * UI 側で手動選択 (§4.4.3) にフォールバックする。
 */

import {
  type DetectedEnvironment,
  type EnvironmentDetector,
  detectContentDirs
} from './types';

export class GenericDetector implements EnvironmentDetector {
  readonly name = 'Generic';

  /** 最終 fallback: 常に担当を主張する */
  async canDetect(): Promise<boolean> {
    return true;
  }

  async detect(
    source: Parameters<EnvironmentDetector['detect']>[0]
  ): Promise<DetectedEnvironment> {
    return {
      rootType: 'generic',
      mcVersion: undefined,
      loader: undefined,
      loaderVersion: undefined,
      contentDirs: await detectContentDirs(source, ['', '.minecraft'])
    };
  }
}
