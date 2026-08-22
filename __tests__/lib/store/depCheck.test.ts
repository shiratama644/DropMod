import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useDepCheckStore } from '@/lib/store/depCheck';

describe('useDepCheckStore', () => {
  beforeEach(() => {
    act(() =>
      useDepCheckStore.setState({
        hasDepWarning: false,
        lastCheckAt: null,
        isChecking: false
      })
    );
  });

  describe('initial state', () => {
    it('all fields start at defaults', () => {
      const s = useDepCheckStore.getState();
      expect(s.hasDepWarning).toBe(false);
      expect(s.lastCheckAt).toBeNull();
      expect(s.isChecking).toBe(false);
    });
  });

  describe('setHasDepWarning', () => {
    it('toggles warning flag', () => {
      act(() => useDepCheckStore.getState().setHasDepWarning(true));
      expect(useDepCheckStore.getState().hasDepWarning).toBe(true);
      act(() => useDepCheckStore.getState().setHasDepWarning(false));
      expect(useDepCheckStore.getState().hasDepWarning).toBe(false);
    });
  });

  describe('setChecking', () => {
    it('toggles isChecking flag', () => {
      act(() => useDepCheckStore.getState().setChecking(true));
      expect(useDepCheckStore.getState().isChecking).toBe(true);
      act(() => useDepCheckStore.getState().setChecking(false));
      expect(useDepCheckStore.getState().isChecking).toBe(false);
    });
  });

  describe('markChecked', () => {
    it('sets lastCheckAt to a positive number and clears isChecking', () => {
      const before = Date.now();
      act(() => useDepCheckStore.getState().setChecking(true));
      act(() => useDepCheckStore.getState().markChecked());
      const s = useDepCheckStore.getState();
      expect(s.lastCheckAt).toBeGreaterThanOrEqual(before);
      expect(s.isChecking).toBe(false);
    });

    it('does NOT affect hasDepWarning', () => {
      act(() => useDepCheckStore.getState().setHasDepWarning(true));
      act(() => useDepCheckStore.getState().markChecked());
      expect(useDepCheckStore.getState().hasDepWarning).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets all fields', () => {
      act(() => {
        useDepCheckStore.getState().setHasDepWarning(true);
        useDepCheckStore.getState().setChecking(true);
        useDepCheckStore.getState().markChecked();
      });
      act(() => useDepCheckStore.getState().reset());
      const s = useDepCheckStore.getState();
      expect(s.hasDepWarning).toBe(false);
      expect(s.lastCheckAt).toBeNull();
      expect(s.isChecking).toBe(false);
    });
  });
});
