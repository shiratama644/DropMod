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
 * NeoForge / Forge の対応は 2026-08-29 に一次情報で事実確認済み (推定ではない):
 *   - NeoForge 旧形式: 公式リリースブログ
 *     https://neoforged.net/news/21.11release/
 *     → 「NeoForge 21.11 for Minecraft 1.21.11」、初回 beta = `21.11.0-beta`。
 *       旧形式 (maj 21 系) は 3 セグメントで先頭 2 つが MC の major.minor。
 *   - NeoForge 新形式: 公式リリースブログ
 *     https://neoforged.net/news/26.1release/
 *     → 「The first three components identify the Minecraft version, the last the
 *       NeoForge release.」**公式が明言**。26.1.0.10-beta = MC 26.1.0 + NeoForge 10。
 *   - 版対応の実在確認: NeoForge 公式 Maven メタデータ
 *     https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml
 *     → `21.0.167` / `21.1.45`(21.11.45) / `26.2.0.72` 等を確認。
 *   - Forge: Minecraft Forge 公式ダウンロードページ
 *     https://files.minecraftforge.net/net/minecraftforge/forge/index_1.21.html
 *     → MC 1.21 の Latest = `1.21 - 51.0.33`。Forge Maven でも
 *       `1.21-51.0.33` / `1.21.1-52.1.16` / `1.21.11-61.2.1` を確認。
 *       versionId は `<mc>-forge-<forge>` 形式で MC が含まれるため変換不要。
 *
 * Modrinth App は mods/ 等を instance root 直下に置くことが多いが、
 * .minecraft/ 配下のケースも確認する (Prism と同様の両対応)。
 */

import type { ProfileLoader } from '@/types';
import { InstanceFileDetector } from './instanceFile';

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
 * NeoForge バージョンから MC バージョンを導出する (事実に基づく変換、推定ではない)。
 *
 * 一次情報 (2026-08-29 に公式ページ / 公式 Maven で確認):
 * - 公式リリースブログ: https://neoforged.net/news/21.11release/
 *   (「NeoForge 21.11 for Minecraft 1.21.11」= 旧形式の 21.11 → MC 1.21.11)
 * - 公式リリースブログ: https://neoforged.net/news/26.1release/
 *   (「The first three components identify the Minecraft version, the last the
 *     NeoForge release.」= 新形式の最初の 3 成分が MC)
 * - 公式 Maven: https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml
 *   (21.0.167 / 21.11.45 / 26.1.0.10-beta / 26.2.0.72 等の実在を確認)
 *
 * - 旧形式 (MC 1.20.2〜1.21.11): 3 セグメントで先頭 2 つが MC の
 *   「1.」を除いた major.minor。例: 21.11.45 → MC 1.21.11 /
 *   21.0.167 → MC 1.21 / 20.4.251 → MC 1.20.4 (1.21.11: 21.11.45 /
 *   1.21: 21.0.167 / 1.20.4: 20.4.251 は上記 Maven で実在確認)
 * - 新形式 (MC 26.1〜): 先頭 3 つが MC の major.minor.patch
 *   (.patch が 0 なら省略)。例: 26.1.0.19 → MC 26.1 /
 *   26.1.1.15 → MC 26.1.1 / 26.2.0.67 → MC 26.2 (公式の説明どおり、
 *   26.1.0.10-beta は MC 26.1.0 + NeoForge 10)
 *
 * 限界: スナップショット (例: 26.1.0.0-alpha.8+snapshot-4) は
 * 番号から MC の -pre-/-snapshot- タグを復元できないため、
 * ベース ('26.1') までしか返さない。
 */
export function mcVersionFromNeoForge(nfVersion: string): string | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(nfVersion);
  if (!match) return undefined;
  const major = match[1] ?? '';
  const minor = match[2] ?? '';
  const patch = match[3] ?? '';
  // 新形式 (MC 26.x から date ベースのバージョンに移行): 先頭 3 セグメントが MC
  if (Number(major) >= 26) {
    return patch === '0' ? `${major}.${minor}` : `${major}.${minor}.${patch}`;
  }
  // 旧形式 (MC 1.20.2〜1.21.11): 先頭 2 セグメントが MC の「1.」を除いた値
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

/**
 * Modrinth App 用 Detector (mojo_instance.json)。
 *
 * 2026-08-29: 単一インスタンス定義 JSON 方式の共通基底
 * (InstanceFileDetector) へ移行。形式固有のパースのみ parseMojoInstance を担当。
 */
export class ModrinthAppDetector extends InstanceFileDetector<MojoInstanceJson> {
  constructor() {
    super({
      name: 'ModrinthApp',
      rootType: 'modrinth-app',
      instanceFile: 'mojo_instance.json',
      parse: parseMojoInstance
    });
  }
}
