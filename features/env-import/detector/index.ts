/**
 * EnvironmentDetector chain (PHASE11_PLAN.md §10.3 + 2026-08-29 レジストリ化)。
 *
 * detector の一覧・優先順位・UI ラベルは registry.ts の DETECTOR_REGISTRY が正本。
 * ランチャー追加時は index.ts / NewProfileModal.tsx を変更せず、registry.ts に
 * 1 エントリ追記するだけでよい。
 */

import type { EnvironmentSource } from '@/lib/env/source';
import { createDetectorChain } from './registry';
import { GenericDetector } from './generic';
import { MojoLauncherDetector } from './mojoLauncher';
import { OfficialLauncherDetector } from './official';
import { PrismDetector } from './prism';
import type { DetectedEnvironment, EnvironmentDetector } from './types';

/** chain の順序は DETECTOR_REGISTRY の priority 順 (公式 → Prism → MojoLauncher → Generic) */
export const detectors: readonly EnvironmentDetector[] = createDetectorChain();

/**
 * ソースを解析して環境情報を検出する。
 * どの Detector も担当を主張しない場合は unknown (GenericDetector が
 * 常に fallback するため、実質到達しない防御コード)。
 *
 * @param chain 省略時は DETECTOR_REGISTRY から構築した既定 chain。
 *   テストや特別な組み合わせで chain を差し替えたい場合に渡す。
 */
export async function detectEnvironment(
  source: EnvironmentSource,
  chain: readonly EnvironmentDetector[] = detectors
): Promise<DetectedEnvironment> {
  for (const detector of chain) {
    if (await detector.canDetect(source)) {
      return detector.detect(source);
    }
  }
  return { rootType: 'unknown', contentDirs: {} };
}

export { createDetectorChain, DETECTOR_REGISTRY, rootTypeLabel } from './registry';
export { InstanceFileDetector } from './instanceFile';
export type { ParsedLauncherEnv, InstanceFileDetectorOptions } from './instanceFile';
export { OfficialLauncherDetector, PrismDetector, MojoLauncherDetector, GenericDetector };
export type { DetectorDefinition } from './registry';
export type { DetectedEnvironment, EnvironmentDetector, RootType } from './types';
