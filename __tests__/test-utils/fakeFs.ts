/**
 * File System Access API のテスト用 Fake 実装 (Phase 11-B)。
 *
 * `createFakeFileSystem(files)` に `Record<パス, 内容>` を渡すと
 * FileSystemDirectoryHandle 互換のツリーを構築する。
 * Detector / Analyzer / Source のテストで使用する。
 *
 * ※ `values()` は本物同様にファイル・ディレクトリ混在で名前順に列挙する。
 * ※ NotFound は本物同様に name='NotFoundError' の DOMException。
 */

interface FakeHandleBase {
  kind: 'file' | 'directory';
  name: string;
}

export class FakeFileHandle implements FakeHandleBase {
  readonly kind = 'file' as const;
  constructor(
    readonly name: string,
    private readonly content: Uint8Array,
    readonly lastModified: number = 0
  ) {}

  async getFile(): Promise<File> {
    // jsdom の File は arrayBuffer() を実装していないため、必要な
    // メンバのみを持つ File 互換オブジェクトを返す (実ブラウザでは
    // 本物の File と同じ形で FileSystemSource から使われる)。
    const content = this.content;
    return {
      name: this.name,
      lastModified: this.lastModified,
      size: content.byteLength,
      type: '',
      arrayBuffer: async () => content.slice().buffer
    } as unknown as File;
  }
}

interface FakeDirHandle extends FakeHandleBase {
  kind: 'directory';
  getDirectoryHandle(name: string): Promise<FakeDirHandle>;
  getFileHandle(name: string): Promise<FakeFileHandle>;
  values(): AsyncIterableIterator<FakeFileHandle | FakeDirHandle>;
}

class FakeDirectoryHandle implements FakeDirHandle {
  readonly kind = 'directory' as const;
  private readonly children = new Map<string, FakeFileHandle | FakeDirectoryHandle>();

  constructor(readonly name: string) {}

  /** テスト構築用: 子を登録 */
  add(child: FakeFileHandle | FakeDirectoryHandle): this {
    if (!this.children.has(child.name)) {
      this.children.set(child.name, child);
    }
    return this;
  }

  /** 子ディレクトリを取得 (無ければ作成して返す) — テスト構築用 */
  directory(name: string): FakeDirectoryHandle {
    const existing = this.children.get(name);
    if (existing && existing.kind === 'directory') return existing;
    const created = new FakeDirectoryHandle(name);
    this.children.set(name, created);
    return created;
  }

  private require(name: string, kind: 'file' | 'directory'): unknown {
    const found = this.children.get(name);
    if (!found) {
      throw new DOMException(
        `A requested file or directory could not be found: '${name}'`,
        'NotFoundError'
      );
    }
    if (found.kind !== kind) {
      throw new DOMException(
        `The requested path '${name}' exists but is not a ${kind}.`,
        'TypeMismatchError'
      );
    }
    return found;
  }

  async getDirectoryHandle(name: string): Promise<FakeDirectoryHandle> {
    return this.require(name, 'directory') as FakeDirectoryHandle;
  }

  async getFileHandle(name: string): Promise<FakeFileHandle> {
    return this.require(name, 'file') as FakeFileHandle;
  }

  values(): AsyncIterableIterator<FakeFileHandle | FakeDirectoryHandle> {
    const entries = [...this.children.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    let index = 0;
    const iterator: AsyncIterableIterator<FakeFileHandle | FakeDirectoryHandle> = {
      next: async () =>
        index < entries.length
          ? { done: false, value: entries[index++]! }
          : { done: true, value: undefined },
      [Symbol.asyncIterator]() {
        return iterator;
      }
    };
    return iterator;
  }
}

function toContent(raw: string | Uint8Array): Uint8Array {
  return typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;
}

/**
 * パス → 内容 の Record から Fake ファイルツリーを構築。
 * 例: { 'mods/a.jar': new Uint8Array([1]), 'versions/x/x.json': '{}' }
 */
export function createFakeFileSystem(
  files: Record<string, string | Uint8Array>,
  rootName = '.minecraft'
): FileSystemDirectoryHandle {
  const root = new FakeDirectoryHandle(rootName);
  for (const [path, content] of Object.entries(files)) {
    const segments = path.split('/').filter(Boolean);
    const filename = segments.pop();
    if (!filename) continue;
    let dir = root;
    for (const segment of segments) {
      dir = dir.directory(segment);
    }
    dir.add(new FakeFileHandle(filename, toContent(content)));
  }
  // FileSystemFileHandle.createWritable 等は Phase 11 (Read-only) では
  // 使わないため、構造的互換は readFile/list 系のみで十分。キャストして返す。
  return root as unknown as FileSystemDirectoryHandle;
}
