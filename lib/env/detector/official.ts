/**
 * OfficialLauncherDetector (PHASE11_PLAN.md §10.3)。
 *
 * 公式 Minecraft Launcher の `.minecraft/versions/<id>/<id>.json` から
 * MC バージョンと Loader を検出する。
 *
 * 判定ロジック (計画書 §4.4.1 の表どおり):
 *   | Loader   | mainClass 先頭                        | loaderVersion の抽出元 |
 *   | Fabric   | net.fabricmc.loader                   | net.fabricmc:fabric-loader:X |
 *   | Quilt    | org.quiltmc.loader                    | org.quiltmc:quilt-loader:X |
 *   | Forge    | cpw.mods.bootstraplauncher + forge 座標 | net.minecraftforge:forge:X |
 *   | NeoForge | cpw.mods.bootstraplauncher + neoforge 座標 | net.neoforged:neoforge:X |
 *   | Vanilla  | net.minecraft                         | (なし) |
 *
 * MC Version 抽出: inheritsFrom が最優先。無ければ id の最後の
 * バージョン様トークン (例: 'fabric-loader-0.16.0-1.21.1' → '1.21.1')。
 *
 * versions/ に複数バージョンがある場合の選択ヒューリスティック:
 *   Loader 付き (Vanilla 以外) を優先し、その中で名前順で最初のもの。
 *   すべて Vanilla なら最初のパース成功版。ユーザーは UI で上書き可能。
 */

import type { ProfileLoader } from '@/types';
import { isNotFoundError } from '../source';
import {
  type DetectedEnvironment,
  type EnvironmentDetector,
  detectContentDirs
} from './types';

interface VersionManifestJson {
  id?: string;
  inheritsFrom?: string;
  mainClass?: string;
  libraries?: Array<{ name?: string }>;
}

export interface ParsedVersionManifest {
  mcVersion?: string;
  loader?: ProfileLoader;
  loaderVersion?: string;
}

/** パートがバージョン様 (1.21 / 1.21.1 等) か */
function isVersionLike(part: string): boolean {
  return /^\d+\.\d+(?:\.\d+)?[a-z]?\d*$/i.test(part);
}

/**
 * バージョン id から MC バージョンを推測。
 * 'fabric-loader-0.16.0-1.21.1' → '1.21.1' (最後のバージョン様パート)、
 * '1.21.1' → '1.21.1'。見つからなければ undefined。
 * ※ inheritsFrom がある場合はそちらが最優先 (呼び出し側で処理)。
 */
export function extractMcVersionFromId(id: string): string | undefined {
  const parts = id.split('-');
  const versionLike = parts.filter((part) => isVersionLike(part));
  return versionLike.length > 0 ? versionLike[versionLike.length - 1] : undefined;
}

function findLibraryVersion(
  manifest: VersionManifestJson,
  prefix: string
): string | undefined {
  for (const lib of manifest.libraries ?? []) {
    const name = lib?.name;
    if (typeof name === 'string' && name.startsWith(prefix)) {
      // 'net.fabricmc:fabric-loader:0.16.0' → '0.16.0'
      const parts = name.split(':');
      const version = parts[parts.length - 1]?.trim();
      if (version) return version;
    }
  }
  return undefined;
}

/** 1 個の versions/<id>/<id>.json をパース */
export function parseVersionManifest(
  manifest: VersionManifestJson
): ParsedVersionManifest {
  const mainClass = typeof manifest.mainClass === 'string' ? manifest.mainClass : '';
  const result: ParsedVersionManifest = {
    mcVersion:
      typeof manifest.inheritsFrom === 'string' && manifest.inheritsFrom
        ? manifest.inheritsFrom
        : typeof manifest.id === 'string'
          ? extractMcVersionFromId(manifest.id)
          : undefined
  };

  if (mainClass.startsWith('net.fabricmc.loader')) {
    result.loader = 'Fabric';
    result.loaderVersion = findLibraryVersion(manifest, 'net.fabricmc:fabric-loader');
    return result;
  }
  if (mainClass.startsWith('org.quiltmc.loader')) {
    result.loader = 'Quilt';
    result.loaderVersion = findLibraryVersion(manifest, 'org.quiltmc:quilt-loader');
    return result;
  }
  if (mainClass.startsWith('cpw.mods.bootstraplauncher')) {
    // Forge / NeoForge は mainClass が共通。library 座標で区別する。
    const forge = findLibraryVersion(manifest, 'net.minecraftforge:forge');
    if (forge !== undefined) {
      result.loader = 'Forge';
      // '1.20.1-47.2.0' 形式から MC バージョン部分を除いた loader 版を抽出
      const mc = result.mcVersion;
      result.loaderVersion =
        mc && forge.startsWith(`${mc}-`) ? forge.slice(mc.length + 1) : forge;
      return result;
    }
    const neoforge = findLibraryVersion(manifest, 'net.neoforged:neoforge');
    if (neoforge !== undefined) {
      result.loader = 'NeoForge';
      result.loaderVersion = neoforge;
      return result;
    }
    return result;
  }
  if (mainClass.startsWith('net.minecraft')) {
    result.loader = 'Vanilla';
    return result;
  }
  return result;
}

export class OfficialLauncherDetector implements EnvironmentDetector {
  readonly name = 'OfficialLauncher';

  async canDetect(source: Parameters<EnvironmentDetector['canDetect']>[0]): Promise<boolean> {
    if (!(await source.exists('versions'))) return false;
    const dirs = await source.listDirectories('versions');
    return dirs.length > 0;
  }

  async detect(source: Parameters<EnvironmentDetector['detect']>[0]): Promise<DetectedEnvironment> {
    const versionDirs = (await source.listDirectories('versions')).sort();

    let firstParsed: ParsedVersionManifest | undefined;
    let chosen: ParsedVersionManifest | undefined;
    for (const dir of versionDirs) {
      const manifestPath = `versions/${dir}/${dir}.json`;
      let manifest: VersionManifestJson;
      try {
        const raw = await source.readFile(manifestPath);
        manifest = JSON.parse(new TextDecoder().decode(raw)) as VersionManifestJson;
      } catch (e) {
        if (isNotFoundError(e)) continue; // JSON 無いバージョンはスキップ
        continue; // JSON 破損もスキップ (検出不能として扱う)
      }
      const parsed = parseVersionManifest(manifest);
      if (!firstParsed) firstParsed = parsed;
      // Loader 付き (Vanilla 以外) を最初に見つけた時点で採用
      if (parsed.loader && parsed.loader !== 'Vanilla') {
        chosen = parsed;
        break;
      }
    }
    const selected = chosen ?? firstParsed;

    return {
      rootType: 'official',
      mcVersion: selected?.mcVersion,
      loader: selected?.loader,
      loaderVersion: selected?.loaderVersion,
      contentDirs: await detectContentDirs(source, [''])
    };
  }
}
