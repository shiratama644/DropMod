/**
 * ModrinthAppDetector (2026-08-29 ユーザー要望: mojo_instance.json 対応)。
 *
 * Modrinth App のインスタンス定義 `mojo_instance.json` から MC バージョンと
 * Loader を検出する。`versionId` は Modrinth ランチャーメタの ID 形式で、
 * 次の 4 形式をサポートする (ユーザー提示の実データ):
 *
 * | Loader   | versionId 形式                    | 例 |
 * |----------|-----------------------------------|-----|
 * | Fabric   | fabric-loader-<loader>-<mc>       | fabric-loader-0.19.3-1.21.11 |
 * | Quilt    | quilt-loader-<loader>-<mc>        | quilt-loader-0.24.0-26.2 |
 * | Forge    | <mc>-forge-<forge>                | 1.21-forge-51.0.33 |
 * | NeoForge | neoforge-<neoforge>               | neoforge-21.11.45 |
 *
 * NeoForge は versionId に MC バージョンを含まないため、NeoForge の
 * バージョン規約 (先頭 2 セグメント = MC の major.minor) から推定する:
 *   neoforge-21.11.45 → MC 1.21.11 / neoforge-20.4.237 → MC 1.20.4 /
 *   neoforge-21.0.167 → MC 1.21 (21.0.x の「0」パッチは 1.21 に正規化)。
 *
 * Modrinth App は mods/ 等を instance root 直下に置くことが多いが、
 * .minecraft/ 配下のケースも確認する (Prism と同様の両対応)。
 */

import type { ProfileLoader } from '@/types';
import {
  type DetectedEnvironment,
  type EnvironmentDetector,
  detectContentDirs
} from './types';

/** mojo_instance.json のユーザー提示スキーマ (その他のフィールドは無視) */
export interface MojoInstanceJson {
  argsMode?: number;
  renderer?: string;
  sharedData?: boolean;
  icon?: string;
  name?: string;
  versionId?: string;
}

export interface ParsedMojoInstance {
  mcVersion?: string;
  loader?: ProfileLoader;
  loaderVersion?: string;
}

/** versionId の loader プレフィックス → ProfileLoader */
const LOADER_PREFIXES: ReadonlyArray<{ prefix: string; loader: ProfileLoader }> = [
  { prefix: 'fabric-loader', loader: 'Fabric' },
  { prefix: 'quilt-loader', loader: 'Quilt' }
];

/**
 * NeoForge バージョン (例: '21.11.45') から MC バージョンを推定。
 * 規約: 先頭 2 セグメントが MC の major.minor (21.11 → 1.21.11)。
 * '21.0.x' のようにパッチが 0 の場合は '1.21' に正規化する。
 */
export function mcVersionFromNeoForge(nfVersion: string): string | undefined {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(nfVersion);
  if (!match) return undefined;
  const major = match[1] ?? '';
  const minor = match[2] ?? '';
  // NeoForge 20.4.x → 1.20.4 / 21.0.x → 1.21
  return minor === '0' ? `1.${major}` : `1.${major}.${minor}`;
}

/**
 * mojo_instance.json をパースして (mcVersion / loader / loaderVersion) を抽出。
 * versionId が未知形式の場合は env なし (UI の手動設定へフォールバック)。
 */
export function parseMojoInstance(json: MojoInstanceJson): ParsedMojoInstance {
  const versionId = typeof json?.versionId === 'string' ? json.versionId.trim() : '';
  if (!versionId) return {};

  // NeoForge: 'neoforge-<version>' (MC は version から推定)
  if (versionId.startsWith('neoforge-')) {
    const nfVersion = versionId.slice('neoforge-'.length);
    if (!nfVersion) return {};
    return {
      loader: 'NeoForge',
      loaderVersion: nfVersion,
      mcVersion: mcVersionFromNeoForge(nfVersion)
    };
  }

  // Forge: '<mc>-forge-<forgeVersion>'
  const forgeMarker = '-forge-';
  const forgeIdx = versionId.indexOf(forgeMarker);
  if (forgeIdx > 0) {
    return {
      loader: 'Forge',
      mcVersion: versionId.slice(0, forgeIdx),
      loaderVersion: versionId.slice(forgeIdx + forgeMarker.length)
    };
  }

  // Fabric / Quilt: '<prefix>-<loaderVersion>-<mc>'
  for (const { prefix, loader } of LOADER_PREFIXES) {
    if (versionId.startsWith(`${prefix}-`)) {
      const rest = versionId.slice(prefix.length + 1);
      const sep = rest.indexOf('-');
      if (sep <= 0 || sep === rest.length - 1) return {};
      return {
        loader,
        loaderVersion: rest.slice(0, sep),
        mcVersion: rest.slice(sep + 1)
      };
    }
  }

  return {};
}

export class ModrinthAppDetector implements EnvironmentDetector {
  readonly name = 'ModrinthApp';

  async canDetect(source: Parameters<EnvironmentDetector['canDetect']>[0]): Promise<boolean> {
    return source.exists('mojo_instance.json');
  }

  async detect(source: Parameters<EnvironmentDetector['detect']>[0]): Promise<DetectedEnvironment> {
    let parsed: ParsedMojoInstance = {};
    try {
      const raw = await source.readFile('mojo_instance.json');
      parsed = parseMojoInstance(JSON.parse(new TextDecoder().decode(raw)) as MojoInstanceJson);
    } catch {
      // mojo_instance.json の読み取り・パース失敗は「検出失敗」扱い (env なし)
    }

    return {
      rootType: 'modrinth-app',
      mcVersion: parsed.mcVersion,
      loader: parsed.loader,
      loaderVersion: parsed.loaderVersion,
      // Modrinth App は instance root 直下か .minecraft/ 配下かに分かれるため両方確認
      contentDirs: await detectContentDirs(source, ['', '.minecraft'])
    };
  }
}
