/**
 * Executor 用のインメモリ・テストダブル (Phase 12-B)。
 *
 * - `MemorySink`         … `EnvironmentSink` のメモリ実装
 * - `MemoryBackupStore`  … `BackupStore` のメモリ実装 (OPFS 不要)
 *
 * jsdom には `FileSystemDirectoryHandle` も `navigator.storage.getDirectory()` も
 * 存在しないため、Executor / Backup のロジックはこれらのダブルで検証する。
 * ブラウザ API との接続部 (`FileSystemSink` / `OpfsBackupStore`) は
 * `__tests__/lib/env/sink.filesystem.test.ts` / `backup.opfs.test.ts` で Fake に載せて検証する。
 */

import type {
  BackupTransactionSummary,
  BackupStore
} from '@/lib/env/backup';
import type { EnvironmentSink } from '@/lib/env/sink';

/** バイト列を比較用に文字列化する (Uint8Array は内容で比較できないため) */
function key(data: Uint8Array): string {
  return String.fromCharCode(...data);
}

export interface MemorySinkOptions {
  /** 初期ファイル (`path` → 内容) */
  files?: Record<string, string | Uint8Array>;
  /** `ensureWritable()` の返り値 (D-2 の Read-only フォールバック検証用) */
  writable?: boolean;
  /** `writeFile` で投げる例外 (Rollback 検証用) */
  failOnWrite?: string[];
  /** `removeFile` で投げる例外 */
  failOnRemove?: string[];
  rootName?: string;
}

export class MemorySink implements EnvironmentSink {
  kind = 'filesystem' as const;
  rootName: string;
  private readonly store = new Map<string, string>();
  private readonly expectWritable: boolean;
  private readonly failWrites: ReadonlySet<string>;
  private readonly failRemoves: ReadonlySet<string>;
  private writableState = false;

  /** 呼び出し履歴 (アサーション用) */
  readonly calls: string[] = [];

  constructor(options: MemorySinkOptions = {}) {
    this.rootName = options.rootName ?? 'memory-env';
    this.expectWritable = options.writable ?? true;
    this.failWrites = new Set(options.failOnWrite ?? []);
    this.failRemoves = new Set(options.failOnRemove ?? []);
    for (const [path, content] of Object.entries(options.files ?? {})) {
      this.store.set(path, typeof content === 'string' ? content : key(content));
    }
  }

  get writable(): boolean {
    return this.writableState;
  }

  async ensureWritable(): Promise<boolean> {
    this.calls.push('ensureWritable');
    this.writableState = this.expectWritable;
    return this.expectWritable;
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const content = this.store.get(path);
    if (content === undefined) return null;
    return new TextEncoder().encode(content);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.calls.push(`write:${path}`);
    if (this.failWrites.has(path)) {
      throw new Error(`MemorySink: 書き込みに失敗しました (${path})`);
    }
    this.store.set(path, key(data));
  }

  async removeFile(path: string): Promise<void> {
    this.calls.push(`remove:${path}`);
    if (this.failRemoves.has(path)) {
      throw new Error(`MemorySink: 削除に失敗しました (${path})`);
    }
    // 冪等: 存在しなくても成功
    this.store.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.store.has(path);
  }

  // ------------------------------------------------------------------
  // テスト用アクセス (Sink インターフェース外)
  // ------------------------------------------------------------------

  /** 現在の全ファイルを `path → 内容文字列` で返す (順序はパス昇順) */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const path of [...this.store.keys()].sort()) {
      out[path] = this.store.get(path) as string;
    }
    return out;
  }

  /** 特定のパスの内容 (無ければ undefined) */
  content(path: string): string | undefined {
    return this.store.get(path);
  }

  get size(): number {
    return this.store.size;
  }
}

export interface MemoryBackupStoreOptions {
  files?: Record<string, string | Uint8Array>;
  /** 指定した txId への save で例外を投げる (quota 枯渇の模擬) */
  failOnSave?: string[];
}

