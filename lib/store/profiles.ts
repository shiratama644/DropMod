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
import { subscribeWithSelector } from 'zustand/middleware';
import type { Profile, ModItem, ThemeMode } from '@/types';

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
  addModToProfile: (profileId: string, mod: ModItem) => boolean | null;

  /**
   * 特定プロファイルから mod を削除。削除された ModItem を返す (無ければ null)。
   */
  removeModFromProfile: (
    profileId: string,
    modIdOrSlug: string
  ) => ModItem | null;

  /**
   * 特定プロファイル内の mod のバージョン情報を更新。
   * (selectedVersionId / selectedVersionNumber / versionType / fileUrl / filename を上書き)
   */
  updateModVersionInProfile: (
    profileId: string,
    modId: string,
    updates: Partial<Pick<ModItem, 'selectedVersionId' | 'selectedVersionNumber' | 'versionType' | 'fileUrl' | 'filename'>>
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
  mcVersion: '1.20.1',
  loader: 'Fabric',
  description: 'Modrinthから直接Modを取得・ダウンロードする標準構成',
  mods: []
};

// ============================================================================
// Store
// ============================================================================

/**
 * subscribeWithSelector で `useProfilesStore.subscribe(selector, listener)` を使えるように。
 * これは Dexie 永続化の useEffect deps 最適化に将来使える (Phase 9 検討)。
 */
export const useProfilesStore = create<ProfilesState>()(
  subscribeWithSelector((set, _get) => ({
    // ---- Initial state ----
    profiles: [DEFAULT_PROFILE],
    currentProfileId: DEFAULT_PROFILE.id,
    hasHydrated: false,
    theme: 'dark',

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
          (m) => m.id === mod.id || (mod.slug && m.slug === mod.slug)
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
      let removed: ModItem | null = null;
      set((s) => {
        const idx = s.profiles.findIndex((p) => p.id === profileId);
        if (idx < 0) return s;
        const target = s.profiles[idx];
        if (!target) return s;
        const modIdx = target.mods.findIndex(
          (m) => m.id === modIdOrSlug || m.slug === modIdOrSlug
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
        const modIdx = target.mods.findIndex((m) => m.id === modId);
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
  }))
);

// ============================================================================
// Selector helpers (再レンダー最適化用)
// ============================================================================

/**
 * 現在アクティブなプロファイルを返す。無ければ profiles[0] を返す (両方無ければ undefined)。
 * 参照が変わるのは currentProfileId が変わるか、当該 profile の中身が変わった時のみ。
 */
export const selectCurrentProfile = (s: ProfilesState): Profile | undefined =>
  s.profiles.find((p) => p.id === s.currentProfileId) ?? s.profiles[0];
