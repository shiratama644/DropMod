/**
 * OPFS Backup ストア (Phase 12-B / PHASE12_PLAN.md §10.4)。
 *
 * Sync で **上書き・削除する前の現ファイル**を Origin Private File System に退避し、
 * Rollback (§10.4) と Sync History の Undo から復元できるようにする。
 *
 * ## D-5 (2026-08-27 確定): quota 逼迫時の削除順序
 *
 * **古い順**に削除する。ただし §10.4 が約束する「**直近 3 回の Sync を Undo 可能**」は
 * 絶対に破らない。それでも容量が足りない場合は **Sync 自体を中断**してユーザーに知らせる
 * (黙って保護を外さない)。判定は pure function `selectEvictableTransactions` が担う。
 *
 * ## 格納レイアウト
 *
 * ```
 * <OPFS ルート>/dropmod-backup/<txId>/<sanitized path>
 * ```
 *
 * トランザクション単位でディレクトリを分けるのは、D-5 の「Sync 単位で
 * 古い順に消す」をそのままディレクトリ削除で実現するため。
 */

/** OPFS ルート直下に作る Backup 用ディレクトリ名 */
export const BACKUP_ROOT_DIR = 'dropmod-backup';

/** D-5 / §10.4: Undo を保証する直近 Sync の回数 */
export const UNDO_KEEP_COUNT = 3;

/** Sync 1 件分の Backup サマリー (D-5 の判定に使う) */
export interface BackupTransactionSummary {
  txId: string;
  /** その Sync の Backup 合計バイト数 */
  bytes: number;
  /** 最も古いファイルの最終更新時刻 (古い順の判定に使う) */
  savedAt: number;
}

export interface EvictionDecision {
  /** 削除すべき txId (古い順) */
  evict: string[];
  /** 削除しても必要容量に届かない場合は false (= Sync を中断する) */
  enough: boolean;
  /** evict を実行した場合に確保できるバイト数 */
  freedBytes: number;
}

/**
 * **D-5 の判定 (pure function)**。
 *
 * @param available   OPFS に存在する Backup 一覧
 * @param keepTxIds   絶対に消してはいけない txId (直近 `UNDO_KEEP_COUNT` 件)
 * @param neededBytes これから必要になる容量 (SyncPlan.totals.backupBytes)
 * @param freeBytes   現時点の空き容量
 */
export function selectEvictableTransactions(
  available: readonly BackupTransactionSummary[],
  keepTxIds: ReadonlySet<string>,
  neededBytes: number,
  freeBytes: number
): EvictionDecision {
  // 必要なければ何も消さない
  if (freeBytes >= neededBytes) {
    return { evict: [], enough: true, freedBytes: 0 };
  }

  const evictable = available
    .filter((entry) => !keepTxIds.has(entry.txId))
    .sort((a, b) => a.savedAt - b.savedAt);

  const evict: string[] = [];
  let freedBytes = 0;
  for (const entry of evictable) {
    if (freeBytes + freedBytes >= neededBytes) break;
    evict.push(entry.txId);
    freedBytes += entry.bytes;
  }

  return {
    evict,
    enough: freeBytes + freedBytes >= neededBytes,
    freedBytes
  };
}

/**
 * Backup の格納先を表す抽象。
 * 実装は `OpfsBackupStore` のみだが、インターフェースを切ることで
 * Executor のテストを OPFS 無しで回せる。
 */
export interface BackupStore {
  /** 退避する。返り値 (backupId) は Journal に記録する */
  save(txId: string, key: string, data: Uint8Array): Promise<string>;
  /** 復元する。無ければ null (Rollback は「元々無かった」とみなして削除する) */
  load(backupId: string): Promise<Uint8Array | null>;
  /** Sync 1 件分の Backup をまとめて削除する */
  removeTransaction(txId: string): Promise<void>;
  /** 保存済みの Backup 一覧 (tx 単位) */
  listTransactions(): Promise<BackupTransactionSummary[]>;
  /** Backup の合計使用バイト数 */
  estimateUsage(): Promise<number>;
}

/** ファイル名に使えない '/' を可逆でない形で置換する (復元時は txId だけ必要) */
function sanitizeKey(key: string): string {
  return key.split('/').filter(Boolean).join('__') || 'root';
}

/** `backupId` = `${txId}/${sanitizedKey}` を分解する */
export function parseBackupId(backupId: string): { txId: string; filename: string } | null {
  const idx = backupId.indexOf('/');
  if (idx <= 0) return null;
  return { txId: backupId.slice(0, idx), filename: backupId.slice(idx + 1) };
}

/**
 * OPFS (Origin Private File System) 実装。
 *
 * `getRoot` を注入可能にしてあるのは、jsdom に `navigator.storage.getDirectory()` が
 * 存在しないため (テストでは Fake ディレクトリを渡す)。
 */
