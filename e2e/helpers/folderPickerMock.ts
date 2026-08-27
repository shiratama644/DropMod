/**
 * E2E ヘルパー: window.showDirectoryPicker のモック (Phase 11-C)
 *
 * Playwright は File System Access API のネイティブピッカーを操作できない
 * ため、page.addInitScript で「メモリ上の fake ファイルツリー」を返す
 * window.showDirectoryPicker を差し替える (PHASE11_PLAN.md 11-C の
 * __e2e_mock_handle__ 案)。
 *
 * DropMod の FileSystemSource が使う API のみを実装する:
 *   - handle.name / kind
 *   - getDirectoryHandle(name) / getFileHandle(name) (NotFound は DOMException)
 *   - values() (async iterator。kind/name を持つ entry を列挙)
 *   - FileHandle.getFile() → File (実 Chromium なので arrayBuffer が使える)
 *
 * ※ addInitScript はページのスクリプトより先に走るため、アプリの
 *   supportsDirectoryPicker() 判定にも反映される。
 * ※ スクリプトはブラウザ側で実行されるため文字列として注入する
 *   (プロジェクトの TS strict / biome noExplicitAny の対象外にするため)。
 */

import type { Page } from '@playwright/test';

/**
 * @param rootName ピッカーで選ばれた「フォルダ名」(プロファイル名自動生成に使われる)
 * @param files path → テキスト内容 のマップ
 */
export async function installFolderPickerMock(
  page: Page,
  rootName: string,
  files: Record<string, string>
): Promise<void> {
  const script = `
(() => {
  const rootName = ${JSON.stringify(rootName)};
  const files = ${JSON.stringify(files)};

  class MockFileHandle {
    constructor(name, content) {
      this.kind = 'file';
      this.name = name;
      this.content = content;
    }
    async getFile() {
      return new File([this.content], this.name, {
        type: 'application/octet-stream'
      });
    }
  }

  class MockDirHandle {
    constructor(name) {
      this.kind = 'directory';
      this.name = name;
      this.children = new Map();
    }
    directory(name) {
      const existing = this.children.get(name);
      if (existing && existing.kind === 'directory') return existing;
      const created = new MockDirHandle(name);
      this.children.set(name, created);
      return created;
    }
    addFile(name, content) {
      this.children.set(name, new MockFileHandle(name, content));
    }
    async getDirectoryHandle(name) {
      const child = this.children.get(name);
      if (!child || child.kind !== 'directory') {
        throw new DOMException('Not found: ' + name, 'NotFoundError');
      }
      return child;
    }
    async getFileHandle(name) {
      const child = this.children.get(name);
      if (!child || child.kind !== 'file') {
        throw new DOMException('Not found: ' + name, 'NotFoundError');
      }
      return child;
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

  const root = new MockDirHandle(rootName);
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

  // 識別用フラグ (spec 側でモックが効いているか確認できる)
  window.__e2e_mock_handle__ = root;
  window.showDirectoryPicker = async () => root;
})();
`;
  await page.addInitScript(script);
}
