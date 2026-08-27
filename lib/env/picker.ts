/**
 * showDirectoryPicker のラッパー (PHASE11_PLAN.md §10.5)。
 *
 * - Phase 11 は Read-only のため mode: 'read' のみ
 *   (Phase 12 の Sync で 'readwrite' に昇格)
 * - ハンドルの IndexedDB 永続化 (dirHandles) と Profile.linkedSource は
 *   Phase 12 へ延期 (2026-08-26 改定)。Phase 11 では
 *   「選択 → 解析 → Profile 生成」の都度使い捨て。
 * - ユーザーキャンセル (AbortError) は null を返す (呼び出し側で
 *   エラー扱いしない)。その他の失敗は Error を throw。
 */

import { supportsDirectoryPicker } from './capabilities';
import { FileSystemSource } from './source';

export interface PickedDirectory {
  /** 選択されたディレクトリのハンドル (Phase 11 では使い捨て) */
  handle: FileSystemDirectoryHandle;
  /** ハンドルを包んだ EnvironmentSource (Detector / Analyzer に渡す) */
  source: FileSystemSource;
}

/**
 * Minecraft フォルダ (.minecraft / Prism インスタンス等) をユーザーに
 * 選択させる。ユーザーがキャンセルした場合は null を返す。
 */
export async function pickMinecraftDirectory(): Promise<PickedDirectory | null> {
  if (!supportsDirectoryPicker()) {
    throw new Error(
      'このブラウザはフォルダ選択 (File System Access API) に対応していません。' +
        'Chrome / Edge をご利用ください。'
    );
  }
  const picker = window.showDirectoryPicker;
  if (!picker) {
    // features detection を通過した直後に失敗する稀なケースの防御
    throw new Error('フォルダ選択 API を呼び出せませんでした。');
  }

  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ mode: 'read' });
  } catch (e) {
    if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') {
      return null; // ユーザーキャンセル
    }
    throw e;
  }

  return {
    handle,
    source: new FileSystemSource(handle, handle.name)
  };
}
