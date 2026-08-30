import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';

describe('OfflineBanner', () => {
  let originalOnLine: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  });

  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOnLine);
    }
    vi.restoreAllMocks();
  });

  function setOnLine(value: boolean) {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => value
    });
  }

  it('does not render on server side (hasHydrated=false)', () => {
    // 初期レンダー直後、useEffect が走る前は何も出ない
    const { container } = render(<OfflineBanner />);
    // useEffect が走った後は online 状態なので出ないはず
    // (jsdom の navigator.onLine はデフォルト true)
    expect(container.textContent).toBe('');
  });

  it('renders banner when navigator.onLine is false', async () => {
    setOnLine(false);
    render(<OfflineBanner />);
    // useEffect が走ってから表示
    await waitFor(() => {
      expect(screen.getByText(/オフライン中/)).toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('hides banner when going online', async () => {
    setOnLine(false);
    render(<OfflineBanner />);
    await waitFor(() => {
      expect(screen.getByText(/オフライン中/)).toBeInTheDocument();
    });

    // オンラインへ復帰
    setOnLine(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(screen.queryByText(/オフライン中/)).not.toBeInTheDocument();
    });
  });

  it('shows banner when going offline via event', async () => {
    setOnLine(true);
    render(<OfflineBanner />);
    // 初期は online なので出ない
    expect(screen.queryByText(/オフライン中/)).not.toBeInTheDocument();

    setOnLine(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => {
      expect(screen.getByText(/オフライン中/)).toBeInTheDocument();
    });
  });
});
