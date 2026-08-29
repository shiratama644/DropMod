/**
 * PrismDetector (PHASE11_PLAN.md §10.3)。
 *
 * Prism Launcher / MultiMC / PolyMC のインスタンス定義 `mmc-pack.json` から
 * MC バージョンと Loader を検出する。
 *
 * 判定ロジック (components[].uid の prefix マッチ、計画書 §4.4.2 の表どおり):
 *   net.minecraft            → MC Version
 *   net.fabricmc.fabric-loader → Fabric
 *   org.quiltmc.quilt-loader  → Quilt
 *   net.minecraftforge        → Forge
 *   net.neoforged             → NeoForge
 *
 * 注意: Prism/MultiMC は .minecraft サブフォルダを持たない場合が多く、
 * mods/ は instance root 直下 or .minecraft/mods/ の両方を確認する。
 */

import type { ProfileLoader } from '@/types';
import { InstanceFileDetector } from './instanceFile';

interface MmcPackJson {
  formatVersion?: number;
  components?: Array<{
    uid?: string;
    version?: string;
  }>;
}

export interface ParsedMmcPack {
  mcVersion?: string;
  loader?: ProfileLoader;
  loaderVersion?: string;
}

/** uid prefix → loader の対応表 (計画書 §4.4.2) */
const UID_TO_LOADER: ReadonlyArray<{
  prefix: string;
  loader: ProfileLoader;
}> = [
  { prefix: 'net.fabricmc.fabric-loader', loader: 'Fabric' },
  { prefix: 'org.quiltmc.quilt-loader', loader: 'Quilt' },
  { prefix: 'net.minecraftforge', loader: 'Forge' },
  { prefix: 'net.neoforged', loader: 'NeoForge' }
];

export function parseMmcPack(pack: MmcPackJson): ParsedMmcPack {
  const result: ParsedMmcPack = {};
  for (const component of pack.components ?? []) {
    const uid = typeof component?.uid === 'string' ? component.uid : '';
    const version =
      typeof component?.version === 'string' && component.version ? component.version : undefined;
    if (uid === 'net.minecraft') {
      result.mcVersion = version;
      continue;
    }
    if (result.loader === undefined || result.loaderVersion === undefined) {
      const match = UID_TO_LOADER.find((entry) => uid.startsWith(entry.prefix));
      if (match) {
        result.loader = match.loader;
        result.loaderVersion = version;
      }
    }
  }
  return result;
}

/**
 * Prism / MultiMC / PolyMC 用 Detector (mmc-pack.json)。
 *
 * 2026-08-29: 単一インスタンス定義 JSON 方式の共通基底
 * (InstanceFileDetector) へ移行。canDetect / detect / contentDirs の
 * 共通処理は基底クラス、形式固有のパースのみ parseMmcPack を担当する。
 */
export class PrismDetector extends InstanceFileDetector<MmcPackJson> {
  constructor() {
    super({
      name: 'Prism',
      rootType: 'prism',
      instanceFile: 'mmc-pack.json',
      parse: parseMmcPack
    });
  }
}
