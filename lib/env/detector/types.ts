/**
 * EnvironmentDetector の型定義 (PHASE11_PLAN.md §10.3, ChatGPT #14)。
 *
 * 複数ランチャー構造への対応を Strategy パターンで抽象化する。
 * Phase 11 で実装する Detector:
 *   1. OfficialLauncherDetector — 公式 Minecraft Launcher (versions/*.json)
 *   2. PrismDetector            — Prism / MultiMC / PolyMC (mmc-pack.json)
 *   3. GenericDetector          — mods/ 等が直接あるだけの fallback
 * Phase 12/13 で ModrinthApp / GDLauncher / ATLauncher を追加予定。
 *
 * 2026-08-29: ランチャー追加の容易化のため、検出器の登録・優先順位・
 * UI ラベルは registry.ts の DETECTOR_REGISTRY へ集約した。
 * rootType の一覧 (型補完用) は本ファイル、追加手順は registry.ts 参照。
 */

import type { ProfileLoader } from '@/types';
import type { EnvironmentSource } from '../source';

/**
 * 検出結果のランチャー種別 (registry.ts の登録キーと対応)。
 *
 * 既知値は型補完用に列挙しつつ、`string & {}` で開いた union にすることで、
 * **[レジストリへの 1 エントリ追記だけで新規ランチャーを追加できる]** ようにする
 * (types.ts の変更は不要。2026-08-29 ユーザー要望: 他ランチャー追加の容易化)。
 */
export type RootType =
  | 'official'
  | 'prism'
  | 'multimc'
  | 'modrinth-app'
  | 'generic'
  | 'unknown'
  | (string & {});

export interface DetectedEnvironment {
  rootType: RootType;
  /** 検出できなければ undefined (UI 側で手動選択にフォールバック §4.4.3) */
  mcVersion?: string;
  loader?: ProfileLoader;
  loaderVersion?: string;
  /** 検出したコンテンツディレクトリの相対パス (例: 'mods' or '.minecraft/mods') */
  contentDirs: {
    mods?: string;
    resourcepacks?: string;
    shaderpacks?: string;
  };
}

export interface EnvironmentDetector {
  /** Detector の名前 (ログ・テスト用) */
  readonly name: string;
  /** このソースが自分の担当形式か判定 (軽量チェック) */
  canDetect(source: EnvironmentSource): Promise<boolean>;
  /** 実際に解析して DetectedEnvironment を返す */
  detect(source: EnvironmentSource): Promise<DetectedEnvironment>;
}

/** contentDirs を実際の存在チェックで構築する共通ヘルパー */
export async function detectContentDirs(
  source: EnvironmentSource,
  candidates: readonly string[] = ['', '.minecraft']
): Promise<DetectedEnvironment['contentDirs']> {
  const result: DetectedEnvironment['contentDirs'] = {};
  const names: Array<[keyof DetectedEnvironment['contentDirs'], string]> = [
    ['mods', 'mods'],
    ['resourcepacks', 'resourcepacks'],
    ['shaderpacks', 'shaderpacks']
  ];
  for (const [key, dirName] of names) {
    for (const base of candidates) {
      const path = base ? `${base}/${dirName}` : dirName;
      if (await source.exists(path)) {
        result[key] = path;
        break;
      }
    }
  }
  return result;
}
