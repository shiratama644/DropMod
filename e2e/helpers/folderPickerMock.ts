/**
 * E2E ヘルパー: window.showDirectoryPicker のモック (Phase 11-C / **Phase 12-E2E で拡張**)
 *
 * Playwright は File System Access API のネイティブピッカーを操作できない
 * ため、page.addInitScript で「メモリ上の fake ファイルツリー」を返す
 * window.showDirectoryPicker を差し替える (PHASE11_PLAN.md 11-C の
 * `__e2e_mock_handle__` 案)。
 *
 * ## Phase 12-E2E: 書き込み対応
 *
 * Phase 11 までは **読むだけ** (Import) だった。Sync の E2E には書き込みが
 * 必要なので、`FileSystemSink` / `OpfsBackupStore` が実際に叩く API を実装した:
 *
 * | 対象 | API |
 * | --- | --- |
 * | DirHandle | `getDirectoryHandle(name, {create})` / `getFileHandle(name, {create})` / `removeEntry(name, {recursive})` / `values()` / `queryPermission` / `requestPermission` |
 * | FileHandle | `getFile()` / `createWritable()` → `{write, close}` |
 * | OPFS | `navigator.storage.getDirectory()` (Backup 用) |
 *
 * ## 障害注入
 *
 * `failWritesFor` にパスを入れると、そのパスへの `write()` が例外になる。
 * Sync の **Rollback** を E2E で検証するために使う。
 *
 * ## 読み出し
 *
 * spec 側から結果を確認できるよう、以下を window に露出する:
 * - `__e2e_mock_handle__`   : ルートの DirHandle (従来どおり)
 * - `__e2e_read_file__(path)`: 内容文字列 or `null`
 * - `__e2e_list_files__()`  : 全ファイルパス (ソート済み)
 *
 * ※ addInitScript はページのスクリプトより先に走るため、アプリの
 *   `supportsDirectoryPicker()` 判定にも反映される。
 * ※ スクリプトはブラウザ側で実行されるため文字列として注入する
 *   (プロジェクトの TS strict / biome noExplicitAny の対象外にするため)。
 */

import type { Page } from '@playwright/test';

export interface FolderPickerMockOptions {
  /**
   * このパスへの書き込みを失敗させる (Sync の Rollback 検証用)。
   * パスはルートからの相対 (`mods/a.jar`)。
   */
  failWritesFor?: readonly string[];
  /**
   * `queryPermission` / `requestPermission` の戻り値。
   * 既定は `'granted'`。`'denied'` にすると **D-2 (Read-only fallback)** を検証できる。
   */
  permission?: 'granted' | 'denied' | 'prompt';
  /** OPFS (`navigator.storage.getDirectory()`) をモックするか。既定 true */
  withOpfs?: boolean;
}

/**
 * @param rootName ピッカーで選ばれた「フォルダ名」(プロファイル名自動生成に使われる)
 * @param files path → テキスト内容 のマップ
 */