export class OpfsBackupStore implements BackupStore {
  constructor(
    private readonly getRoot: () => Promise<FileSystemDirectoryHandle> = async () => {
      if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
        throw new Error('このブラウザは OPFS (Origin Private File System) に対応していません。');
      }
      return navigator.storage.getDirectory();
    }
  ) {}

  private async backupRoot(create: boolean): Promise<FileSystemDirectoryHandle> {
    const root = await this.getRoot();
    return root.getDirectoryHandle(BACKUP_ROOT_DIR, { create });
  }

  async save(txId: string, key: string, data: Uint8Array): Promise<string> {
    const dir = await this.backupRoot(true);
    const txDir = await dir.getDirectoryHandle(txId, { create: true });
    const filename = sanitizeKey(key);
    const fileHandle = await txDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(toArrayBuffer(data));
    } finally {
      await writable.close();
    }
    return `${txId}/${filename}`;
  }

  async load(backupId: string): Promise<Uint8Array | null> {
    const parsed = parseBackupId(backupId);
    if (!parsed) return null;
    try {
      const dir = await this.backupRoot(false);
      const txDir = await dir.getDirectoryHandle(parsed.txId);
      const fileHandle = await txDir.getFileHandle(parsed.filename);
      const file = await fileHandle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async removeTransaction(txId: string): Promise<void> {
    try {
      const dir = await this.backupRoot(false);
      await dir.removeEntry(txId, { recursive: true });
    } catch (e) {
      // 冪等: 既に無ければ成功扱い
      if (isNotFound(e)) return;
      throw e;
    }
  }

  async listTransactions(): Promise<BackupTransactionSummary[]> {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await this.backupRoot(false);
    } catch (e) {
      if (isNotFound(e)) return [];
      throw e;
    }

    const result: BackupTransactionSummary[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind !== 'directory') continue;
      // lib.dom の FileSystemHandle は判別可能共通部分型を持たないため明示的に絞る
      const txDir = entry as FileSystemDirectoryHandle;
      let bytes = 0;
      let oldest = Number.POSITIVE_INFINITY;
      for await (const file of txDir.values()) {
        if (file.kind !== 'file') continue;
        const fileHandle = file as FileSystemFileHandle;
        const blob = await fileHandle.getFile();
        bytes += blob.size;
        if (blob.lastModified < oldest) oldest = blob.lastModified;
      }
      result.push({
        txId: txDir.name,
        bytes,
        savedAt: Number.isFinite(oldest) ? oldest : 0
      });
    }
    return result.sort((a, b) => a.savedAt - b.savedAt);
  }

  async estimateUsage(): Promise<number> {
    const transactions = await this.listTransactions();
    return transactions.reduce((sum, t) => sum + t.bytes, 0);
  }
}

// ============================================================================
// 内部ヘルパ
// ============================================================================

function isNotFound(e: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    e instanceof DOMException &&
    (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')
  );
}

/**
 * `Uint8Array` → `ArrayBuffer`。
 * TS 5.9 の lib.dom は `write` の引数を `ArrayBufferView<ArrayBuffer>` として
 * 宣言しており、素の `Uint8Array<ArrayBufferLike>` は代入できないため。
 * バッファ全体を覆う view ならコピーしない。
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = data.buffer as ArrayBuffer;
  if (data.byteOffset === 0 && data.byteLength === buffer.byteLength) {
    return buffer;
  }
  return data.slice().buffer as ArrayBuffer;
}

/**
 * メモリ上の BackupStore (Phase 12-C / §10.1)。
 *
 * ## なぜ OPFS ではなくメモリか
 *
 * `ZipSink` 経由の Sync は**書き込み先がメモリ**なので、退避先もメモリでよい。
 * それ以上に重要なのは、**ZIP 経路を使う環境こそ OPFS が無い可能性がある**こと
 * (Firefox / Safari / モバイルが ZipSink を使う想定)。そこで
 * 「OPFS に対応していません」と Sync 全体を止めるのは本末転倒。
 *
 * ## トレードオフ
 *
 * ページを閉じると退避内容は消える。ただし ZipSink の Sync は
 * 「実行 → その場で ZIP を書き出す」1 回の操作で完結するので、
 * Sync をまたいで Undo する用途 (D-5 の直近 3 件保護) には元々使わない。
 */
/**
 * 名前について: `__tests__/test-utils/memoryEnv.ts` にも `MemoryBackupStore` がある。
 * あちらは **テスト用のダブル** (`failOnSave` / 呼び出し履歴 / 決定的クロックを持つ)。
 * 取り違えると本番コードがテスト用実装を掴むので、こちらは `InMemory` とした。
 */
export class InMemoryBackupStore implements BackupStore {
  readonly #entries = new Map<string, Uint8Array>();
  /** backupId → txId (tx 単位の削除・一覧用) */
  readonly #owner = new Map<string, string>();
  /** backupId → 退避した時刻 (`savedAt` の算出用) */
  readonly #savedAt = new Map<string, number>();

  async save(txId: string, key: string, data: Uint8Array): Promise<string> {
    const backupId = `${txId}/${sanitizeKey(key)}`;
    this.#entries.set(backupId, data);
    this.#owner.set(backupId, txId);
    this.#savedAt.set(backupId, Date.now());
    return backupId;
  }

  async load(backupId: string): Promise<Uint8Array | null> {
    return this.#entries.get(backupId) ?? null;
  }

  async removeTransaction(txId: string): Promise<void> {
    for (const [backupId, owner] of this.#owner) {
      if (owner === txId) {
        this.#entries.delete(backupId);
        this.#owner.delete(backupId);
        this.#savedAt.delete(backupId);
      }
    }
  }

  async listTransactions(): Promise<BackupTransactionSummary[]> {
    // `savedAt` は「最も古いファイルの時刻」。D-5 の古い順追い出しと同じ基準。
    const byTx = new Map<string, { bytes: number; oldest: number }>();
    for (const [backupId, owner] of this.#owner) {
      const data = this.#entries.get(backupId);
      const savedAt = this.#savedAt.get(backupId) ?? 0;
      const current = byTx.get(owner) ?? { bytes: 0, oldest: Number.POSITIVE_INFINITY };
      current.bytes += data?.byteLength ?? 0;
      current.oldest = Math.min(current.oldest, savedAt);
      byTx.set(owner, current);
    }
    return [...byTx.entries()].map(([txId, summary]) => ({
      txId,
      bytes: summary.bytes,
      savedAt: Number.isFinite(summary.oldest) ? summary.oldest : 0
    }));
  }

  async estimateUsage(): Promise<number> {
    let total = 0;
    for (const data of this.#entries.values()) total += data.byteLength;
    return total;
  }
}
