'use client';

/**
 * Sync Preview (Phase 12-B / PHASE12_PLAN.md §10.3, D-2, D-3 / P12-D3)
 *
 * **Sync 実行前に必ず出す差分確認ダイアログ。** ここを通さずに書き込む経路は
 * 存在させない (§4 禁止事項)。
 *
 * ## セクション構成
 *
 * | # | 見出し | 出典 | 扱い |
 * |---|--------|------|------|
 * | 1 | 追加 | `plan.additions` | そのまま適用 |
 * | 2 | 更新 | `plan.updates` | そのまま適用 |
 * | 3 | **競合** (**P12-D3**) | `plan.conflicts` | **ユーザー選択** (既定 = ユーザー版を残す) |
 * | 4 | 削除 | `plan.deletions` | 3 条件を満たしたもののみ。**Import / Modpack 由来はユーザー選択** |
 * | 5 | 外部変更を検知 | `selectExternallyModified` | **触らない** (データ保護) |
 * | 6 | 保持 | `unchanged` − 外部変更 | 何もしない |
 * | 7 | 管理外 | `plan.unmanaged` | **触らない** |
 *
 * ## 競合 (D-3)
 *
 * Modpack 導入時の `lockedVersions` と Profile の現在値がズレている項目。
 * **既定 = ユーザー版を残す** (keep)。「Modpack 版に置換」(replace) を選んだ
 * ものだけ、`onApply` に choice として渡す。replace を選んでも削除・追加の
 * 差分は keep 時と同じく「そのまま適用」なので、競合セクションは選択 UI のみ。
 *
 * ## 削除のユーザー選択 (§10.3)
 *
 * `source !== 'dropmod'` の削除は**既定で「保持」**。ユーザーが明示的に
 * 「削除する」を選んだものだけを削除対象として渡す。データ消失が起きない側を
 * 既定にする (D-3 と同じ思想)。
 */

import { useMemo, useRef, useState, useId } from 'react';
import {
  selectDeletionsRequiringConfirm,
  selectExternallyModified,
  type SyncConflictEntry,
  type SyncPlan,
  type SyncPlanEntry
} from '@/lib/env/diff';
import type { ModpackConflictChoice } from '@/features/modpack/modpackAdd';
import type { ApplyProgress } from '@/hooks/useSync';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useModalRegistration } from '@/hooks/useModalUi';
import { formatBytes } from '@/lib/utils/format';
import type { ManagedFileSource } from '@/types';

/** 削除元の内訳バッジ (§10.3) */
const SOURCE_LABEL: Record<ManagedFileSource, string> = {
  dropmod: 'DropMod 追加',
  import: 'Import 由来',
  modpack: 'Modpack 更新'
};

const SOURCE_CLASS: Record<ManagedFileSource, string> = {
  dropmod: 'bg-emerald-500/15 theme-text-emerald',
  import: 'bg-sky-500/15 theme-text-sky',
  modpack: 'bg-violet-500/15 theme-text-violet'
};

export interface SyncPreviewModalProps {
  isOpen: boolean;
  plan: SyncPlan;
  /** 紐付け先のフォルダ名 (見出しに表示) */
  rootName: string;
  /** **D-2**: false なら「同期する」を押せない */
  writable: boolean;
  writableReason: string | null;
  /** スキャンで読み取れず除外したパス */
  scanSkipped: string[];
  running: boolean;
  applyProgress: ApplyProgress | null;
  onClose: () => void;
  /**
   * 適用を実行する。
   * @param excludedDeletionPaths ユーザーが「保持」を選んだ削除予定のパス
   * @param conflictChoices **P12-D3**: projectId → keep / replace。
   *   replace を選んだ項目は実行前に Profile をロック版に復元して plan 再計算する
   */
  onApply: (
    excludedDeletionPaths: string[],
    conflictChoices: Map<string, ModpackConflictChoice>
  ) => void;
}

