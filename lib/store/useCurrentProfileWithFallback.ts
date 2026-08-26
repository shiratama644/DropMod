'use client';

/**
 * useCurrentProfileWithFallback (B33 修正、Phase 9 追記)
 *
 * `useProfilesStore` から currentProfile を取得する共通 hook。
 * profiles / currentProfileId のどちらも見つからない (hydration 直後の
 * transient window) 場合、module-level 定数の EMPTY_PROFILE を返す。
 *
 * 修正前は HomeInteractive / ModsPageClient / ModDetailModalShell の 3 コンポーネントで
 * 同じ pattern を **インラインで重複記述** しており、fallback リテラルが render 毎に
 * 新規オブジェクト生成されていた (React.memo 化した際に破綻するリスク)。
 *
 * この hook で 3 箇所を統一し、EMPTY_PROFILE を Object.freeze で参照安定化する。
 */

import { useMemo } from 'react';
import { useProfilesStore, selectCurrentProfile } from './profiles';
import type { Profile } from '@/types';

/** hydration 中に一時的に返される空プロファイル (参照安定な module-level 定数) */
const EMPTY_PROFILE: Profile = Object.freeze({
  id: 'empty',
  name: '(未初期化)',
  environment: {
    mcVersion: '1.20.1',
    loader: 'Fabric'
  },
  description: '',
  mods: []
}) as Profile;

/**
 * 現在プロファイルを返す。以下の優先順位で解決:
 *   1. selectCurrentProfile (id が currentProfileId に一致する profile)
 *   2. profiles[0] (先頭)
 *   3. EMPTY_PROFILE (両方無い場合の transient fallback)
 *
 * 戻り値の参照は「profiles / currentProfileId が同一の限り安定」(useMemo)。
 */
export function useCurrentProfileWithFallback(): Profile {
  const profileFromSelector = useProfilesStore(selectCurrentProfile);
  const firstProfile = useProfilesStore((s) => s.profiles[0]);
  return useMemo(
    () => profileFromSelector ?? firstProfile ?? EMPTY_PROFILE,
    [profileFromSelector, firstProfile]
  );
}

/** テスト用 export (EMPTY_PROFILE 参照確認) */
export const _EMPTY_PROFILE_FOR_TEST = EMPTY_PROFILE;
