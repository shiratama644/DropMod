/** File System Access API (Chromium)。Phase 11 は read のみ。 */
interface Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}
