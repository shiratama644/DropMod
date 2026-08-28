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

/**
 * File System Access API の権限 API (Phase 12-B)。
 *
 * TS 5.9 の lib.dom は `FileSystemHandle.queryPermission` /
 * `requestPermission` を宣言していない (Chromium 独自拡張のため) ので補完する。
 * Sync 実行前に 'read' → 'readwrite' への昇格を確認するのに使う。
 * 昇格に失敗しても throw せず false を返すのが DropMod の方針 (D-2)。
 */
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}
