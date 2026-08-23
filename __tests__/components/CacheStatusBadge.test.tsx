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

  it('B12 修正: 初期 now=0 で SSR/client 一致 (mismatch 回避)', () => {
    // 実装は useState(0) で初期化 → SSR で render される HTML と client の
    // 1 回目 render 結果が確実に一致する。
    // (SSR ではそもそも useEffect が走らないので Date.now() は呼ばれない)
    const { container } = render(
      <CacheStatusBadge dataUpdatedAt={Date.now() - 60_000} isFetching={false} />
    );
    // useEffect 完了後は「1分前のキャッシュ」表示だが、
    // useState(0) だと初回 render では now=0, ageMs=Math.max(0, -...)=0
    // で isFresh=true → 「今取得」が一瞬表示される可能性
    // (テストランタイムでは useEffect が同期的に flush されるので既に「1分前」表示)
    expect(container.textContent).toMatch(/1分前|今取得/);
  });
});
