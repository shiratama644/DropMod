/**
 * showDirectoryPicker のラッパー (PHASE11_PLAN.md §10.5)。
 *
 * - **D-7 (2026-08-29 確定)**: 紐付け時も `mode: 'read'` のまま。`readwrite` への
 *   昇格は Sync 実行時に `FileSystemSink.ensureWritable()` が担う
 *   (解析だけしたいユーザーに書き込み権限を迫らない)
 * - ハンドルの IndexedDB 永続化 (dirHandles) と `Profile.linkedSource` への保存は
 *   Phase 12-B で `lib/env/link.ts` が担当する
 * - ユーザーキャンセル (AbortError) は null を返す (呼び出し側で
 *   エラー扱いしない)。その他の失敗は Error を throw。
 */

import { supportsDirectoryPicker } from './capabilities';
import { FileSystemSource } from './source';

export interface PickedDirectory {
  /** 選択されたディレクトリのハンドル (`lib/env/link.ts` が dirHandles に保存する) */
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
