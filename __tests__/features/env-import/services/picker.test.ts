/**
 * lib/env/picker.ts test (Phase 11-B)
 *
 * window.showDirectoryPicker を差し替えて:
 * - 正常選択 → PickedDirectory { handle, source } を返す
 * - ユーザーキャンセル (AbortError) → null
 * - 非対応ブラウザ → Error
 * - mode: 'read' で呼ぶ (Phase 11 Read-only 原則)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { pickMinecraftDirectory } from '@/features/env-import/services/picker';
import { createFakeFileSystem } from '@/__tests__/test-utils/fakeFs';

describe('pickMinecraftDirectory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('正常選択: mode:"read" で picker を呼び、source を返す', async () => {
    const handle = createFakeFileSystem({ 'mods/a.jar': 'x' }, 'my-instance');
    const picker = vi.fn().mockResolvedValue(handle);
    vi.stubGlobal('showDirectoryPicker', picker);

    const picked = await pickMinecraftDirectory();

    expect(picker).toHaveBeenCalledWith({ mode: 'read' });
    expect(picked?.handle).toBe(handle);
    expect(picked?.source.kind).toBe('filesystem');
    expect(picked?.source.rootName).toBe('my-instance');
    expect(await picked?.source.listFiles('mods')).toEqual(['a.jar']);
  });

  it('ユーザーキャンセル (AbortError) は null を返す (エラー扱いしない)', async () => {
    const picker = vi.fn().mockRejectedValue(
      new DOMException('The user aborted a request.', 'AbortError')
    );
    vi.stubGlobal('showDirectoryPicker', picker);

    expect(await pickMinecraftDirectory()).toBeNull();
  });

  it('その他の失敗はそのまま throw', async () => {
    const picker = vi.fn().mockRejectedValue(new Error('permission denied'));
    vi.stubGlobal('showDirectoryPicker', picker);

    await expect(pickMinecraftDirectory()).rejects.toThrow('permission denied');
  });

  it('非対応ブラウザ (showDirectoryPicker 無し) は Error', async () => {
    // window.showDirectoryPicker を未定義化
    vi.stubGlobal('showDirectoryPicker', undefined);
    await expect(pickMinecraftDirectory()).rejects.toThrow('対応していません');
  });
});
