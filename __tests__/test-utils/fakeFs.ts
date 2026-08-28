/**
 * File System Access API のテスト用 Fake 実装。
 *
 * `createFakeFileSystem(files)` に `Record<パス, 内容>` を渡すと
 * FileSystemDirectoryHandle 互換のツリーを構築する。
 * Detector / Analyzer / Source (Phase 11) および
 * **Sink / Backup / Executor (Phase 12-B)** のテストで使用する。
 *
 * ※ `values()` は本物同様にファイル・ディレクトリ混在で名前順に列挙する。
 * ※ NotFound は本物同様に name='NotFoundError' の DOMException。
 * ※ **Phase 12-B で書き込み系を追加**: `createWritable()` / `removeEntry()` /
 *   `get*Handle(name, { create: true })` / `queryPermission` / `requestPermission`。
 *   既存 (Phase 11) テストの挙動は変えていない。
 */

interface FakeHandleBase {
  kind: 'file' | 'directory';
  name: string;
}

/** `createWritable()` が返す Fake ストリーム。`close()` でコミットする */
class FakeWritableStream {
  private readonly chunks: Uint8Array[] = [];
  private closed = false;

  constructor(private readonly commit: (data: Uint8Array) => void) {}

  async write(data: ArrayBuffer | Uint8Array): Promise<void> {
    if (this.closed) throw new DOMException('stream is closed', 'InvalidStateError');
    this.chunks.push(
      data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0))
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const total = this.chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // 本物同様、close() がトランザクションのコミット相当
    this.commit(merged);
  }
}

export class FakeFileHandle implements FakeHandleBase {
  readonly kind = 'file' as const;
  private current: Uint8Array;

  constructor(
    readonly name: string,
    content: Uint8Array,
    readonly lastModified: number = 0
  ) {
    this.current = content;
  }

  /** 現在の内容 (テストのアサーション用) */
  get content(): Uint8Array {
    return this.current;
  }

  /** FakeWritableStream のコミット先 */
  replaceContent(data: Uint8Array): void {
    this.current = data;
  }

  async getFile(): Promise<File> {
    // jsdom の File は arrayBuffer() を実装していないため、必要な
    // メンバのみを持つ File 互換オブジェクトを返す (実ブラウザでは
    // 本物の File と同じ形で FileSystemSource から使われる)。
    const content = this.current;
    return {
      name: this.name,
      lastModified: this.lastModified,
      size: content.byteLength,
      type: '',
      arrayBuffer: async () => content.slice().buffer
    } as unknown as File;
  }

  /** Phase 12-B: 書き込みストリームを生成する */
  async createWritable(): Promise<FakeWritableStream> {
    return new FakeWritableStream((data) => this.replaceContent(data));
  }
}

interface FakeDirHandle extends FakeHandleBase {
  kind: 'directory';
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFileHandle>;
  values(): AsyncIterableIterator<FakeFileHandle | FakeDirHandle>;
}

class FakeDirectoryHandle implements FakeDirHandle {
  readonly kind = 'directory' as const;
  private readonly children = new Map<string, FakeFileHandle | FakeDirectoryHandle>();

  /** Phase 12-B: `queryPermission` の応答 (テストで設定) */
  permissionState: PermissionState = 'granted';
  /**
   * Phase 12-B: `requestPermission` の応答。未設定なら `permissionState` を返す。
   * 「query は prompt だが要求すれば granted になる」シナリオを表現するために分ける。
   */
  requestPermissionResult?: PermissionState;
  /** requestPermission を呼ばれた回数 (D-2 のテストで「再要求しない」を確認) */
  requestPermissionCalls = 0;

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

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FakeDirectoryHandle> {
    if (options?.create) return this.directory(name);
    return this.require(name, 'directory') as FakeDirectoryHandle;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FakeFileHandle> {
    if (options?.create) {
      const existing = this.children.get(name);
      if (existing && existing.kind === 'file') return existing;
      if (existing) {
        throw new DOMException(
          `The requested path '${name}' exists but is not a file.`,
          'TypeMismatchError'
        );
      }
      const created = new FakeFileHandle(name, new Uint8Array(0));
      this.children.set(name, created);
      return created;
    }
    return this.require(name, 'file') as FakeFileHandle;
  }

  /** Phase 12-B: エントリを削除する。無ければ NotFoundError (本物同様) */
  async removeEntry(name: string): Promise<void> {
    if (!this.children.has(name)) {
      throw new DOMException(
        `A requested file or directory could not be found: '${name}'`,
        'NotFoundError'
      );
    }
    this.children.delete(name);
  }

  /** Phase 12-B: 権限確認。既定は granted */
  async queryPermission(): Promise<PermissionState> {
    return this.permissionState;
  }

  /** Phase 12-B: 権限要求。`requestPermissionResult` (無ければ `permissionState`) を返す */
  async requestPermission(): Promise<PermissionState> {
    this.requestPermissionCalls += 1;
    return this.requestPermissionResult ?? this.permissionState;
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

export interface CreateFakeFileSystemOptions {
  /** `queryPermission` の初期値 (既定 'granted'。D-2 のテストで 'prompt' / 'denied' にする) */
  permissionState?: PermissionState;
  /** `requestPermission` の応答 (既定は `permissionState` と同じ) */
  requestPermissionResult?: PermissionState;
}

/**
 * パス → 内容 の Record から Fake ファイルツリーを構築。
 * 例: { 'mods/a.jar': new Uint8Array([1]), 'versions/x/x.json': '{}' }
 */
export function createFakeFileSystem(
  files: Record<string, string | Uint8Array>,
  rootName = '.minecraft',
  options: CreateFakeFileSystemOptions = {}
): FileSystemDirectoryHandle {
  const root = new FakeDirectoryHandle(rootName);
  root.permissionState = options.permissionState ?? 'granted';
  root.requestPermissionResult = options.requestPermissionResult;
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
  // FileSystemDirectoryHandle との構造的互換は本 Fake が提供する範囲で十分。
  return root as unknown as FileSystemDirectoryHandle;
}

/**
 * Fake ルートを型安全に取り出す (権限の状態変更や内容アサーション用)。
 * `createFakeFileSystem` の戻り値はキャスト済みなので、ここで戻す。
 */
export function asFakeDirectory(handle: FileSystemDirectoryHandle): FakeDirectoryHandle {
  return handle as unknown as FakeDirectoryHandle;
}

/** Fake ツリー内のファイル内容を取得する (無ければ null) */
export function readFakeFile(
  handle: FileSystemDirectoryHandle,
  path: string
): Uint8Array | null {
  const segments = path.split('/').filter(Boolean);
  const filename = segments.pop();
  if (!filename) return null;
  let dir = asFakeDirectory(handle);
  for (const segment of segments) {
    const next = (dir as unknown as { children?: Map<string, unknown> }).children?.get(segment);
    if (!next || (next as { kind: string }).kind !== 'directory') return null;
    dir = next as FakeDirectoryHandle;
  }
  const file = (dir as unknown as { children?: Map<string, FakeFileHandle> }).children?.get(
    filename
  );
  return file && file.kind === 'file' ? file.content : null;
}
