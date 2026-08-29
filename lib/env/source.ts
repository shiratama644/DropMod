/**
 * EnvironmentSource 抽象レイヤー (PHASE11_PLAN.md §10.3, ChatGPT #14)。
 *
 * Chromium (File System Access API) と ZIP フォールバックで共通の
 * インターフェースを提供し、上位ロジック (Detector / Analyzer /
 * Profile Builder) はブラウザ差を意識せず動作させる。
 *
 * 計画書の interface からの方針維持点 / 変更点:
 *   - readFile / listFiles / listDirectories / exists / kind は計画どおり。
 *   - `root: FileSystemDirectoryHandle | JSZip` は公開しない
 *     (実装の漏出 + JSZip 型の汚染を避けるため)。代わりに
 *     プロファイル名自動生成 (§6.1) に必要な `rootName` のみ公開する。
 *
 * Phase 11 は Read-only: 書き込み API (Sink) は持たない (Phase 12 で追加)。
 */

/** パスは常にルート相対・'/' 区切り (例: 'mods/sodium.jar') */
export interface EnvironmentSource {
  /** ソース種別 (UI 分岐・ログ用) */
  kind: 'filesystem' | 'zip';
  /** ルートの表示名 (フォルダ名 / ZIP ファイル名)。Profile 名自動生成に使う */
  rootName: string;

  /** ファイルを読み込む。存在しない場合は NotFoundError 的な Error を throw */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * subdir 内のファイル名一覧 (非再帰・名前順)。
   * subdir が存在しない場合は空配列を返す (§4.3: 対象ディレクトリが
   * 無い場合はエラーとせず「空」として継続)。
   */
  listFiles(subdir: string): Promise<string[]>;

  /** subdir 内のディレクトリ名一覧 (非再帰・名前順)。無ければ空配列 */
  listDirectories(subdir: string): Promise<string[]>;

  /** ファイルまたはディレクトリが存在するか */
  exists(path: string): Promise<boolean>;
}

/** File System Access API の NotFound 判定 (Chromium は DOMException) */
export function isNotFoundError(e: unknown): boolean {
  return isDomExceptionOf(e, 'NotFoundError');
}

/** File System Access API の型不一致判定 (ファイル≠ディレクトリ) */
function isTypeMismatchError(e: unknown): boolean {
  return isDomExceptionOf(e, 'TypeMismatchError');
}

function isDomExceptionOf(e: unknown, name: string): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    e instanceof DOMException &&
    e.name === name
  );
}

/** パスをセグメント配列に正規化 (''・'.'・末尾スラッシュを除去) */
export function pathSegments(path: string): string[] {
  return path
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');
}

/**
 * File System Access API (FileSystemDirectoryHandle) のラッパー実装。
 *
 * - すべての読み取りは 'read' 権限のみで動く (Phase 11 の絶対原則)
 * - フォルダ権限は showDirectoryPicker で既に付与済みの想定
 *   (ハンドルは `lib/env/picker.ts` 経由で取得する)
 */
export class FileSystemSource implements EnvironmentSource {
  readonly kind = 'filesystem' as const;

  constructor(
    private readonly rootHandle: FileSystemDirectoryHandle,
    readonly rootName: string
  ) {}

  /** path (ディレクトリ) まで階層を辿る */
  private async getDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle> {
    let dir = this.rootHandle;
    for (const segment of pathSegments(path)) {
      dir = await dir.getDirectoryHandle(segment);
    }
    return dir;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const segments = pathSegments(path);
    const filename = segments.pop();
    if (!filename) {
      throw new Error(`EnvironmentSource.readFile: 不正なパス '${path}'`);
    }
    const dir = await this.getDirectoryHandle(segments.join('/'));
    const fileHandle = await dir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async listFiles(subdir: string): Promise<string[]> {
    try {
      const dir = await this.getDirectoryHandle(subdir);
      const names: string[] = [];
      for await (const entry of dir.values()) {
        if (entry.kind === 'file') names.push(entry.name);
      }
      return names.sort();
    } catch (e) {
      if (isNotFoundError(e)) return [];
      throw e;
    }
  }

  async listDirectories(subdir: string): Promise<string[]> {
    try {
      const dir = await this.getDirectoryHandle(subdir);
      const names: string[] = [];
      for await (const entry of dir.values()) {
        if (entry.kind === 'directory') names.push(entry.name);
      }
      return names.sort();
    } catch (e) {
      if (isNotFoundError(e)) return [];
      throw e;
    }
  }

  async exists(path: string): Promise<boolean> {
    const segments = pathSegments(path);
    const last = segments.pop();
    if (!last) return true; // ルート自身
    try {
      const parent = await this.getDirectoryHandle(segments.join('/'));
      try {
        await parent.getFileHandle(last);
        return true;
      } catch (e) {
        // NotFound = ファイル無し。TypeMismatch = 存在するがファイルではない
        // (ディレクトリ)。どちらも下のディレクトリ確認へフォールスルー。
        if (!isNotFoundError(e) && !isTypeMismatchError(e)) throw e;
      }
      await parent.getDirectoryHandle(last);
      return true;
    } catch (e) {
      if (isNotFoundError(e) || isTypeMismatchError(e)) return false;
      throw e;
    }
  }
}
