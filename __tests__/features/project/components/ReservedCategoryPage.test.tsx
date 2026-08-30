/**
 * ReservedCategoryPage component test (Phase 10.5-B)
 *
 * /modpack /resourcepack /shader の予約ページ。静的コンポーネントのため
 * mock 不要 (next/link は jsdom 上で <a> に render される)。
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReservedCategoryPage } from '@/features/project/components/ReservedCategoryPage';

describe('ReservedCategoryPage', () => {
  const props = {
    title: 'Modpacks',
    icon: 'fa-boxes-stacked',
    searchType: 'modpack' as const,
    phaseLabel: 'Phase 11' as const,
    description: 'Modpack の管理は今後実装予定です。'
  };

  it('タイトル・説明・Phase ラベルを表示する', () => {
    render(<ReservedCategoryPage {...props} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Modpacks' })).toBeInTheDocument();
    expect(screen.getByText('Modpack の管理は今後実装予定です。')).toBeInTheDocument();
    expect(screen.getByText('Phase 11 で本実装')).toBeInTheDocument();
  });

  it('検索へ誘導するリンクは searchType に対応する /discover/<複数形> へ', () => {
    render(<ReservedCategoryPage {...props} />);
    const searchLink = screen.getByRole('link', { name: /Modrinth で探す/ });
    expect(searchLink).toHaveAttribute('href', '/discover/modpacks');
  });

  it('searchType ごとに検索先 URL が切り替わる', () => {
    const { rerender } = render(
      <ReservedCategoryPage {...props} searchType="shader" />
    );
    expect(screen.getByRole('link', { name: /Modrinth で探す/ })).toHaveAttribute(
      'href',
      '/discover/shaders'
    );

    rerender(<ReservedCategoryPage {...props} searchType="resourcepack" />);
    expect(screen.getByRole('link', { name: /Modrinth で探す/ })).toHaveAttribute(
      'href',
      '/discover/resourcepacks'
    );
  });

  it('ホームへのリンクを表示する', () => {
    render(<ReservedCategoryPage {...props} />);
    expect(screen.getByRole('link', { name: 'ホームへ' })).toHaveAttribute('href', '/');
  });
});
