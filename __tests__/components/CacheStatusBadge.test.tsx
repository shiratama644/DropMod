/**
 * CacheStatusBadge component test (Phase 9-E.1: E-2 実装)
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CacheStatusBadge } from '@/components/CacheStatusBadge';

describe('CacheStatusBadge', () => {
  it('dataUpdatedAt=0 & isFetching=false なら何も描画しない', () => {
    const { container } = render(
      <CacheStatusBadge dataUpdatedAt={0} isFetching={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('isFetching=true なら「取得中…」バッジ', () => {
    render(<CacheStatusBadge dataUpdatedAt={0} isFetching={true} />);
    expect(screen.getByText('取得中…')).toBeInTheDocument();
  });

  it('isFetching=true は dataUpdatedAt があっても優先される', () => {
    render(
      <CacheStatusBadge
        dataUpdatedAt={Date.now() - 60_000}
        isFetching={true}
      />
    );
    expect(screen.getByText('取得中…')).toBeInTheDocument();
    expect(screen.queryByText(/キャッシュ/)).not.toBeInTheDocument();
  });

  it('dataUpdatedAt が 10 秒以内なら「今取得」', () => {
    render(
      <CacheStatusBadge dataUpdatedAt={Date.now() - 3_000} isFetching={false} />
    );
    expect(screen.getByText('今取得')).toBeInTheDocument();
  });

  it('dataUpdatedAt が 30 秒前なら「30秒前のキャッシュ」', () => {
    render(
      <CacheStatusBadge
        dataUpdatedAt={Date.now() - 30_000}
        isFetching={false}
      />
    );
    expect(screen.getByText(/30秒前のキャッシュ/)).toBeInTheDocument();
  });

  it('dataUpdatedAt が 5 分前なら「5分前のキャッシュ」', () => {
    render(
      <CacheStatusBadge
        dataUpdatedAt={Date.now() - 5 * 60 * 1000}
        isFetching={false}
      />
    );
    expect(screen.getByText(/5分前のキャッシュ/)).toBeInTheDocument();
  });

  it('dataUpdatedAt が 2 時間前なら「2時間前のキャッシュ」', () => {
    render(
      <CacheStatusBadge
        dataUpdatedAt={Date.now() - 2 * 60 * 60 * 1000}
        isFetching={false}
      />
    );
    expect(screen.getByText(/2時間前のキャッシュ/)).toBeInTheDocument();
  });

  it('className を渡せて span にマージされる', () => {
    const { container } = render(
      <CacheStatusBadge
        dataUpdatedAt={Date.now() - 60_000}
        isFetching={false}
        className="ml-2"
      />
    );
    const span = container.querySelector('span.ml-2');
    expect(span).not.toBeNull();
  });
});
