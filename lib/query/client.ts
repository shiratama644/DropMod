/**
 * TanStack Query の QueryClient と Dexie persister のセットアップ。
 *
 * Sub-Phase 8-B:
 *   - Modrinth API 呼び出しを useQuery / useInfiniteQuery に統一
 *   - Dexie の `apiCache` テーブルを persister のストレージとして使用
 *   - オフライン時も既読 Mod 詳細 / 検索結果を表示可能に
 *
 * SSR 安全性:
 *   - QueryClient は client-only (Providers 内の useState でインスタンス化)
 *   - persister は useEffect 内で attach (IndexedDB がブラウザ限定)
 */

import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { db } from '@/lib/db/dexie';

// ============================================================================
// 定数
// ============================================================================

/** 各 query の "fresh" 判定時間 (5 分)。この間はキャッシュのみで完結、再取得なし */
export const DEFAULT_STALE_TIME_MS = 5 * 60 * 1000;

/** メモリ内キャッシュを保持する時間 (24 時間) */
export const DEFAULT_GC_TIME_MS = 24 * 60 * 60 * 1000;

/** Dexie apiCache の TTL (24 時間) */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** persister が Dexie に書き込む throttle 間隔 (1 秒) */
const PERSIST_THROTTLE_MS = 1_000;

// ============================================================================
// Dexie を Async Storage 互換で見せるアダプタ
// ============================================================================

/**
 * TanStack Query の persister が要求する Storage インターフェイス
 * ({ getItem, setItem, removeItem } × 全て Promise<...>) を、
 * Dexie の apiCache テーブルで実装する。
 *
 * データ形状 (H7-1 修正):
 *   apiCache.data = **persister が渡す value (string) をそのまま保存**
 *   → JSON.parse/stringify のラウンドトリップを排除、CPU 半減 + 損失リスク回避
 *   → persister 側の serialize/deserialize (JSON.stringify/parse) に処理を集約
 *
 * TTL:
 *   setItem 時に expiresAt = now + CACHE_TTL_MS を書き、
 *   getItem 時に expiresAt < now なら削除して null を返す (lazy 掃除)。
 */
const dexieAsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const row = await db.apiCache.get(key);
      if (!row) return null;
      if (row.expiresAt < Date.now()) {
        // 期限切れ: 削除して null (呼び出し側は fresh fetch する)
        await db.apiCache.delete(key);
        return null;
      }
      // データは既に string 形式で保存されているのでそのまま返す
      return row.data;
    } catch (e) {
      console.warn('[DropMod] apiCache.getItem 失敗:', e);
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      // persister が既に serialize した string をそのまま保存
      await db.apiCache.put({
        key,
        data: value,
        createdAt: Date.now(),
        expiresAt: Date.now() + CACHE_TTL_MS
      });
    } catch (e) {
      console.warn('[DropMod] apiCache.setItem 失敗:', e);
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await db.apiCache.delete(key);
    } catch (e) {
      console.warn('[DropMod] apiCache.removeItem 失敗:', e);
    }
  }
};

// ============================================================================
// QueryClient ファクトリ
// ============================================================================

/**
 * DropMod 標準の QueryClient を作る。
 *
 * defaultOptions:
 *   - staleTime 5 分: 短時間の再訪ではキャッシュのみで完結
 *   - gcTime 24 時間: メモリキャッシュ保持
 *   - refetchOnWindowFocus false: 意図しない再取得を防ぐ (UX 一貫性)
 *   - refetchOnReconnect 'always': オフライン → オンライン復帰時は常に再取得
 *   - retry 1: 一時的ネットワーク失敗の 1 回再試行 (バックオフ付き)
 *   - networkMode 'offlineFirst': オフラインでも cache から即返却
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: DEFAULT_GC_TIME_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: 'always',
        retry: 1,
        networkMode: 'offlineFirst'
      },
      mutations: {
        networkMode: 'offlineFirst',
        retry: 0
      }
    }
  });
}

/**
 * Dexie apiCache を Async Storage 互換で見せる persister ファクトリ。
 *
 * H7-2 修正: 以前は `attachPersister(client)` として `persistQueryClient` を
 *   直接呼び unsubscribe 関数だけ返していたが、restore 完了 Promise (第 2 tuple)
 *   を待たなかったため、初回 query が cache 未 restore 状態で fetch されていた。
 *   → `PersistQueryClientProvider` に置き換え、children を restore 完了まで待たせる
 *     公式推奨パターンに変更 (components/Providers.tsx を参照)。
 */
export function createDexiePersister() {
  return createAsyncStoragePersister({
    storage: dexieAsyncStorage,
    key: 'DropModTSQ',
    throttleTime: PERSIST_THROTTLE_MS
    // serialize/deserialize は library デフォルト (JSON.stringify/parse) を使う。
    // H7-1 修正で dexieAsyncStorage が string を受け取り string を返す形になったため、
    // ここで再度指定する必要はない。
  });
}

/** persister に渡す永続化オプション (Provider から使用) */
export const persistOptions = {
  maxAge: CACHE_TTL_MS,
  // buster を変えると全キャッシュを無効化できる (デプロイ時のスキーマ変更用)
  buster: 'v1'
} as const;