export async function installFolderPickerMock(
  page: Page,
  rootName: string,
  files: Record<string, string>,
  options: FolderPickerMockOptions = {}
): Promise<void> {
  const script = `
(() => {
  const rootName = ${JSON.stringify(rootName)};
  const files = ${JSON.stringify(files)};
  const failWritesFor = new Set(${JSON.stringify(options.failWritesFor ?? [])});
  const PERMISSION = ${JSON.stringify(options.permission ?? 'granted')};
  const WITH_OPFS = ${JSON.stringify(options.withOpfs ?? true)};

  class MockWritableStream {
    constructor(handle, fullPath) {
      this.handle = handle;
      this.fullPath = fullPath;
      this.chunks = [];
    }
    async write(data) {
      // 障害注入: 指定パスへの書き込みを失敗させる
      if (failWritesFor.has(this.fullPath)) {
        throw new DOMException('E2E 注入: 書き込み失敗 (' + this.fullPath + ')', 'NotAllowedError');
      }
      if (typeof data === 'string') {
        this.chunks.push(new TextEncoder().encode(data));
      } else if (data instanceof ArrayBuffer) {
        this.chunks.push(new Uint8Array(data));
      } else if (ArrayBuffer.isView(data)) {
        this.chunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      } else if (data && typeof data.arrayBuffer === 'function') {
        this.chunks.push(new Uint8Array(await data.arrayBuffer()));
      } else {
        throw new Error('unsupported write chunk');
      }
    }
    async close() {
      let total = 0;
      for (const c of this.chunks) total += c.byteLength;
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of this.chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }
      this.handle.content = merged;
    }
  }

  class MockFileHandle {
    constructor(name, content, fullPath) {
      this.kind = 'file';
      this.name = name;
      this.fullPath = fullPath;
      // content は Uint8Array で持つ (write で上書きされる)
      this.content =
        typeof content === 'string' ? new TextEncoder().encode(content) : content;
    }
    async getFile() {
      // File のコピーを渡す (呼び出し側の変更が元データに影響しないように)
      return new File([this.content.slice()], this.name, {
        type: 'application/octet-stream'
      });
    }
    async createWritable() {
      return new MockWritableStream(this, this.fullPath);
    }
  }

  class MockDirHandle {
    constructor(name, parentPath) {
      this.kind = 'directory';
      this.name = name;
      this.path = parentPath ? parentPath + '/' + name : name;
      this.children = new Map();
    }
    /** 子ディレクトリを取得 or 生成 (内部用) */
    directory(name) {
      const existing = this.children.get(name);
      if (existing && existing.kind === 'directory') return existing;
      const created = new MockDirHandle(name, this.path === this.name ? '' : this.path);
      this.children.set(name, created);
      return created;
    }
    addFile(name, content) {
      const fullPath = (this.path === this.name ? '' : this.path)
        ? this.path + '/' + name
        : name;
      this.children.set(name, new MockFileHandle(name, content, fullPath));
    }
    async getDirectoryHandle(name, opts) {
      const child = this.children.get(name);
      if (child && child.kind === 'directory') return child;
      if (child || !(opts && opts.create)) {
        throw new DOMException('Not found: ' + name, 'NotFoundError');
      }
      return this.directory(name);
    }
    async getFileHandle(name, opts) {
      const child = this.children.get(name);
      if (child && child.kind === 'file') return child;
      if (child || !(opts && opts.create)) {
        throw new DOMException('Not found: ' + name, 'NotFoundError');
      }
      const fullPath = (this.path === this.name ? '' : this.path)
        ? this.path + '/' + name
        : name;
      const created = new MockFileHandle(name, new Uint8Array(0), fullPath);
      this.children.set(name, created);
      return created;
    }
    async removeEntry(name, opts) {
      const child = this.children.get(name);
      if (!child) {
        throw new DOMException('Not found: ' + name, 'NotFoundError');
      }
      if (child.kind === 'directory' && !(opts && opts.recursive)) {
        throw new DOMException('Invalid modification: ' + name, 'InvalidModificationError');
      }
      this.children.delete(name);
    }
    async queryPermission() {
      return PERMISSION;
    }
    async requestPermission() {
      return PERMISSION;
    }
    values() {
      const entries = [...this.children.values()].sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      );
      let index = 0;
      const iterator = {
        next: async () =>
          index < entries.length
            ? { done: false, value: entries[index++] }
            : { done: true, value: undefined },
        [Symbol.asyncIterator]: () => iterator
      };
      return iterator;
    }
  }

  /** ルートは path を持たない (相対パスの基準) */
  const root = new MockDirHandle(rootName, '');
  root.path = '';
  for (const [path, content] of Object.entries(files)) {
    const segments = path.split('/').filter(Boolean);
    const filename = segments.pop();
    if (!filename) continue;
    let dir = root;
    for (const segment of segments) {
      dir = dir.directory(segment);
    }
    dir.addFile(filename, content);
  }

  // ---- spec からの読み出し用 ----
  function walk(dir, prefix, out) {
    for (const child of dir.children.values()) {
      const p = prefix ? prefix + '/' + child.name : child.name;
      if (child.kind === 'directory') walk(child, p, out);
      else out.push([p, child]);
    }
    return out;
  }

  window.__e2e_mock_handle__ = root;
  window.__e2e_list_files__ = () => walk(root, '', []).map(([p]) => p).sort();
  window.__e2e_read_file__ = (path) => {
    const hit = walk(root, '', []).find(([p]) => p === path);
    return hit ? new TextDecoder().decode(hit[1].content) : null;
  };

  window.showDirectoryPicker = async () => root;

  // ---- OPFS (Backup 用) ----
  if (WITH_OPFS && typeof navigator !== 'undefined') {
    const opfsRoot = new MockDirHandle('opfs', '');
    opfsRoot.path = '';
    if (!navigator.storage) {
      Object.defineProperty(navigator, 'storage', {
        value: {},
        configurable: true
      });
    }
    navigator.storage.getDirectory = async () => opfsRoot;
    window.__e2e_opfs_root__ = opfsRoot;
    window.__e2e_opfs_list__ = () => walk(opfsRoot, '', []).map(([p]) => p).sort();
  }
})();
`;
  await page.addInitScript(script);
}

/**
 * Sync 後にモック内のファイル一覧を読む (spec 側の表明用)。
 *
 * `page.evaluate` を直接書くと型が `any` になるので、ここで型を固定する。
 */
export async function listMockFiles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const fn = (window as unknown as { __e2e_list_files__?: () => string[] })
      .__e2e_list_files__;
    return fn ? fn() : [];
  });
}

/** モック内のファイル内容を読む。無ければ null */
export async function readMockFile(page: Page, path: string): Promise<string | null> {
  return page.evaluate((p) => {
    const fn = (window as unknown as { __e2e_read_file__?: (path: string) => string | null })
      .__e2e_read_file__;
    return fn ? fn(p) : null;
  }, path);
}

/** OPFS (Backup) 内のファイル一覧を読む */
export async function listOpfsFiles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const fn = (window as unknown as { __e2e_opfs_list__?: () => string[] }).__e2e_opfs_list__;
    return fn ? fn() : [];
  });
}
