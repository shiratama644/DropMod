import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useZipImportStore, type PendingImportData } from '@/lib/store/zipImport';
import type { ModItem } from '@/types';

const M1: ModItem = {
  id: 'm1', slug: 'sodium', title: 'Sodium', fileUrl: '', filename: '',
  selectedVersionId: 'v1', selectedVersionNumber: '1.0'
} as ModItem;

describe('useZipImportStore', () => {
  beforeEach(() => {
    act(() => useZipImportStore.setState({ pendingImportData: null }));
  });

  describe('initial state', () => {
    it('pendingImportData is null on mount', () => {
      expect(useZipImportStore.getState().pendingImportData).toBeNull();
    });
  });

  describe('setPendingImportData', () => {
    it('sets full PendingImportData object', () => {
      const data: PendingImportData = {
        name: 'Test Pack',
        mods: [M1],
        mcVersion: '1.20.1',
        loader: 'Fabric'
      };
      act(() => useZipImportStore.getState().setPendingImportData(data));
      expect(useZipImportStore.getState().pendingImportData).toEqual(data);
    });

    it('accepts optional fields (mcVersion/loader) as undefined', () => {
      const data: PendingImportData = {
        name: 'Minimal',
        mods: []
      };
      act(() => useZipImportStore.getState().setPendingImportData(data));
      const stored = useZipImportStore.getState().pendingImportData;
      expect(stored?.name).toBe('Minimal');
      expect(stored?.mcVersion).toBeUndefined();
      expect(stored?.loader).toBeUndefined();
    });

    it('overwrites previous data', () => {
      act(() =>
        useZipImportStore.getState().setPendingImportData({ name: 'A', mods: [] })
      );
      act(() =>
        useZipImportStore.getState().setPendingImportData({ name: 'B', mods: [M1] })
      );
      expect(useZipImportStore.getState().pendingImportData?.name).toBe('B');
      expect(useZipImportStore.getState().pendingImportData?.mods).toEqual([M1]);
    });

    it('can be set to null', () => {
      act(() =>
        useZipImportStore.getState().setPendingImportData({ name: 'A', mods: [] })
      );
      act(() => useZipImportStore.getState().setPendingImportData(null));
      expect(useZipImportStore.getState().pendingImportData).toBeNull();
    });
  });

  describe('clearPendingImportData', () => {
    it('sets pendingImportData to null', () => {
      act(() =>
        useZipImportStore.getState().setPendingImportData({ name: 'A', mods: [] })
      );
      act(() => useZipImportStore.getState().clearPendingImportData());
      expect(useZipImportStore.getState().pendingImportData).toBeNull();
    });

    it('no-op when already null', () => {
      act(() => useZipImportStore.getState().clearPendingImportData());
      expect(useZipImportStore.getState().pendingImportData).toBeNull();
    });
  });
});
