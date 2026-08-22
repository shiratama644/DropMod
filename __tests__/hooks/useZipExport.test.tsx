/**
 * useZipExport integration test (Sub-Phase 9-C.3)
 *
 * - Mod ファイル DL 用 fetch を msw で mock
 * - URL.createObjectURL / URL.revokeObjectURL は jsdom に無いので stub
 * - HTMLAnchorElement.prototype.click も no-op に
 * - useZipExportStore の zipState 遷移 (0-mod ガード、成功、キャンセル、失敗) を検証
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useZipExport } from '@/hooks/useZipExport';
import { useZipExportStore } from '@/lib/store/zipExport';
import type { Profile } from '@/types';

// ------------------ Fixture helpers ------------------

function makeProfile(mods: Profile['mods']): Profile {
  return {
    id: 'p1',
    name: 'Test Profile',
    mcVersion: '1.20.1',
    loader: 'Fabric',
    description: '',
    mods
  };
}

// ------------------ URL / anchor mocks ------------------

beforeEach(() => {
  // reset zipState
  useZipExportStore.getState().resetZipState();

  // URL.createObjectURL / revokeObjectURL は jsdom に未実装なので個別に stub。
  // ⚠️ vi.stubGlobal('URL', ...) で URL クラス全体を差し替えると msw の
  //   `new URL(request.url)` が壊れて全 handler がマッチしなくなるため、
  //   メソッド差し替えのみに留める。
  if (typeof URL.createObjectURL !== 'function') {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
      () => 'blob:mock-url';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
  }
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  // HTMLAnchorElement.click を no-op に (jsdom は navigation を起こそうとする)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

describe('useZipExport', () => {
  it('Mod が 0 個なら warning を出して早期 return', async () => {
    const showToast = vi.fn();
    const profile = makeProfile([]);
    const { result } = renderHook(() => useZipExport(profile, showToast));

    await act(async () => {
      await result.current.handleDownloadZip();
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('Modが登録されていません'),
      'warning'
    );
    // モーダルは開かない
    expect(useZipExportStore.getState().zipState.isOpen).toBe(false);
  });

  it('DL 経路: fetch が呼ばれ、モーダル進行状態が遷移する', async () => {
    // 目的: 実 DL パイプライン (progress state → fetch → JSZip 追加) が回るところまで
    //   検証する。JSZip.generateAsync({ type: 'blob' }) は jsdom の Blob 実装の一部で
    //   失敗する既知パターンがあるため、完了 toast の 'success' vs 'warning' 分岐は
    //   ブラウザ差に依存する。ここでは cdn hit と modal 閉じ、progress 進行を検証。
    let cdnHits = 0;
    const bytes = new Uint8Array(1024);
    server.use(
      http.get('https://cdn.modrinth.com/data/mock/mod.jar', () => {
        cdnHits++;
        return new HttpResponse(bytes, {
          status: 200,
          headers: { 'Content-Type': 'application/java-archive' }
        });
      })
    );

    const showToast = vi.fn();
    const profile = makeProfile([
      {
        id: 'proj-a',
        title: 'ModA',
        description: '',
        fileUrl: 'https://cdn.modrinth.com/data/mock/mod.jar',
        filename: 'moda-1.0.jar',
        selectedVersionNumber: '1.0.0'
      }
    ]);
    const { result } = renderHook(() => useZipExport(profile, showToast));

    await act(async () => {
      await result.current.handleDownloadZip();
    });

    // fetch がヒット (progress モーダルが開いて実 DL が走った)
    expect(cdnHits).toBeGreaterThanOrEqual(1);
    // モーダルは最終的に閉じる (成功 or 失敗 どちらでも close される)
    await waitFor(
      () => expect(useZipExportStore.getState().zipState.isOpen).toBe(false),
      { timeout: 2000 }
    );
    // 完了 or 失敗 toast が最終的に呼ばれる
    expect(showToast).toHaveBeenCalled();
    const finalMsg = String(showToast.mock.calls.at(-1)?.[0] ?? '');
    expect(finalMsg).toMatch(/完了|失敗/);
  });

  it('fileUrl 未設定の Mod は failCount としてカウントされる', async () => {
    const showToast = vi.fn();
    const profile = makeProfile([
      {
        id: 'proj-nofile',
        title: 'NoFileMod',
        description: '',
        fileUrl: undefined,
        selectedVersionNumber: '1.0.0'
      }
    ]);
    const { result } = renderHook(() => useZipExport(profile, showToast));

    await act(async () => {
      await result.current.handleDownloadZip();
    });

    await waitFor(() => {
      const finalCall = showToast.mock.calls.find(
        ([msg]) => typeof msg === 'string' && msg.includes('完了')
      );
      expect(finalCall).toBeDefined();
    });
    const finalCall = showToast.mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('完了')
    );
    // 0/1 個成功、1 個失敗
    expect(finalCall?.[0]).toContain('0/1');
    expect(finalCall?.[0]).toContain('1個取得失敗');
    // 全失敗なので warning レベル
    expect(finalCall?.[1]).toBe('warning');
  });

  it('handleCancelZip: エクスポート中に呼ぶと modal を閉じてキャンセル toast', async () => {
    // fetch を「遅らせる」ように pending Promise を返す
    let resolveDl: (() => void) | null = null;
    server.use(
      http.get('https://cdn.modrinth.com/data/mock/slow.jar', async () => {
        await new Promise<void>((resolve) => {
          resolveDl = resolve;
        });
        return HttpResponse.arrayBuffer(new Uint8Array([1]).buffer);
      })
    );

    const showToast = vi.fn();
    const profile = makeProfile([
      {
        id: 'p-slow',
        title: 'Slow',
        description: '',
        fileUrl: 'https://cdn.modrinth.com/data/mock/slow.jar',
        filename: 'slow.jar'
      }
    ]);
    const { result } = renderHook(() => useZipExport(profile, showToast));

    // fire-and-forget で開始
    let dlPromise: Promise<void>;
    act(() => {
      dlPromise = result.current.handleDownloadZip();
    });

    // modal が開いたらキャンセル
    await waitFor(() => {
      expect(useZipExportStore.getState().zipState.isOpen).toBe(true);
    });

    act(() => {
      result.current.handleCancelZip();
    });

    // pending fetch を解放して cleanup
    (resolveDl as (() => void) | null)?.();
    await act(async () => {
      await dlPromise!;
    });

    // キャンセル toast
    const cancelCall = showToast.mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('キャンセル')
    );
    expect(cancelCall).toBeDefined();
    expect(useZipExportStore.getState().zipState.isOpen).toBe(false);
  });

  it('handleCancelZip: エクスポート中でなければ toast は出ない (modal だけ閉じる)', async () => {
    const showToast = vi.fn();
    const profile = makeProfile([]);
    const { result } = renderHook(() => useZipExport(profile, showToast));

    // 手動で modal を開けておく
    act(() => {
      useZipExportStore.getState().openZipModal();
    });

    act(() => {
      result.current.handleCancelZip();
    });

    // toast は呼ばれない
    const cancelCall = showToast.mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('キャンセル')
    );
    expect(cancelCall).toBeUndefined();
    expect(useZipExportStore.getState().zipState.isOpen).toBe(false);
  });

  it('hook 戻り値の zipProgress/isZipModalOpen は store と同期', async () => {
    const showToast = vi.fn();
    const profile = makeProfile([]);
    const { result } = renderHook(() => useZipExport(profile, showToast));

    // 初期状態
    expect(result.current.isZipModalOpen).toBe(false);
    expect(result.current.zipProgress).toBe(0);

    act(() => {
      useZipExportStore.getState().updateZipState({ isOpen: true, progress: 42 });
    });

    // hook は Zustand subscribe で自動再レンダーされる
    expect(result.current.isZipModalOpen).toBe(true);
    expect(result.current.zipProgress).toBe(42);
  });
});
