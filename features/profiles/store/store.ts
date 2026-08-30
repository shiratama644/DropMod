/**
 * profiles Zustand store (Sub-Phase 8-C Step 1)
 *
 * 設計方針:
 *   - この store は「シンプルな state 容器 + setter/updater」に徹する。
 *   - Modrinth API 呼び出し・cookie 書き込み・showToast 連携は hooks 側 (useProfiles) に残す。
 *     → 副作用の含まれる action をテストしづらくなるのを避けるため。
 *     → hooks は confirmDialog / showToast を引数で受け取る形なので、store から呼ぶと
 *       provider ツリーへの依存が生まれてしまう。
 *   - profiles / currentProfileId / hasHydrated / theme の 4 field をここで管理し、
 *     それぞれに個別 setter を用意することで細粒度 subscription を可能に。
 *
 * ⚠️ Dexie 永続化は useProfiles hook の save useEffect が担当 (Sub-Phase 8-A 実装のまま)
 *    store は永続化を意識しない。
 */

'use client';

import { create } from 'zustand';
/** クライアント側の初期テーマを dropmod_theme cookie から読む (SSR は dark 既定)。 */
export function readInitialTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  try {
    const parts = document.cookie ? document.cookie.split('; ') : [];
    for (const p of parts) {
      if (p.startsWith('dropmod_theme=')) {
        const v = decodeURIComponent(p.slice('dropmod_theme='.length));
        if (v === 'light' || v === 'dark') return v;
      }
    }
  } catch {
    /* 破損 cookie は既定にフォールバック */
  }
  return 'dark';
}
import { subscribeWithSelector, devtools } from 'zustand/middleware';
import type { Profile, ProjectItem, ThemeMode } from '@/types';

// Sub-Phase 8-E (E-8): Zustand DevTools を dev モードのみ有効化。
// production では devtools ラップを外して zero-cost にする。
const enableDevtools = process.env.NODE_ENV === 'development';

// ============================================================================
// State と Actions の型
// ============================================================================

export interface ProfilesState {
  // ---- Data ----
  profiles: Profile[];
  currentProfileId: string;
  hasHydrated: boolean;
  theme: ThemeMode;

  // ---- Setters (低レベル: 上位 hook から呼ぶ) ----
  setProfiles: (
    updater: Profile[] | ((prev: Profile[]) => Profile[])
  ) => void;
  setCurrentProfileId: (id: string) => void;
  setHasHydrated: (v: boolean) => void;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;

  // ---- Updater ヘルパ (単一プロファイル内の mods 操作) ----
  /**
   * 特定プロファイル内で mod を追加。既存 (同 id / slug) があれば何もせず false を返す。
   * @returns 追加できたら true, 既存で追加しなかったら false, profile が見つからなければ null
   */
  addModToProfile: (profileId: string, mod: ProjectItem) => boolean | null;

  /**
   * 特定プロファイルから mod を削除。削除された ProjectItem を返す (無ければ null)。
   */
  removeModFromProfile: (
    profileId: string,
    modIdOrSlug: string
  ) => ProjectItem | null;

  /**
   * 特定プロファイル内の mod のバージョン情報を更新。
   * (versionId / versionNumber / versionType / fileUrl / filename を上書き)
   */
  updateModVersionInProfile: (
    profileId: string,
    modId: string,
    updates: Partial<Pick<ProjectItem, 'versionId' | 'versionNumber' | 'versionType' | 'fileUrl' | 'filename'>>
  ) => boolean;

  /**
   * 特定プロファイルの mods を空にする。
   */
  clearProfileMods: (profileId: string) => boolean;
}

// ============================================================================
// デフォルト値
// ============================================================================

const DEFAULT_PROFILE: Profile = {
  id: 'default-profile',
  name: '1.20.1 Fabric 軽量化・ユーティリティ',
  environment: {
    mcVersion: '1.20.1',
    loader: 'Fabric'
  },
  description: 'Modrinthから直接Modを取得・ダウンロードする標準構成',
  mods: []
};

// ============================================================================
// Store
// ============================================================================

/**
 * subscribeWithSelector で `useProfilesStore.subscribe(selector, listener)` を使えるように。
 * これは Dexie 永続化の useEffect deps 最適化に将来使える (Phase 9 検討)。
 *
 * dev モードでは devtools middleware も適用され、Redux DevTools 拡張から state の
 * 履歴・タイムトラベルデバッグが可能に。
 */
