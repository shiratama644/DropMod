/**
 * Modpack ZIP の形式判定 (Phase 12-C / PHASE12_PLAN.md §10.6)。
 *
 * ## なぜ必要か
 *
 * Modrinth と CurseForge の Modpack は**どちらも ZIP**で、拡張子だけでは区別できない
 * (Modrinth は `.mrpack` だが、実体は `.zip` をリネームしたものにすぎず、
 * ユーザーが `.zip` のまま渡してくることも普通にある)。
 *
 * 中身を見て判定する:
 * - **Modrinth**: `modrinth.index.json` がある
 * - **CurseForge**: `manifest.json` に `manifestType: "minecraftModpack"` がある
 *   (または `minecraft.modLoaders` を持つ)
 *
 * ## CurseForge は Phase 13 まで未対応
 *
 * §10.6「CurseForge Modpack (.zip) 対応: **Phase 13**」。
 * ここでは**検知して「未対応」と伝えるだけ**。中途半端に Import すると、
 * `files[]` が projectID/fileID の組で Modrinth の ID とは別体系のため、
 * 台帳に無効な projectId が混ざる。それは Update 検知も Sync も壊す。
 */

import JSZip from 'jszip';

export type ModpackFormat = 'modrinth' | 'curseforge' | 'unknown';

export interface ModpackFormatInfo {
  format: ModpackFormat;
  /** 判定の根拠になったファイル (デバッグ・表示用) */
  evidence: string;
}

/** CurseForge 形式の ZIP を Import しようとしたときに出す文言 */
export const CURSEFORGE_UNSUPPORTED_MESSAGE =
  'CurseForge 形式の Modpack は未対応です。Modrinth の .mrpack をお使いください (CurseForge 対応は Phase 13 予定)。';

/** CurseForge の manifest.json の最低限の形 */
interface CurseForgeManifest {
  manifestType?: string;
  minecraft?: {
    version?: string;
    modLoaders?: Array<{ id?: string }>;
  };
  files?: unknown[];
}

/**
 * Modpack ZIP の形式を判定する。
 *
 * **ZIP として読めない場合も `unknown` を返す** (throw しない)。
 * 呼び出し側は「Modpack ではない」として扱える。
 *
 * @param input Blob または**読み込み済みの JSZip**。
 *   呼び出し側がすでに `JSZip.loadAsync()` 済みなら、それを渡して
 *   **二度パースしない**こと (数百 MB の .minecraft ZIP では無視できない)。
 */
export async function detectModpackFormat(input: Blob | JSZip): Promise<ModpackFormatInfo> {
  let zip: JSZip;
  if (input instanceof JSZip) {
    zip = input;
  } else {
    try {
      zip = await JSZip.loadAsync(input);
    } catch {
      return { format: 'unknown', evidence: '' };
    }
  }

  // Modrinth の索引
  const indexFile = zip.file('modrinth.index.json');
  if (indexFile) {
    return { format: 'modrinth', evidence: 'modrinth.index.json' };
  }

  // CurseForge の manifest
  const manifestFile = zip.file('manifest.json');
  if (manifestFile) {
    try {
      const manifest = JSON.parse(await manifestFile.async('string')) as CurseForgeManifest;
      if (manifest.manifestType === 'minecraftModpack' || Array.isArray(manifest.minecraft?.modLoaders)) {
        return { format: 'curseforge', evidence: 'manifest.json' };
      }
    } catch {
      // manifest.json が壊れていても CurseForge と断定はしない
    }
  }

  return { format: 'unknown', evidence: '' };
}
