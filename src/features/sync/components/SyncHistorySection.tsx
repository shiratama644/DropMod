'use client';

/**
 * Sync History セクション (Phase 12-B / PHASE12_PLAN.md §9.1, **D-9**)。
 *
 * 直近 3 件の Sync と、それぞれの **Undo** を表示する。
 * 「環境との同期」セクション (**D-9**) の下に置く — 紐付け / 解除 / Sync /
 * History / Undo を同じ場所から見られるようにするため。
 *
 * ## 3 件だけ出す理由
 *
 * D-5 で「OPFS の容量が逼迫したら古いバックアップから追い出す。ただし
 * **直近 3 件は絶対に保護する**」と決めている。表示件数を同じ値
 * (`UNDO_KEEP_COUNT`) にしておくと、**Undo ボタンを出しているのに
 * バックアップが消えている**状態が起こらない。
 */

import type React from 'react';
import { useSyncHistory } from '../hooks/useSyncHistory';
import { useProfilesStore } from '@/features/profiles';
import { UNDO_KEEP_COUNT } from '../services/backup';
import type { SyncTransactionRow } from '../services/db';

const STATUS_META: Record<
  SyncTransactionRow['status'],
  { label: string; className: string; icon: string }
> = {
  pending: { label: '待機中', className: 'bg-amber-500/15 theme-text-amber', icon: 'fa-clock' },
  running: { label: '実行中', className: 'bg-amber-500/15 theme-text-amber', icon: 'fa-spinner' },
  completed: { label: '完了', className: 'bg-emerald-500/15 theme-text-emerald', icon: 'fa-check' },
  'rolled-back': {
    label: '取り消し済み',
    className: 'bg-slate-500/15 theme-text-secondary',
    icon: 'fa-rotate-left'
  },
  failed: { label: '失敗', className: 'bg-red-500/15 theme-text-red', icon: 'fa-circle-xmark' }
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('ja-JP', { hour12: false });
}

export const SyncHistorySection: React.FC = () => {
  const currentProfileId = useProfilesStore((s) => s.currentProfileId);
  const { items, loading, error, undoingId, undo } = useSyncHistory(currentProfileId);

  return (
    <section className="space-y-3" aria-labelledby="sync-history-heading">
      <div className="flex items-center justify-between">
        <h3 id="sync-history-heading" className="text-sm sm:text-base font-bold">
          同期履歴
        </h3>
        <span className="text-[10px] theme-text-muted">
          直近 {UNDO_KEEP_COUNT} 件 / 取り消し可能
        </span>
      </div>

      <div className="glass-panel rounded-2xl p-4 sm:p-5 space-y-3">
        {loading ? (
          <p className="text-xs theme-text-muted">
            <i className="fa-solid fa-spinner fa-spin mr-1.5" aria-hidden />
            読み込み中...
          </p>
        ) : error ? (
          <p role="alert" className="text-[11px] theme-text-red leading-relaxed">
            <i className="fa-solid fa-circle-exclamation mr-1.5" aria-hidden />
            {error}
          </p>
        ) : items.length === 0 ? (
          <p className="text-xs theme-text-muted leading-relaxed">
            <i className="fa-solid fa-circle-info theme-text-brand mr-1.5" aria-hidden />
            まだ Sync の履歴はありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const meta = STATUS_META[item.status];
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl theme-sub-box p-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${meta.className}`}
                      >
                        <i className={`fa-solid ${meta.icon}`} aria-hidden="true" />
                        {meta.label}
                      </span>
                      <time
                        dateTime={new Date(item.startedAt).toISOString()}
                        className="font-mono text-[11px] theme-text-secondary"
                      >
                        {formatTime(item.startedAt)}
                      </time>
                    </div>
                    <p className="text-[11px] theme-text-muted tabular-nums">
                      適用 {item.applied} 件
                      {item.skipped > 0 ? ` / スキップ ${item.skipped} 件` : ''}
                      {item.error ? (
                        <span className="theme-text-red"> / {item.error}</span>
                      ) : null}
                    </p>
                  </div>

                  {item.canUndo ? (
                    <button
                      type="button"
                      onClick={() => void undo(item.id)}
                      disabled={undoingId !== null}
                      className="btn-hover-effect shrink-0 px-3 py-1.5 rounded-xl theme-sub-box border border-transparent hover:border-emerald-500/50 text-[11px] font-semibold transition flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <i
                        className={`fa-solid ${
                          undoingId === item.id ? 'fa-spinner fa-spin' : 'fa-rotate-left'
                        }`}
                        aria-hidden="true"
                      />
                      {undoingId === item.id ? '取り消し中...' : '取り消す'}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !error && items.length > 0 ? (
          <p className="text-[10px] theme-text-muted leading-relaxed">
            取り消すと、その Sync で書き込んだファイルを削除し、上書き・削除したファイルを
            元に戻します。Sync の前に環境側で書き換わっていたファイルは戻せません。
          </p>
        ) : null}
      </div>
    </section>
  );
};