const stateCreator: import('zustand').StateCreator<ProfilesState, [], []> = (set, _get) => ({
    // ---- Initial state ----
    profiles: [DEFAULT_PROFILE],
    currentProfileId: DEFAULT_PROFILE.id,
    hasHydrated: false,
    // 2026-08-27: 初期テーマはクライアントでは dropmod_theme cookie から。
    // (トグル直後のリロードで Dexie 保存が debounce に間に合わず旧テーマに
    // 戻る競合への対策。cookie はトグル時に即時書き込まれるため最新。)
    // SSR / cookie 無し / 破損値の場合は従来どおり dark 既定。
    theme: readInitialTheme(),

    // ---- Setters ----
    setProfiles: (updater) =>
      set((s) => ({
        profiles: typeof updater === 'function' ? updater(s.profiles) : updater
      })),

    setCurrentProfileId: (id) => set({ currentProfileId: id }),

    setHasHydrated: (v) => set({ hasHydrated: v }),

    setTheme: (t) => set({ theme: t }),

    toggleTheme: () =>
      set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

    // ---- Updater ヘルパ ----
    addModToProfile: (profileId, mod) => {
      let result: boolean | null = null;
      set((s) => {
        const idx = s.profiles.findIndex((p) => p.id === profileId);
        if (idx < 0) {
          result = null;
          return s;
        }
        const target = s.profiles[idx];
        if (!target) {
          result = null;
          return s;
        }
        const duplicate = target.mods.some(
          (m) => m.projectId === mod.projectId || (mod.slug && m.slug === mod.slug)
        );
        if (duplicate) {
          result = false;
          return s;
        }
        const nextProfiles = [...s.profiles];
        nextProfiles[idx] = { ...target, mods: [...target.mods, mod] };
        result = true;
        return { profiles: nextProfiles };
      });
      return result;
    },

    removeModFromProfile: (profileId, modIdOrSlug) => {
      let removed: ProjectItem | null = null;
      set((s) => {
        const idx = s.profiles.findIndex((p) => p.id === profileId);
        if (idx < 0) return s;
        const target = s.profiles[idx];
        if (!target) return s;
        const modIdx = target.mods.findIndex(
          (m) => m.projectId === modIdOrSlug || m.slug === modIdOrSlug
        );
        if (modIdx < 0) return s;
        removed = target.mods[modIdx] ?? null;
        const nextProfiles = [...s.profiles];
        nextProfiles[idx] = {
          ...target,
          mods: target.mods.filter((_, i) => i !== modIdx)
        };
        return { profiles: nextProfiles };
      });
      return removed;
    },

    updateModVersionInProfile: (profileId, modId, updates) => {
      let ok = false;
      set((s) => {
        const idx = s.profiles.findIndex((p) => p.id === profileId);
        if (idx < 0) return s;
        const target = s.profiles[idx];
        if (!target) return s;
        const modIdx = target.mods.findIndex((m) => m.projectId === modId);
        if (modIdx < 0) return s;
        const existingMod = target.mods[modIdx];
        if (!existingMod) return s;
        const nextMods = [...target.mods];
        nextMods[modIdx] = { ...existingMod, ...updates };
        const nextProfiles = [...s.profiles];
        nextProfiles[idx] = { ...target, mods: nextMods };
        ok = true;
        return { profiles: nextProfiles };
      });
      return ok;
    },

    clearProfileMods: (profileId) => {
      let ok = false;
      set((s) => {
        const idx = s.profiles.findIndex((p) => p.id === profileId);
        if (idx < 0) return s;
        const target = s.profiles[idx];
        if (!target) return s;
        if (target.mods.length === 0) {
          ok = true;
          return s;
        }
        const nextProfiles = [...s.profiles];
        nextProfiles[idx] = { ...target, mods: [] };
        ok = true;
        return { profiles: nextProfiles };
      });
      return ok;
    }
});

// middleware chain:
//   enableDevtools ? devtools(subscribeWithSelector(stateCreator)) : subscribeWithSelector(stateCreator)
// devtools を外側に置くのは、内側の subscribe/set 呼び出しをすべて DevTools に流すため。
export const useProfilesStore = enableDevtools
  ? create<ProfilesState>()(
      devtools(subscribeWithSelector(stateCreator), { name: 'DropMod/profiles' })
    )
  : create<ProfilesState>()(subscribeWithSelector(stateCreator));

// ============================================================================
// Selector helpers (再レンダー最適化用)
// ============================================================================

/**
 * 現在アクティブなプロファイルを返す。無ければ profiles[0] を返す (両方無ければ undefined)。
 * 参照が変わるのは currentProfileId が変わるか、当該 profile の中身が変わった時のみ。
 */
export const selectCurrentProfile = (s: ProfilesState): Profile | undefined =>
  s.profiles.find((p) => p.id === s.currentProfileId) ?? s.profiles[0];
