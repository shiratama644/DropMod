/**
 * MojoLauncherDetector (2026-08-29 ユーザー要望: mojo_instance.json 対応)。
 *
 * MojoLauncher (https://github.com/MojoLauncher/MojoLauncher) は
 * PojavLauncher ベースの Android 向け Minecraft: Java Edition ランチャー。
 * Modrinth App ではなく MojoLauncher のインスタンス定義
 * `mojo_instance.json` から MC バージョンと Loader を検出する。
 *
 * ## 一次情報 (2026-08-29 に公式リポジトリ v3_openjdk をクローンして直接確認)
 * - インスタンス定義ファイル名: `mojo_instance.json`
 *   `app_pojavlauncher/src/main/java/net/kdt/pojavlaunch/instances/Instances.java:43`
 *   `new File(instanceDir, "mojo_instance.json")` (metadataLocation)
 * - versionId の形式 (MojoLauncher が生成する全 5 形式):
 *   `app_pojavlauncher/src/main/java/net/kdt/pojavlaunch/modloaders/modpacks/api/ModLoader.java`
 *   `getVersionId()` の switch を直接確認:
 *
 * | Loader      | versionId 形式                        | 例                              |
 * |-------------|---------------------------------------|---------------------------------|
 * | Fabric      | fabric-loader-<loader>-<mc>           | fabric-loader-0.19.3-1.21.11    |
 * | Quilt       | quilt-loader-<loader>-<mc>            | quilt-loader-0.24.0-26.2        |
 * | Forge       | <mc>-forge-<forge>                    | 1.21-forge-51.0.33              |
 * | NeoForge    | neoforge-<neoforge>                   | neoforge-21.11.45               |
 * | Legacy Fab. | legacy-fabric-loader-<loader>-<mc>    | legacy-fabric-loader-0.6.3-1.21 |
 *
 * - NeoForge / Forge のバージョン対応は別途一次情報で確認済み (下記
 *   `neoForgeVersionToMc` のコメント参照)。
 *
 * MojoLauncher は mods/ 等を instance root 直下に置くことが多いが、
 * .minecraft/ 配下のケースも確認する (Prism と同様の両対応)。
 */

import type { ProfileLoader } from '@/types';
import { InstanceFileDetector } from './instanceFile';

/** mojo_instance.json のスキーマ (その他のフィールドは無視) */
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

/**
 * versionId 1 形式分の宣言 (追加ローダーはこの配列に 1 エントリ追記)。
 *
 * MojoLauncher 公式 `ModLoader.java#getVersionId()` の switch と 1:1 対応。
 * 形式が増えた場合も `parseVersionId` 本体・呼び出し側の変更は不要。
 */
interface VersionIdFormat {
  /** この形式で検出する loader (Legacy Fabric は 'Fabric' として扱う) */
  readonly loader: ProfileLoader;
  /** versionId 全体にマッチする正規表現 (名前付きキャプチャ必須) */
  readonly pattern: RegExp;
  /**
   * キャプチャから (mcVersion / loaderVersion) を生成。
   * tsconfig の noUncheckedIndexedAccess により値は string | undefined になる。
   */
  readonly extract: (
    capture: Readonly<Record<string, string | undefined>>
  ) => Pick<ParsedMojoInstance, 'mcVersion' | 'loaderVersion'>;
}

