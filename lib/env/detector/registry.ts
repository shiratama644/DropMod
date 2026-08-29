/**
 * EnvironmentDetector の登録レジストリ (2026-08-29 ユーザー要望: 他ランチャー追加の容易化)。
 *
 * ランチャー追加時に変更が必要なのは、原則 **このファイルへの 1 エントリ追記のみ**。
 * chain 優先順位・UI ラベル・Detector 一覧のすべてをここから導出する
 * (index.ts / NewProfileModal.tsx の変更は不要)。
 *
 * ## 新規ランチャー追加手順
 * 1. lib/env/detector/ に Detector を実装する。
 *    - 単一インスタンス定義 JSON 方式 (Prism / MojoLauncher と同型):
 *      `InstanceFileDetector` を継承し、定義ファイル名 + パーサを渡す。
 *    - それ以外 (公式ランチャーの versions/*.json 等): `EnvironmentDetector` を直接実装。
 * 2. このファイルの `DETECTOR_REGISTRY` に 1 エントリ追記する:
 *    - `rootType`: 検出結果の識別子 (必ず new な文字列にする)
 *    - `label`: NewProfileModal に表示されるランチャー名
 *    - `priority`: chain 優先順位 (小さいほど先に判定。Generic は必ず最大値)
 *    - `create`: Detector 生成 (状態を持たないため new でよい)
 * 3. types.ts の RootType 補完リストにも同じ文字列を追記する (型補完用)。
 * 4. __tests__/lib/env/detector.test.ts に解析 + canDetect/detect のテストを追加する。
 */

import type { DetectedEnvironment, EnvironmentDetector } from './types';
import { GenericDetector } from './generic';
import { MojoLauncherDetector } from './mojoLauncher';
import { OfficialLauncherDetector } from './official';
import { PrismDetector } from './prism';

/** 登録 1 エントリ分の定義 (rootType / label / priority / create) */
export interface DetectorDefinition {
  /** DetectedEnvironment.rootType と一致する一意キー */
  readonly rootType: DetectedEnvironment['rootType'];
  /** NewProfileModal 等に表示するランチャー名 */
  readonly label: string;
  /** 判定優先順位 (小さいほど先。Generic は最大値で最終 fallback) */
  readonly priority: number;
  /** Detector 生成 */
  readonly create: () => EnvironmentDetector;
}

/**
 * 組み込みランチャーの登録表。
 *
 * 注意: `multimc` rootType は PrismDetector (Prism/MultiMC/PolyMC 共通形式) が
 * 'prism' として検出するため、ここには登録しない (旧 ROOT_TYPE_LABELS の
 * 後方互換ラベルのみ新ProfileModal側で補完... 2026-08-29: ラベルも本表から
 * 導出するため、未登録 rootType は rootType そのままを表示する)。
 */
export const DETECTOR_REGISTRY: readonly DetectorDefinition[] = [
  {
    rootType: 'official',
    label: '公式ランチャー (.minecraft)',
    priority: 10,
    create: () => new OfficialLauncherDetector()
  },
  {
    rootType: 'prism',
    label: 'Prism / MultiMC インスタンス',
    priority: 20,
    create: () => new PrismDetector()
  },
  {
    rootType: 'mojo-launcher',
    label: 'MojoLauncher インスタンス',
    priority: 30,
    create: () => new MojoLauncherDetector()
  },
  {
    rootType: 'generic',
    label: '汎用構造 (mods/ 等)',
    priority: 1000,
    create: () => new GenericDetector()
  }
];

/**
 * Detector を持たない rootType の後方互換ラベル (旧 ROOT_TYPE_LABELS 由来)。
 * - multimc: PrismDetector が 'prism' として検出するため専用 Detector は無い
 * - unknown: どの Detector も担当しない場合の防御値
 */
const LEGACY_ROOT_TYPE_LABELS: Readonly<Record<string, string>> = {
  multimc: 'MultiMC インスタンス',
  // 2026-08-29: Modrinth App → MojoLauncher に名称修正した際の後方互換ラベル
  'modrinth-app': 'Modrinth App インスタンス',
  unknown: '不明'
};

/** registry から priority 順の Detector chain を構築する */
export function createDetectorChain(): EnvironmentDetector[] {
  return [...DETECTOR_REGISTRY]
    .sort((a, b) => a.priority - b.priority)
    .map((entry) => entry.create());
}

/** rootType → UI 表示ラベル (未登録なら rootType をそのまま返す) */
export function rootTypeLabel(rootType: string): string {
  return (
    DETECTOR_REGISTRY.find((entry) => entry.rootType === rootType)?.label ??
    LEGACY_ROOT_TYPE_LABELS[rootType] ??
    rootType
  );
}
