/**
 * FileSystemSink — File System Access API による Direct Write 実装
 * (Phase 12-B / PHASE12_PLAN.md §10.1)。
 *
 * Chromium 専用。**書き込みには `readwrite` 権限が必要**で、
 * `ensureWritable()` で昇格を試みる (失敗しても throw しない = D-2)。
 *
 * ハンドルは `lib/env/picker.ts` の `pickMinecraftDirectory()` で取得したもの、
 * または Dexie `dirHandles` テーブルから復元したものを渡す。
 */

import type { EnvironmentSink } from '../sink';
import { isNotFoundError, pathSegments } from '@/lib/env/source';

/** File System Access API の型不一致判定 (ファイル≠ディレクトリ) */
function isTypeMismatchError(e: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    e instanceof DOMException &&
    e.name === 'TypeMismatchError'
  );
}

/**
 * `Uint8Array` を `ArrayBuffer` に変換する。
 *
 * TS 5.9 の lib.dom は `FileSystemWritableFileStream.write` の引数を
 * `ArrayBufferView<ArrayBuffer>` として宣言しており、素の
 * `Uint8Array<ArrayBufferLike>` は代入できない。
 * バッファ全体を覆う view なら**コピーせず** underlying buffer をそのまま渡し、
 * 部分 view のときだけ切り出したコピーを作る (無駄なコピーを避ける)。
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = data.buffer as ArrayBuffer;
  if (data.byteOffset === 0 && data.byteLength === buffer.byteLength) {
    return buffer;
  }
  return data.slice().buffer as ArrayBuffer;
}

export class FileSystemSink implements EnvironmentSink {
  readonly kind = 'filesystem' as const;

  private isWritable = false;

  constructor(
    private readonly rootHandle: FileSystemDirectoryHandle,
    readonly rootName: string
  ) {}

  get writable(): boolean {
    return this.isWritable;
  }

  /**
   * `readwrite` 権限を確認・要求する。
   *
   * 既に granted なら再要求しない (不要なプロンプトを出さない)。
   * 拒否・非対応・例外はすべて `false` を返す (**throw しない** = D-2)。
   */
  async ensureWritable(): Promise<boolean> {
    try {
      const current = await this.rootHandle.queryPermission({ mode: 'readwrite' });
      if (current === 'granted') {
        this.isWritable = true;
        return true;
      }
      const requested = await this.rootHandle.requestPermission({ mode: 'readwrite' });
      this.isWritable = requested === 'granted';
      return this.isWritable;
    } catch {
      // 権限 API 自体が使えない (古い Chromium / 非 Secure Context 等)
      this.isWritable = false;
      return false;
    }
  }

  /** path (ディレクトリ) まで階層を辿る。create=true なら無いため生成する */
  private async getDirectoryHandle(
    path: string,
    create: boolean
  ): Promise<FileSystemDirectoryHandle> {
    let dir = this.rootHandle;
    for (const segment of pathSegments(path)) {
      dir = await dir.getDirectoryHandle(segment, { create });
    }
    return dir;
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const segments = pathSegments(path);
    const filename = segments.pop();
    if (!filename) return null;
    try {
      const dir = await this.getDirectoryHandle(segments.join('/'), false);
      const fileHandle = await dir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (e) {
      // Backup 取得時の「元々無かったファイル」は正常系として null を返す
      if (isNotFoundError(e) || isTypeMismatchError(e)) return null;
      throw e;
    }
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const segments = pathSegments(path);
    const filename = segments.pop();
    if (!filename) {
      throw new Error(`FileSystemSink.writeFile: 不正なパス '${path}'`);
    }
    const dir = await this.getDirectoryHandle(segments.join('/'), true);
    // 既存ファイルへの上書きかどうかを記録する (書込失敗時の掃除判定用)
    const existed = await dir
      .getFileHandle(filename)
      .then(() => true)
      .catch(() => false);
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(toArrayBuffer(data));
    } catch (e) {
      // 書込失敗時は、新規作成した部分ファイル (空ファイル) を残さない。
      // rollbackSync は `done === true` の操作のみを巻き戻すため、ここで
      // 掃除しないと「失敗したのに空ファイルが残る」状態になる。
      // (既存ファイルへの上書き失敗時は元のファイルを消さない)
      if (!existed) {
        await writable.close().catch(() => {});
        await dir.removeEntry(filename).catch(() => {});
      }
      throw e;
    }
    // close() はトランザクションのコミット相当。失敗時はエラーを伝播する
    await writable.close();
  }

  async removeFile(path: string): Promise<void> {
    const segments = pathSegments(path);
    const filename = segments.pop();
    if (!filename) return;
    try {
      const dir = await this.getDirectoryHandle(segments.join('/'), false);
      await dir.removeEntry(filename);
    } catch (e) {
      // 冪等: 既に無い / 親ディレクトリが無い場合は成功扱い (Rollback の再実行に必要)
      if (isNotFoundError(e)) return;
      throw e;
    }
  }

  async exists(path: string): Promise<boolean> {
    const segments = pathSegments(path);
    const last = segments.pop();
    if (!last) return true; // ルート自身
    try {
      const dir = await this.getDirectoryHandle(segments.join('/'), false);
      await dir.getFileHandle(last);
      return true;
    } catch (e) {
      if (isNotFoundError(e) || isTypeMismatchError(e)) return false;
      throw e;
    }
  }
}