/** MojoLauncher が生成する versionId の形式定義表 */
const VERSION_ID_FORMATS: readonly VersionIdFormat[] = [
  // NeoForge: 'neoforge-<neoforge>' (MC は neoforge から導出)
  {
    loader: 'NeoForge',
    pattern: /^neoforge-(?<neoforge>.+)$/,
    extract: ({ neoforge }) => ({
      loaderVersion: neoforge,
      mcVersion: neoForgeVersionToMc(neoforge ?? '')
    })
  },
  // Forge: '<mc>-forge-<forge>'
  {
    loader: 'Forge',
    pattern: /^(?<mcVersion>.+?)-forge-(?<loaderVersion>.+)$/,
    extract: ({ mcVersion, loaderVersion }) => ({ mcVersion, loaderVersion })
  },
  // Fabric: 'fabric-loader-<loader>-<mc>'
  {
    loader: 'Fabric',
    pattern: /^fabric-loader-(?<loaderVersion>.+?)-(?<mcVersion>.+)$/,
    extract: ({ loaderVersion, mcVersion }) => ({ loaderVersion, mcVersion })
  },
  // Quilt: 'quilt-loader-<loader>-<mc>'
  {
    loader: 'Quilt',
    pattern: /^quilt-loader-(?<loaderVersion>.+?)-(?<mcVersion>.+)$/,
    extract: ({ loaderVersion, mcVersion }) => ({ loaderVersion, mcVersion })
  },
  // Legacy Fabric: 'legacy-fabric-loader-<loader>-<mc>'
  // (MojoLauncher は loader として Fabric 互換のため 'Fabric' として扱う)
  {
    loader: 'Fabric',
    pattern: /^legacy-fabric-loader-(?<loaderVersion>.+?)-(?<mcVersion>.+)$/,
    extract: ({ loaderVersion, mcVersion }) => ({ loaderVersion, mcVersion })
  }
];

/**
 * NeoForge バージョンから MC バージョンを導出する内部ヘルパー。
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
 *   21.0.167 → MC 1.21 / 20.4.251 → MC 1.20.4
 * - 新形式 (MC 26.1〜): 先頭 3 つが MC の major.minor.patch
 *   (.patch が 0 なら省略)。例: 26.1.0.19 → MC 26.1 /
 *   26.1.1.15 → MC 26.1.1 / 26.2.0.67 → MC 26.2
 *
 * 限界: スナップショット (例: 26.1.0.0-alpha.8+snapshot-4) は
 * 番号から MC の -pre-/-snapshot- タグを復元できないため、
 * ベース ('26.1') までしか返さない。
 */
function neoForgeVersionToMc(neoForgeVersion: string): string | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(neoForgeVersion);
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
 * versionId から (loader / loaderVersion / mcVersion) を生成する単一関数。
 *
 * NeoForge / Forge / Quilt / Fabric / Legacy Fabric の全形式を
 * VERSION_ID_FORMATS の宣言表をもとに処理する (2026-08-29 ユーザー要望:
 * ローダー別の個別関数を廃止し、拡張性のある単一入口にする)。
 * 未知形式は {} (UI の手動設定へフォールバック)。
 */
function parseVersionId(versionId: string): ParsedMojoInstance {
  for (const format of VERSION_ID_FORMATS) {
    const match = format.pattern.exec(versionId);
    if (!match?.groups) continue;
    return { loader: format.loader, ...format.extract(match.groups) };
  }
  return {};
}

/**
 * mojo_instance.json をパースして (mcVersion / loader / loaderVersion) を抽出。
 * versionId が未知形式の場合は env なし (UI の手動設定へフォールバック)。
 */
export function parseMojoInstance(json: MojoInstanceJson): ParsedMojoInstance {
  const versionId = typeof json?.versionId === 'string' ? json.versionId.trim() : '';
  if (!versionId) return {};
  return parseVersionId(versionId);
}

/**
 * MojoLauncher 用 Detector (mojo_instance.json)。
 *
 * 2026-08-29: 単一インスタンス定義 JSON 方式の共通基底
 * (InstanceFileDetector) へ移行。形式固有のパースのみ parseMojoInstance を担当。
 */
export class MojoLauncherDetector extends InstanceFileDetector<MojoInstanceJson> {
  constructor() {
    super({
      name: 'MojoLauncher',
      rootType: 'mojo-launcher',
      instanceFile: 'mojo_instance.json',
      parse: parseMojoInstance
    });
  }
}