interface Section {
  key: string;
  title: string;
  icon: string;
  iconClass: string;
  entries: SyncPlanEntry[];
  /** 削除セクションのみ true (選択 UI を出す) */
  selectable?: boolean;
  note?: string;
  /**
   * **P12-D3**: 競合セクションのみ。entries は空にし、keep / replace の
   * 選択 UI をここから描画する。
   */
  conflicts?: SyncConflictEntry[];
}

function EntryRow({ entry, children }: { entry: SyncPlanEntry; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-xs border-b border-slate-500/10 last:border-b-0">
      <span className="font-semibold truncate flex-1 min-w-0" title={entry.path || entry.name}>
        {entry.path || entry.name}
      </span>
      {entry.source ? (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${SOURCE_CLASS[entry.source]}`}
        >
          {SOURCE_LABEL[entry.source]}
        </span>
      ) : null}
      {entry.size > 0 ? (
        <span className="text-[10px] theme-text-secondary shrink-0 tabular-nums">
          {formatBytes(entry.size)}
        </span>
      ) : null}
      {children}
    </li>
  );
}

/** P12-D3: 競合 1 件の行 (Project 名 + 両バージョン + keep/replace 選択) */
function ConflictRow({
  conflict,
  choice,
  disabled,
  onChange
}: {
  conflict: SyncConflictEntry;
  choice: ModpackConflictChoice;
  disabled: boolean;
  onChange: (projectId: string, choice: ModpackConflictChoice) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-xs border-b border-slate-500/10 last:border-b-0">
      <span className="font-semibold truncate flex-1 min-w-0" title={conflict.name}>
        {conflict.name}
      </span>
      <span className="text-[10px] theme-text-secondary tabular-nums">
        {conflict.userVersionNumber ?? 'ユーザー版'} → {conflict.packVersionNumber ?? 'Modpack 版'}
      </span>
      <label className="flex items-center gap-1.5 text-[10px] font-bold shrink-0">
        <select
          value={choice}
          onChange={(e) => onChange(conflict.projectId, e.target.value as ModpackConflictChoice)}
          disabled={disabled}
          aria-label={`${conflict.name} の競合解決`}
          className="theme-sub-box rounded-lg px-2 py-1 bg-transparent focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <option value="keep">ユーザー版を残す</option>
          <option value="replace">Modpack 版に置換</option>
        </select>
      </label>
    </li>
  );
}

export function SyncPreviewModal({
  isOpen,
  plan,
  rootName,
  writable,
  writableReason,
  scanSkipped,
  running,
  applyProgress,
  onClose,
  onApply
}: SyncPreviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(isOpen, onClose, dialogRef);
  useModalRegistration(isOpen);

  /** ユーザーが「削除する」を明示的に選んだパス (§10.3) */
  const [deleteChecked, setDeleteChecked] = useState<Set<string>>(() => new Set());

  /** P12-D3: 競合の選択 (既定 = ユーザー版を残す)。モーダルは開くたびに
   *  再マウントされるので、plan 差し替え時のリセットは不要 */
  const [conflictChoices, setConflictChoices] = useState<Map<string, ModpackConflictChoice>>(
    () => new Map()
  );

  const requiringConfirm = useMemo(
    () => new Set(selectDeletionsRequiringConfirm(plan).map((e) => e.path)),
    [plan]
  );
  const externallyModified = useMemo(() => selectExternallyModified(plan), [plan]);
  const kept = useMemo(
    () => plan.unchanged.filter((e) => e.externallyModified !== true),
    [plan.unchanged]
  );

  if (!isOpen) return null;

  const sections: Section[] = [
    {
      key: 'additions',
      title: '追加',
      icon: 'fa-circle-plus',
      iconClass: 'bg-emerald-500/15 theme-text-emerald',
      entries: plan.additions
    },
    {
      key: 'updates',
      title: '更新',
      icon: 'fa-pen',
      iconClass: 'bg-amber-500/15 theme-text-amber',
      entries: plan.updates
    },
    {
      // P12-D3: 「更新」の直下に配置 (追加 → 更新 → 競合 → 削除 → …)
      key: 'conflicts',
      title: '競合',
      icon: 'fa-handshake',
      iconClass: 'bg-fuchsia-500/15 theme-text-fuchsia',
      entries: [],
      conflicts: plan.conflicts,
      note: 'Modpack 導入時に指定したバージョンと Profile の現在値がズレています。既定ではユーザー版を残します'
    },
    {
      key: 'deletions',
      title: '削除',
      icon: 'fa-trash-can',
      iconClass: 'bg-red-500/15 theme-text-red',
      entries: plan.deletions,
      selectable: true,
      note: 'Import / Modpack 由来のファイルは、チェックを入れたものだけを削除します'
    },
    {
      key: 'external',
      title: '外部変更を検知',
      icon: 'fa-triangle-exclamation',
      iconClass: 'bg-orange-500/15 theme-text-orange',
      entries: externallyModified,
      note: '環境側で書き換わっているため **触りません**。上書きすると変更が失われます'
    },
    {
      key: 'unchanged',
      title: '保持',
      icon: 'fa-check',
      iconClass: 'bg-sky-500/15 theme-text-sky',
      entries: kept
    },
    {
      key: 'unmanaged',
      title: '管理外',
      icon: 'fa-circle-question',
      iconClass: 'bg-slate-500/15 theme-text-secondary',
      entries: plan.unmanaged,
      note: 'DropMod が管理していないファイルです。**削除しません**'
    }
  ];

  /** 適用する削除 = 全部 − 「保持」を選んだもの */
  const excludedDeletionPaths = plan.deletions
    .filter((e) => requiringConfirm.has(e.path) && !deleteChecked.has(e.path))
    .map((e) => e.path);

  const willDelete = plan.deletions.length - excludedDeletionPaths.length;
  const total =
    plan.additions.length + plan.updates.length + externallyModified.length + plan.unmanaged.length;

  const toggle = (path: string) => {
    setDeleteChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  /** P12-D3: 競合 1 件の選択を切り替える (既定 keep / 未選択 = keep 扱い) */
  const setConflictChoice = (projectId: string, choice: ModpackConflictChoice) => {
    setConflictChoices((prev) => {
      const next = new Map(prev);
      if (choice === 'keep') next.delete(projectId);
      else next.set(projectId, choice);
      return next;
    });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景 (Escape は useModalA11y が処理、focus は dialog 内に閉じ込め済み)
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
    <div
      className="modal-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !running) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-card glass-panel w-full max-w-lg rounded-3xl border shadow-2xl relative flex flex-col max-h-[85vh]"
      >
        {/* ヘッダ */}
        <div className="flex items-center gap-3 border-b border-slate-500/20 p-5 pb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/20 theme-text-emerald">
            <i className="fa-solid fa-rotate" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="font-extrabold text-base sm:text-lg">
              同期プレビュー
            </h3>
            <p className="text-[11px] theme-text-secondary truncate" title={rootName}>
              対象: {rootName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            aria-label="閉じる"
            className="w-8 h-8 rounded-lg theme-sub-box flex items-center justify-center shrink-0 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
          </button>
        </div>

        {/* 本体 */}
        <div className="flex-1 overflow-y-auto p-5 pt-3 space-y-4">
          {/* D-2: 読み取り専用 */}
          {!writable ? (
            <div
              role="alert"
              className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] theme-text-secondary leading-relaxed space-y-2"
            >
              <p className="font-bold theme-text-amber">
                <i className="fa-solid fa-lock mr-1.5" aria-hidden="true" />
                書き込み権限がありません
              </p>
              <p>{writableReason}</p>
              <p>設定画面の「ZIPダウンロード」から書き出せます。</p>
            </div>
          ) : null}

          {/* サマリ */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '書き込み', value: formatBytes(plan.totals.writeBytes) },
              { label: '削除', value: formatBytes(plan.totals.removeBytes) },
              { label: 'バックアップ', value: formatBytes(plan.totals.backupBytes) }
            ].map((item) => (
              <div
                key={item.label}
                className="p-2 rounded-xl theme-sub-box text-center"
              >
                <div className="text-[10px] theme-text-secondary">{item.label}</div>
                <div className="text-xs font-bold tabular-nums">{item.value}</div>
              </div>
            ))}
          </div>

          {/*
            各セクション。
            **空でも見出しを出す** — §10.3 は「6 分類すべてを見せる」ことを求めているので、
            0 件の分類を隠すとユーザーが「対象外だった」と「見ていない」を区別できない。
          */}
          {sections.map((section) => {
            const visibleEntries = section.conflicts ?? section.entries;
            return (
              <section key={section.key}>
                <h4 className="flex items-center gap-2 text-xs font-bold mb-1">
                  <span
                    className={`w-5 h-5 rounded flex items-center justify-center ${section.iconClass}`}
                  >
                    <i className={`fa-solid ${section.icon} text-[10px]`} aria-hidden="true" />
                  </span>
                  {section.title}
                  <span className="theme-text-secondary font-semibold tabular-nums">
                    {visibleEntries.length}
                  </span>
                </h4>
                {section.note ? (
                  <p className="text-[10px] theme-text-secondary mb-1 leading-relaxed">
                    {section.note}
                  </p>
                ) : null}
                {visibleEntries.length === 0 ? (
                  <p className="text-[11px] theme-text-secondary">なし</p>
                ) : section.conflicts ? (
                  <ul>
                    {plan.conflicts.map((conflict) => (
                      <ConflictRow
                        key={`${conflict.category}:${conflict.projectId}`}
                        conflict={conflict}
                        choice={conflictChoices.get(conflict.projectId) ?? 'keep'}
                        disabled={running}
                        onChange={setConflictChoice}
                      />
                    ))}
                  </ul>
                ) : (
                  <ul>
                    {section.entries.map((entry) => (
                      <EntryRow
                        key={`${entry.category}:${entry.path}:${entry.projectId}`}
                        entry={entry}
                      >
                        {section.selectable && requiringConfirm.has(entry.path) ? (
                          <label className="flex items-center gap-1 text-[10px] font-bold shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={deleteChecked.has(entry.path)}
                              onChange={() => toggle(entry.path)}
                              disabled={running}
                              className="accent-red-500"
                            />
                            削除する
                          </label>
                        ) : null}
                      </EntryRow>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {/* スキャンで読めなかったファイル */}
          {scanSkipped.length > 0 ? (
            <div className="p-3 rounded-xl theme-sub-box text-[11px] theme-text-secondary space-y-1">
              <p className="font-bold">
                <i className="fa-solid fa-circle-exclamation mr-1.5" aria-hidden="true" />
                読み取れなかったファイル {scanSkipped.length} 件
              </p>
              <ul className="space-y-0.5">
                {scanSkipped.slice(0, 5).map((path) => (
                  <li key={path} className="truncate">
                    {path}
                  </li>
                ))}
                {scanSkipped.length > 5 ? <li>ほか {scanSkipped.length - 5} 件</li> : null}
              </ul>
              <p>これらは差分の対象外です (削除されません)。</p>
            </div>
          ) : null}

          {/* 実行中の進捗 */}
          {running && applyProgress ? (
            <p
              role="status"
              aria-live="polite"
              className="text-[11px] theme-text-secondary tabular-nums"
            >
              {applyProgress.done} / {applyProgress.total} — {applyProgress.path}
            </p>
          ) : null}
        </div>

        {/* フッタ */}
        <div className="flex justify-between items-center gap-2 p-5 pt-3 border-t border-slate-500/20">
          <p className="text-[10px] theme-text-secondary tabular-nums">
            適用 {plan.additions.length + plan.updates.length} 件 / 削除 {willDelete} 件 /
            対象外 {total} 件
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              className="px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => onApply(excludedDeletionPaths, conflictChoices)}
              disabled={running || !writable}
              title={!writable ? (writableReason ?? '書き込み権限がありません') : undefined}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold shadow hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {running ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin mr-1.5" aria-hidden="true" />
                  同期中…
                </>
              ) : (
                `同期する (${plan.additions.length + plan.updates.length + willDelete})`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
