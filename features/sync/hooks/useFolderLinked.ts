'use client';

/**
 * 「現在のプロファイルにフォルダが紐付いているか」を返すフック (Phase 12-B / **D-8**)。
 *
 * D-8 は「元々ある ZIP ダウンロードボタンを、**フォルダ設定済みプロファイルのときだけ**
 * Sync ボタンに置き換える」ことを決めている。置き換えの判定をこの 1 箇所に集約する。
 *
 * ## プロファイルごとに独立
 *
 * フォルダを紐付けたプロファイルでは Sync、紐付けていないプロファイルに
 * 切り替えたら ZIP保存 に戻る。判定は常に `currentProfileId` のプロファイルを
 * 見直すので、切り替えに自動で追従する。
 *
 * **戻り値は boolean** (プリミティブ) にしてある。オブジェクトを返すと
 * Zustand v5 の `useSyncExternalStore` が参照変化を毎回検知して無限ループになる。
 */

import { useProfilesStore } from '@/lib/store/profiles';

export function useFolderLinked(): boolean {
  return useProfilesStore((s) => {
    const profile = s.profiles.find((p) => p.id === s.currentProfileId);
    return Boolean(profile?.linkedSource);
  });
}
