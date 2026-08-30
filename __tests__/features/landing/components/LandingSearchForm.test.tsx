/**
 * LandingSearchForm component test (Phase 10.5-B)
 *
 * - Enter / ボタン押下で /discover/mods へ遷移 (useRouter().push)
 * - 空クエリ → /discover/mods / 入力あり → /discover/mods?q=<encodeURIComponent>
 *
 * useRouter は test-utils/navigation.ts の mock を使用。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LandingSearchForm } from '@/features/landing/components/LandingSearchForm';
import { navigationMock } from '@/__tests__/test-utils/navigation';

vi.mock('next/navigation', async () => {
  const { nextNavigationModuleMock } = await import('@/__tests__/test-utils/navigation');
  return nextNavigationModuleMock();
});

describe('LandingSearchForm', () => {
  beforeEach(() => {
    navigationMock.reset();
  });
  afterEach(() => {
    navigationMock.reset();
  });

  it('placeholder を表示する (default と上書き両方)', () => {
    const { rerender } = render(<LandingSearchForm />);
    expect(screen.getByPlaceholderText('Mod 名で検索...')).toBeInTheDocument();

    rerender(<LandingSearchForm placeholder="Modpack を検索" />);
    expect(screen.getByPlaceholderText('Modpack を検索')).toBeInTheDocument();
  });

  it('入力したクエリで submit すると /discover/mods?q=<encoded> へ push する', async () => {
    const user = userEvent.setup();
    render(<LandingSearchForm />);

    await user.type(screen.getByRole('searchbox'), '  fabric api  ');
    await user.click(screen.getByRole('button', { name: '検索' }));

    expect(navigationMock.push).toHaveBeenCalledTimes(1);
    expect(navigationMock.push).toHaveBeenCalledWith(
      '/discover/mods?q=fabric%20api'
    );
  });

  it('空クエリで submit すると /discover/mods へ push する', async () => {
    const user = userEvent.setup();
    render(<LandingSearchForm />);

    await user.type(screen.getByRole('searchbox'), '   ');
    await user.click(screen.getByRole('button', { name: '検索' }));

    expect(navigationMock.push).toHaveBeenCalledWith('/discover/mods');
  });

  it('Enter キーでも submit できる', async () => {
    const user = userEvent.setup();
    render(<LandingSearchForm />);

    await user.type(screen.getByRole('searchbox'), 'sodium');
    await user.keyboard('{Enter}');

    expect(navigationMock.push).toHaveBeenCalledWith('/discover/mods?q=sodium');
  });
});
