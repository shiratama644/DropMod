/**
 * E2E ヘルパー: 最小の .mrpack (Modrinth Modpack) ファイルを Buffer で生成する。
 *
 * .mrpack は実体は ZIP で、内部に以下を含む:
 *   - modrinth.index.json (必須、パック仕様)
 *   - overrides/ (任意、config などの追加ファイル)
 *
 * DropMod の zipImport テストで、Playwright の setInputFiles に渡すため
 * のダミーとして利用する。
 */

import JSZip from 'jszip';

export interface MinimalMrpackOptions {
  /** プロファイル名 (index.json の name) */
  name?: string;
  /** Minecraft バージョン (index.json の dependencies.minecraft) */
  minecraft?: string;
  /** ローダー (fabric / forge / quilt / neoforge) */
  loader?: 'fabric-loader' | 'forge' | 'quilt-loader' | 'neoforge';
  /** ローダーバージョン */
  loaderVersion?: string;
}

/**
 * DropMod の useZipImport が受理する最小の .mrpack を生成する。
 * files[] は空 (Mod 実体は含まない)。
 */
export async function buildMinimalMrpack(
  opts: MinimalMrpackOptions = {}
): Promise<Buffer> {
  const {
    name = 'E2E Test Pack',
    minecraft = '1.21.1',
    loader = 'fabric-loader',
    loaderVersion = '0.16.9',
  } = opts;

  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1.0.0',
    name,
    summary: 'E2E test fixture',
    files: [],
    dependencies: {
      minecraft,
      [loader]: loaderVersion,
    },
  };

  const zip = new JSZip();
  zip.file('modrinth.index.json', JSON.stringify(index, null, 2));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return buf;
}
