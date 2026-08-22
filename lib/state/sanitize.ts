/**
 * 破損 LocalStorage / Dexie データへの防御関数。
 *
 * - profiles が配列でない / 空配列 の場合は undefined を返す (呼び出し側でデフォルト値)
 * - 各 profile が必要フィールドを欠く場合は補完
 * - currentProfileId が存在しないプロファイルを指す場合は先頭に戻す
 *
 * 完全な pure function (state / props / IndexedDB / LocalStorage を触らない) なので
 * ユニットテストしやすく、SSR / 移行スクリプト / hydration の 3 経路すべてで再利用可能。
 *
 * この関数を lib/state/sanitize.ts に置く理由 (Sub-Phase 8-A):
 *   - useProfiles.ts に元々あったが、lib/db/migrate.ts から import すると
 *     循環参照 (useProfiles ↔ migrate) になるため、共通ヘルパとして独立モジュール化。
 */

import type { Profile, ModItem, ThemeMode } from '@/types';

export interface SanitizedState {
  theme?: ThemeMode;
  currentProfileId?: string;
  profiles?: Profile[];
}

export function sanitizeLoadedState(raw: unknown): SanitizedState | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as {
    profiles?: unknown;
    theme?: unknown;
    currentProfileId?: unknown;
  };

  let normalizedProfiles: Profile[] | undefined;
  if (Array.isArray(src.profiles)) {
    normalizedProfiles = (src.profiles as unknown[])
      .filter(
        (p): p is Record<string, unknown> =>
          !!p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string'
      )
      .map((p) => ({
        id: String(p.id),
        name: typeof p.name === 'string' ? p.name : '(名称未設定)',
        mcVersion: typeof p.mcVersion === 'string' ? p.mcVersion : '1.20.1',
        loader: typeof p.loader === 'string' ? p.loader : 'Fabric',
        description: typeof p.description === 'string' ? p.description : '',
        mods: Array.isArray(p.mods)
          ? (p.mods as unknown[]).filter(
              (m): m is ModItem =>
                !!m &&
                typeof m === 'object' &&
                typeof (m as { id?: unknown }).id === 'string'
            )
          : []
      }));
    if (normalizedProfiles.length === 0) {
      normalizedProfiles = undefined;
    }
  }

  let normalizedTheme: ThemeMode | undefined;
  if (src.theme === 'dark' || src.theme === 'light') normalizedTheme = src.theme;

  let normalizedCurrentId: string | undefined;
  if (typeof src.currentProfileId === 'string') {
    const target = src.currentProfileId;
    if (normalizedProfiles && normalizedProfiles.some((p) => p.id === target)) {
      normalizedCurrentId = target;
    } else if (normalizedProfiles && normalizedProfiles[0]) {
      normalizedCurrentId = normalizedProfiles[0].id;
    }
  }

  return {
    theme: normalizedTheme,
    currentProfileId: normalizedCurrentId,
    profiles: normalizedProfiles
  };
}
