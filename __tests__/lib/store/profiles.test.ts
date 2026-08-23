import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useProfilesStore, selectCurrentProfile } from '@/lib/store/profiles';
import type { Profile, ModItem } from '@/types';

const P1: Profile = {
  id: 'p1', name: 'P1', mcVersion: '1.20.1', loader: 'Fabric', description: '', mods: []
};
const P2: Profile = {
  id: 'p2', name: 'P2', mcVersion: '1.21.4', loader: 'Forge', description: '', mods: []
};
const M1: ModItem = {
  id: 'm1', slug: 'sodium', title: 'Sodium', fileUrl: '', filename: '',
  selectedVersionId: 'v1', selectedVersionNumber: '1.0'
} as ModItem;
const M2: ModItem = {
  id: 'm2', slug: 'lithium', title: 'Lithium', fileUrl: '', filename: '',
  selectedVersionId: 'v2', selectedVersionNumber: '2.0'
} as ModItem;

describe('useProfilesStore', () => {
  beforeEach(() => {
    // reset to fresh state
    act(() => {
      useProfilesStore.setState({
        profiles: [P1, P2],
        currentProfileId: 'p1',
        hasHydrated: true,
        theme: 'dark'
      });
    });
  });

  describe('setters', () => {
    it('setProfiles accepts an array', () => {
      act(() => useProfilesStore.getState().setProfiles([P1]));
      expect(useProfilesStore.getState().profiles).toEqual([P1]);
    });

    it('setProfiles accepts a functional updater', () => {
      act(() =>
        useProfilesStore.getState().setProfiles((prev) => prev.filter((p) => p.id === 'p2'))
      );
      expect(useProfilesStore.getState().profiles).toEqual([P2]);
    });

    it('setTheme changes theme', () => {
      act(() => useProfilesStore.getState().setTheme('light'));
      expect(useProfilesStore.getState().theme).toBe('light');
    });

    it('toggleTheme flips between dark and light', () => {
      act(() => useProfilesStore.getState().toggleTheme());
      expect(useProfilesStore.getState().theme).toBe('light');
      act(() => useProfilesStore.getState().toggleTheme());
      expect(useProfilesStore.getState().theme).toBe('dark');
    });
  });

  describe('addModToProfile', () => {
    it('adds a mod to an existing profile', () => {
      let result: boolean | null = null;
      act(() => {
        result = useProfilesStore.getState().addModToProfile('p1', M1);
      });
      expect(result).toBe(true);
      const p = useProfilesStore.getState().profiles.find((p) => p.id === 'p1');
      expect(p?.mods).toHaveLength(1);
      expect(p?.mods[0]?.id).toBe('m1');
    });

    it('returns false when duplicate id', () => {
      act(() => useProfilesStore.getState().addModToProfile('p1', M1));
      let result: boolean | null = null;
      act(() => {
        result = useProfilesStore.getState().addModToProfile('p1', M1);
      });
      expect(result).toBe(false);
      const p = useProfilesStore.getState().profiles.find((p) => p.id === 'p1');
      expect(p?.mods).toHaveLength(1);
    });

    it('returns null when profile does not exist', () => {
      let result: boolean | null = null;
      act(() => {
        result = useProfilesStore.getState().addModToProfile('missing', M1);
      });
      expect(result).toBeNull();
    });

    it('recognizes duplicate via slug', () => {
      act(() => useProfilesStore.getState().addModToProfile('p1', M1));
      // 別 id、同 slug
      const clone = { ...M1, id: 'different-id' };
      let result: boolean | null = null;
      act(() => {
        result = useProfilesStore.getState().addModToProfile('p1', clone);
      });
      expect(result).toBe(false);
    });
  });

  describe('removeModFromProfile', () => {
    beforeEach(() => {
      act(() => {
        useProfilesStore.setState({
          profiles: [{ ...P1, mods: [M1, M2] }, P2],
          currentProfileId: 'p1',
          hasHydrated: true,
          theme: 'dark'
        });
      });
    });

    it('removes by mod id and returns the removed item', () => {
      let removed: ModItem | null = null;
      act(() => {
        removed = useProfilesStore.getState().removeModFromProfile('p1', 'm1');
      });
      expect((removed as ModItem | null)?.id).toBe('m1');
      const p = useProfilesStore.getState().profiles.find((p) => p.id === 'p1');
      expect(p?.mods).toEqual([M2]);
    });

    it('removes by slug', () => {
      let removed: ModItem | null = null;
      act(() => {
        removed = useProfilesStore.getState().removeModFromProfile('p1', 'sodium');
      });
      expect((removed as ModItem | null)?.slug).toBe('sodium');
    });

    it('returns null when mod not found', () => {
      let removed: ModItem | null = null;
      act(() => {
        removed = useProfilesStore.getState().removeModFromProfile('p1', 'nonexistent');
      });
      expect(removed).toBeNull();
    });

    it('returns null when profile does not exist', () => {
      let removed: ModItem | null = null;
      act(() => {
        removed = useProfilesStore.getState().removeModFromProfile('missing', 'm1');
      });
      expect(removed).toBeNull();
    });
  });

  describe('updateModVersionInProfile', () => {
    beforeEach(() => {
      act(() => {
        useProfilesStore.setState({
          profiles: [{ ...P1, mods: [M1] }, P2],
          currentProfileId: 'p1',
          hasHydrated: true,
          theme: 'dark'
        });
      });
    });

    it('updates version fields', () => {
      let ok = false;
      act(() => {
        ok = useProfilesStore.getState().updateModVersionInProfile('p1', 'm1', {
          selectedVersionId: 'new-version',
          selectedVersionNumber: '3.0',
          versionType: 'beta'
        });
      });
      expect(ok).toBe(true);
      const mod = useProfilesStore
        .getState()
        .profiles.find((p) => p.id === 'p1')
        ?.mods.find((m) => m.id === 'm1');
      expect(mod?.selectedVersionId).toBe('new-version');
      expect(mod?.selectedVersionNumber).toBe('3.0');
      expect(mod?.versionType).toBe('beta');
    });

    it('returns false when mod not found', () => {
      let ok = true;
      act(() => {
        ok = useProfilesStore
          .getState()
          .updateModVersionInProfile('p1', 'no-mod', { selectedVersionId: 'x' });
      });
      expect(ok).toBe(false);
    });
  });

  describe('clearProfileMods', () => {
    it('empties mods array', () => {
      act(() => {
        useProfilesStore.setState({
          profiles: [{ ...P1, mods: [M1, M2] }],
          currentProfileId: 'p1',
          hasHydrated: true,
          theme: 'dark'
        });
      });
      let ok = false;
      act(() => {
        ok = useProfilesStore.getState().clearProfileMods('p1');
      });
      expect(ok).toBe(true);
      expect(
        useProfilesStore.getState().profiles.find((p) => p.id === 'p1')?.mods
      ).toEqual([]);
    });
  });

  describe('selectCurrentProfile', () => {
    it('returns the profile matching currentProfileId', () => {
      const state = useProfilesStore.getState();
      expect(selectCurrentProfile(state)?.id).toBe('p1');
    });

    it('falls back to first when id not found', () => {
      act(() => {
        useProfilesStore.setState({
          profiles: [P1, P2],
          currentProfileId: 'unknown'
        } as never);
      });
      const state = useProfilesStore.getState();
      expect(selectCurrentProfile(state)?.id).toBe('p1');
    });
  });
});