export class MemoryBackupStore implements BackupStore {
  /** `txId` → (`filename` → 内容) */
  private readonly store = new Map<string, Map<string, string>>();
  /** `txId` → 最も古い保存時刻 (古い順判定用) */
  private readonly savedAt = new Map<string, number>();
  private readonly failSaves: ReadonlySet<string>;
  private clock: number;

  /** 呼び出し履歴 */
  readonly calls: string[] = [];

  constructor(options: MemoryBackupStoreOptions = {}) {
    this.failSaves = new Set(options.failOnSave ?? []);
    this.clock = 1_000_000;
    for (const [backupId, content] of Object.entries(options.files ?? {})) {
      const idx = backupId.indexOf('/');
      const txId = idx > 0 ? backupId.slice(0, idx) : backupId;
      const filename = idx > 0 ? backupId.slice(idx + 1) : 'root';
      const bucket = this.store.get(txId) ?? new Map<string, string>();
      bucket.set(filename, typeof content === 'string' ? content : key(content));
      this.store.set(txId, bucket);
      if (!this.savedAt.has(txId)) this.savedAt.set(txId, this.clock++);
    }
  }

  async save(txId: string, key2: string, data: Uint8Array): Promise<string> {
    this.calls.push(`save:${txId}:${key2}`);
    if (this.failSaves.has(txId)) {
      throw new Error(`MemoryBackupStore: 保存に失敗しました (${txId})`);
    }
    const bucket = this.store.get(txId) ?? new Map<string, string>();
    const filename = key2.split('/').filter(Boolean).join('__') || 'root';
    bucket.set(filename, key(data));
    this.store.set(txId, bucket);
    // OpfsBackupStore と同じく「最も古いファイルの更新時刻」を savedAt にする
    if (!this.savedAt.has(txId)) this.savedAt.set(txId, this.clock++);
    return `${txId}/${filename}`;
  }

  async load(backupId: string): Promise<Uint8Array | null> {
    const idx = backupId.indexOf('/');
    if (idx <= 0) return null;
    const txId = backupId.slice(0, idx);
    const filename = backupId.slice(idx + 1);
    const content = this.store.get(txId)?.get(filename);
    if (content === undefined) return null;
    return new TextEncoder().encode(content);
  }

  async removeTransaction(txId: string): Promise<void> {
    this.calls.push(`removeTransaction:${txId}`);
    this.store.delete(txId);
    this.savedAt.delete(txId);
  }

  async listTransactions(): Promise<BackupTransactionSummary[]> {
    const out: BackupTransactionSummary[] = [];
    for (const [txId, bucket] of this.store) {
      let bytes = 0;
      for (const content of bucket.values()) bytes += content.length;
      out.push({ txId, bytes, savedAt: this.savedAt.get(txId) ?? 0 });
    }
    return out.sort((a, b) => a.savedAt - b.savedAt);
  }

  async estimateUsage(): Promise<number> {
    const list = await this.listTransactions();
    return list.reduce((sum, entry) => sum + entry.bytes, 0);
  }

  // ------------------------------------------------------------------
  // テスト用アクセス (BackupStore インターフェース外)
  // ------------------------------------------------------------------

  /** 指定 txId が保持する filename 一覧 */
  keysOf(txId: string): string[] {
    return [...(this.store.get(txId)?.keys() ?? [])].sort();
  }

  /** 保持している txId 一覧 (保存順) */
  txIds(): string[] {
    return [...this.store.keys()];
  }

  /** テスト側から savedAt を直接設定する (古い順の並びを検証するため) */
  setSavedAt(txId: string, savedAt: number): void {
    this.savedAt.set(txId, savedAt);
  }
}

/** テスト用の SHA-1 (実際の Web Crypto を使う。jsdom でも利用可能) */
export async function sha1Of(content: string | Uint8Array): Promise<string> {
  const { calculateSha1 } = await import('@/lib/utils/hash');
  const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return calculateSha1(data.slice().buffer);
}
