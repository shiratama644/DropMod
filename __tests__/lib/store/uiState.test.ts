import { beforeEach, describe, expect, it } from 'vitest';
import { useUiState } from '@/lib/store/uiState';

describe('lib/store/uiState — モーダルカウント (BottomNav 非表示用)', () => {
  beforeEach(() => {
    useUiState.setState({ openModalCount: 0 });
  });

  it('初期状態は openModalCount = 0', () => {
    expect(useUiState.getState().openModalCount).toBe(0);
  });

  it('openModal でインクリメントされる (モーダル重ね対応)', () => {
    useUiState.getState().openModal();
    expect(useUiState.getState().openModalCount).toBe(1);
    useUiState.getState().openModal();
    useUiState.getState().openModal();
    expect(useUiState.getState().openModalCount).toBe(3);
  });

  it('closeModal でデクリメントされる', () => {
    useUiState.getState().openModal();
    useUiState.getState().openModal();
    useUiState.getState().closeModal();
    expect(useUiState.getState().openModalCount).toBe(1);
  });

  it('closeModal は 0 未満に落ちない (二重 close 防御)', () => {
    useUiState.getState().closeModal();
    useUiState.getState().closeModal();
    expect(useUiState.getState().openModalCount).toBe(0);
  });

  it('open/close の対で最終的に 0 に戻る', () => {
    useUiState.getState().openModal();
    useUiState.getState().openModal();
    useUiState.getState().closeModal();
    useUiState.getState().closeModal();
    expect(useUiState.getState().openModalCount).toBe(0);
  });
});
