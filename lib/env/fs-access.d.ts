/** File System Access API (Chromium)。Phase 11 は read のみ。 */
interface Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
}

/**
 * TS 5.9 の lib.dom は FileSystemDirectoryHandle の async iterator
 * (values / keys / entries) を宣言していないため補完する。
 * (Chromium 実装は.AsyncIterable 準拠。実行時に無ければ polyfill 相当の
 *  ループは使わない = Chromium 専用コードパスのため実害なし)
 */
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
  keys(): AsyncIterableIterator<string>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}
