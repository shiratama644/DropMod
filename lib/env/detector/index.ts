/**
 * EnvironmentDetector の chain (PHASE11_PLAN.md §4.2 + Phase 11-B)。
 *
 * 優先順位: OfficialLauncher → Prism → Generic (最終 fallback)。
 * 上位 Detector が担当形式を判定できなければ次へ fallthrough する。
 */

import type { EnvironmentSource } from '../source';
import { OfficialLauncherDetector } from './official';
import { PrismDetector } from './prism';
import { GenericDetector } from './generic';
import type { DetectedEnvironment, EnvironmentDetector } from './types';

/** chain の順序は計画書 §4.2 のとおり (Phase 13 で ModrinthApp 等を追加予定) */
export const detectors: readonly EnvironmentDetector[] = [
  new OfficialLauncherDetector(),
  new PrismDetector(),
  new GenericDetector()
];

/**
 * ソースを解析して環境情報を検出する。
 * どの Detector も担当を主張しない場合は unknown (GenericDetector が
 * 常に fallback するため、実質到達しない防御コード)。
 */
export async function detectEnvironment(
  source: EnvironmentSource
): Promise<DetectedEnvironment> {
  for (const detector of detectors) {
    if (await detector.canDetect(source)) {
      return detector.detect(source);
    }
  }
  return { rootType: 'unknown', contentDirs: {} };
}

export { OfficialLauncherDetector, PrismDetector, GenericDetector };
export type { DetectedEnvironment, EnvironmentDetector } from './types';
