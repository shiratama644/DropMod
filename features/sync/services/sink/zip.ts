/**
 * ZipSink (Phase 12-C / PHASE12_PLAN.md §10.1)。
 *
 * > Chromium: `FileSystemSink` による Direct Write
 * > **Firefox / Safari / モバイル: `ZipSink` (既存 useZipExport の拡張)**
 *
 * File System Access API が無いブラウザではフォルダへ直接書き込めない。
 * ZipSink は **書き込みをメモリ上に溜め、最後に 1 つの ZIP として吐き出す**。
 * ユーザーはそれを展開して .minecraft に反映する。
 *
 * ## 既存の「ZIP で書き出す」との違い
 *
 * `useZipExport` は「Profile の全 Mod を ZIP にする」だけの一方通行。
 * ZipSink は `EnvironmentSink` を実装しているので、**Executor / Transaction
 * Journal / Backup / Rollback がそのまま動く**。途中失敗したら巻き戻る。
 *
 * ## 初期内容 (seed) の意味
 *
 * `update` / `delete` は「環境に今ある実体」を読んで Backup する。
 * 何も seed しないと `readFile` は常に null になり、
 * Executor は `missing` として**全件スキップ**してしまう。
 * 既存の .minecraft ZIP を読み込んで seed してから使うこと。
 *
 * ## D-2: ZipSink へ自動で切り替えない
 *
 * `ensureWritable()` は常に true を返すが、これは「権限モデルが存在しない」
 * だけで「Direct Write の代わりになる」意味ではない。**切り替えの判断は
 * 必ずユーザーが行う** (呼び出し側が明示的に ZipSink を作る)。
 */

import JSZip from 'jszip';
import type { EnvironmentSink } from '../sink';

export type ZipSinkSeed =
  | Map<string, Uint8Array>
  | Record<string, Uint8Array>
  | readonly { path: string; data: Uint8Array }[];

/**
 * パスを正規化する。
 *
 * - 先頭の `/` を落とす (ZIP 内の絶対パスは無い)
 * - `\` を `/` に統一
 * - `..` でルートから**逃げるパスは拒否** (zip slip 対策)
 */
export function normalizeZipPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter((s) => s.length > 0 && s !== '.');

  // `..` は**前のセグメントを畳む**のであって、捨てるのではない。
  // (捨てるだけだと `mods/sub/../a.jar` → `mods/sub/a.jar` となり別ファイルになる)
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '..') {
      if (resolved.length === 0) {
        // ルートより上へ出ようとしたら拒否
        throw new Error(`ルートより上のパスには書き込めません: ${path}`);
      }
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }

  return resolved.join('/');
}

/**
 * JSZip に渡す形に整える。
 *
 * JSZip は `instanceof Uint8Array` / `instanceof ArrayBuffer` で型を判定するため、
 * **別の realm で作られた配列をそのまま渡すと「Can't read the data」と弾かれる**
 * (Node の `TextEncoder` が返す Uint8Array が典型)。ここで自分の realm の
 * Uint8Array に作り直すことで確実に通す。
 */
function toJsZipData(data: Uint8Array): Uint8Array {
  return new Uint8Array(data);
}

export class ZipSink implements EnvironmentSink {
  readonly kind = 'zip' as const;
  readonly rootName: string;

  /** 直近の ensureWritable() の結果 */
  #writable = false;
  readonly #files = new Map<string, Uint8Array>();

  constructor(rootName = 'minecraft-sync.zip', seed?: ZipSinkSeed) {
    this.rootName = rootName;
    if (seed) {
      if (seed instanceof Map) {
        for (const [path, data] of seed) this.#files.set(normalizeZipPath(path), data);
      } else if (Array.isArray(seed)) {
        for (const entry of seed) {
          this.#files.set(normalizeZipPath(entry.path), entry.data);
        }
      } else {
        for (const [path, data] of Object.entries(seed)) {
          this.#files.set(normalizeZipPath(path), data);
        }
      }
    }
  }

  get writable(): boolean {
    return this.#writable;
  }

  /**
   * ZipSink には権限モデルが無いので常に true。
   *
   * **これは「Direct Write の代わりになる」意味ではない** (D-2 参照)。
   */
  async ensureWritable(): Promise<boolean> {
    this.#writable = true;
    return true;
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    return this.#files.get(normalizeZipPath(path)) ?? null;
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.#files.set(normalizeZipPath(path), data);
  }

  /** 存在しなければ何もしない (冪等。Rollback の再実行に必要) */
  async removeFile(path: string): Promise<void> {
    this.#files.delete(normalizeZipPath(path));
  }

  async exists(path: string): Promise<boolean> {
    return this.#files.has(normalizeZipPath(path));
  }

  /** 現在の内容 (テスト・デバッグ用) */
  snapshot(): Record<string, Uint8Array> {
    return Object.fromEntries(this.#files);
  }

  /** 管理しているファイル数 */
  get size(): number {
    return this.#files.size;
  }

  /** 合計バイト数 (Preview の容量表示用) */
  byteLength(): number {
    let total = 0;
    for (const data of this.#files.values()) total += data.byteLength;
    return total;
  }

  /**
   * 現在の内容を ZIP Blob にする。
   *
   * 空でも呼べる (空 ZIP が返る)。呼び出し側は「何も変わりませんでした」と
   * 出せるように `size === 0` を先に確認すること。
   */
  async toBlob(compression: 'STORE' | 'DEFLATE' = 'DEFLATE'): Promise<Blob> {
    const zip = new JSZip();
    // パス順に追加する (生成結果が安定する)
    for (const path of [...this.#files.keys()].sort()) {
      const data = this.#files.get(path);
      if (data) zip.file(path, toJsZipData(data));
    }
    return zip.generateAsync({ type: 'blob', compression });
  }

  /**
   * 既存の .minecraft ZIP を読み込んで seed する。
   *
   * **3 カテゴリ以外のファイルも保持する**。ZipSink は最後に ZIP 全体を吐くので、
   * `config/` などを落とすとユーザーの環境が壊れる。台帳化 (Sync の削除対象化) は
   * 別の話で、こちらは**コピーするだけ**。
   */
  static async fromZipBlob(blob: Blob, rootName?: string): Promise<ZipSink> {
    const zip = await JSZip.loadAsync(blob);
    const entries: Array<{ path: string; data: Uint8Array }> = [];

    const paths = Object.keys(zip.files).filter((p) => !zip.files[p]?.dir).sort();
    for (const path of paths) {
      const file = zip.file(path);
      if (!file) continue;
      entries.push({ path, data: await file.async('uint8array') });
    }

    return new ZipSink(rootName, entries);
  }
}
