/**
 * バージョン一覧を「現在のプロファイルの環境 (MC バージョン / ローダー)」で絞り込む。
 *
 * 詳細ページ / プレビューモーダルの「対応バージョン一覧」は従来、Modrinth が返す
 * 全バージョンをそのまま表示していた。プロファイルの環境に合わないバージョンまで
 * 並ぶと選びにくいため、環境に一致するものだけを表示する。
 */

import type { ModrinthVersion } from '@/types';

export interface VersionFilterEnv {
  mcVersion?: string;
  loader?: string;
}

/**
 * プロファイル環境に一致するバージョンのみ返す。
 * - MC バージョン: `game_versions` に含まれること (必須)
 * - ローダー: `loaders` が空 (RP / Shader 等でローダー非依存) か、含まれること
 *   (プロファイルにローダーが無い場合は制限しない)
 * 空の場合は空配列 (呼び出し側で「見つかりませんでした」表示になる)。
 */
export function versionsForProfile(
  versions: readonly ModrinthVersion[],
  env: VersionFilterEnv
): ModrinthVersion[] {
  const mc = env.mcVersion?.trim();
  const loader = env.loader?.trim().toLowerCase();
  return versions.filter((v) => {
    const mcOk = !mc || (v.game_versions ?? []).includes(mc);
    if (!mcOk) return false;
    const loaders = (v.loaders ?? []).map((l) => l.toLowerCase());
    const loaderOk = !loader || loaders.length === 0 || loaders.includes(loader);
    return loaderOk;
  });
}
