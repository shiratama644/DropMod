import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import {
  useZipExportStore,
  selectZipProgress,
  selectZipIsOpen
} from '@/features/zip/store/zipExport';

describe('useZipExportStore', () => {
  beforeEach(() => {
    // reset to initial state
    act(() => {
      useZipExportStore.setState({
        zipState: {
          isOpen: false,
          progress: 0,
          statusText: '',
          statusCount: '',
          detailText: ''
        },
        cancelRequested: false
      });
    });
  });

  describe('updateZipState', () => {
    it('partial update merges with existing state', () => {
      act(() => useZipExportStore.getState().updateZipState({ progress: 50 }));
      const s = useZipExportStore.getState().zipState;
      expect(s.progress).toBe(50);
      expect(s.isOpen).toBe(false); // 触れていない field は保持
    });

    it('multiple fields update at once', () => {
      act(() =>
        useZipExportStore.getState().updateZipState({
          isOpen: true,
          progress: 75,
          statusText: 'downloading...',
          statusCount: '3 / 4'
        })
      );
      const s = useZipExportStore.getState().zipState;
      expect(s.isOpen).toBe(true);
      expect(s.progress).toBe(75);
      expect(s.statusText).toBe('downloading...');
      expect(s.statusCount).toBe('3 / 4');
      expect(s.detailText).toBe(''); // 未指定 field
    });
  });

  describe('open / close modal', () => {
    it('openZipModal sets isOpen=true without touching progress', () => {
      act(() => useZipExportStore.getState().updateZipState({ progress: 42 }));
      act(() => useZipExportStore.getState().openZipModal());
      const s = useZipExportStore.getState().zipState;
      expect(s.isOpen).toBe(true);
      expect(s.progress).toBe(42);
    });

    it('closeZipModal sets isOpen=false', () => {
      act(() => useZipExportStore.getState().openZipModal());
      act(() => useZipExportStore.getState().closeZipModal());
      expect(useZipExportStore.getState().zipState.isOpen).toBe(false);
    });
  });

  describe('resetZipState', () => {
    it('resets everything including cancelRequested', () => {
      act(() =>
        useZipExportStore.getState().updateZipState({ isOpen: true, progress: 99 })
      );
      act(() => useZipExportStore.getState().requestCancel());
      act(() => useZipExportStore.getState().resetZipState());
      const s = useZipExportStore.getState();
      expect(s.zipState.isOpen).toBe(false);
      expect(s.zipState.progress).toBe(0);
      expect(s.cancelRequested).toBe(false);
    });
  });

  describe('cancel flag', () => {
    it('requestCancel sets cancelRequested=true', () => {
      act(() => useZipExportStore.getState().requestCancel());
      expect(useZipExportStore.getState().cancelRequested).toBe(true);
    });

    it('clearCancelRequest sets cancelRequested=false', () => {
      act(() => useZipExportStore.getState().requestCancel());
      act(() => useZipExportStore.getState().clearCancelRequest());
      expect(useZipExportStore.getState().cancelRequested).toBe(false);
    });
  });

  describe('selectors', () => {
    it('selectZipProgress returns progress only', () => {
      act(() => useZipExportStore.getState().updateZipState({ progress: 33 }));
      expect(selectZipProgress(useZipExportStore.getState())).toBe(33);
    });

    it('selectZipIsOpen returns isOpen only', () => {
      act(() => useZipExportStore.getState().openZipModal());
      expect(selectZipIsOpen(useZipExportStore.getState())).toBe(true);
    });
  });
});
