'use client';

/**
 * インポート時 (Discover から Modpack 追加) の競合解決モーダル (Phase 12-D2 / bug 3)。
 *
 * **D-3 (2026-08-27 確定) をインポート時に適用する**:
 * Mod ごとに `[ユーザー版を残す]` / `[Modpack 版に置換]` を選ばせ、既定は
 * 「ユーザー版を残す」(データ消失が起きない側)。
 *
 * ここで選んだ結果は Profile (SSOT) にのみ反映され、ローカルファイルへの
 * 書き込みは Sync Preview 経由で行われる (§4)。
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { ModpackAddPlan, ModpackConflictChoice } from '@/features/modpack/modpackAdd';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useModalRegistration } from '@/hooks/useModalUi';

export interface ModpackImportModalProps {
  isOpen: boolean;
  plan: ModpackAddPlan | null;
  /** 競合ごとの選択 (既定は全て 'keep') */
  onConfirm: (choices: Map<string, ModpackConflictChoice>) => void;
  onClose: () => void;
}

export function ModpackImportModal({ isOpen, plan, onConfirm, onClose }: ModpackImportModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(isOpen, onClose, dialogRef);
  useModalRegistration(isOpen);

  /** projectId → 選択 (既定 = ユーザー版を残す / D-3) */
  const [choices, setChoices] = useState<Map<string, ModpackConflictChoice>>(() => new Map());

  // plan が変わったら選択をリセット (既定 = keep)。早期 return より前に全 hook を配置する。
  useEffect(() => {
    if (plan) setChoices(new Map());
  }, [plan]);

  if (!isOpen || !plan) return null;

  const choiceOf = (projectId: string): ModpackConflictChoice =>
    choices.get(projectId) ?? 'keep';

  const setChoice = (projectId: string, choice: ModpackConflictChoice) => {
    setChoices((prev) => {
      const next = new Map(prev);
      next.set(projectId, choice);
      return next;
    });
  };

  const replaceCount = plan.conflicts.filter(
    (c) => choiceOf(c.projectId) === 'replace'
  ).length;

  const submit = () => {
    // 未選択の競合は既定 (ユーザー版を残す = D-3) を明示して渡す
    const next = new Map(choices);
    for (const conflict of plan.conflicts) {
      if (!next.has(conflict.projectId)) next.set(conflict.projectId, 'keep');
    }
    onConfirm(next);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景 (Escape は useModalA11y が処理、focus は dialog 内に閉じ込め済み)
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
    <div
      className="modal-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/20 theme-text-violet">
            <i className="fa-solid fa-boxes-stacked" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="font-extrabold text-base sm:text-lg">
              競合する Mod の選択
            </h3>
            <p className="text-[11px] theme-text-secondary">
              Modpack の内容をプロファイルに追加します
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="w-8 h-8 rounded-lg theme-sub-box flex items-center justify-center shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
          </button>
        </div>

        {/* 本体 */}
        <div className="flex-1 overflow-y-auto p-5 pt-4 space-y-4">
          <p className="text-xs theme-text-secondary leading-relaxed">
            <span className="font-bold theme-text-primary">
              追加 {plan.additions.length} 件
            </span>
            {plan.conflicts.length > 0 ? (
              <>
                {' / '}
                <span className="font-bold theme-text-amber">
                  競合 {plan.conflicts.length} 件
                </span>
                {' / '}
                <span className="theme-text-secondary">同一版 (追加なし) {plan.skipped} 件</span>
              </>
            ) : null}
          </p>

          {plan.conflicts.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[11px] theme-text-muted">
                プロファイルに既に同じ Mod が入っています。どちらのバージョンを使うか
                選択してください (既定 = ユーザー版を残す)。
              </p>
              <ul className="space-y-2">
                {plan.conflicts.map((conflict) => (
                  <li
                    key={conflict.projectId}
                    className="theme-surface rounded-xl p-3 space-y-2"
                  >
                    <p className="text-xs font-bold theme-text-primary truncate">
                      {conflict.name}
                    </p>
                    <fieldset className="space-y-1.5">
                      <legend className="sr-only">
                        {conflict.name} のバージョン選択
                      </legend>
                      <label className="flex items-center gap-2 text-xs theme-text-secondary cursor-pointer">
                        <input
                          type="radio"
                          name={`conflict-${conflict.projectId}`}
                          checked={choiceOf(conflict.projectId) === 'keep'}
                          onChange={() => setChoice(conflict.projectId, 'keep')}
                          className="accent-emerald-500"
                        />
                        <span className="font-semibold">ユーザー版を残す</span>
                        <span className="theme-text-muted ml-auto tabular-nums">
                          {conflict.profileItem.versionNumber ??
                            conflict.profileItem.versionId ??
                            '不明'}
                        </span>
                      </label>
                      <label className="flex items-center gap-2 text-xs theme-text-secondary cursor-pointer">
                        <input
                          type="radio"
                          name={`conflict-${conflict.projectId}`}
                          checked={choiceOf(conflict.projectId) === 'replace'}
                          onChange={() => setChoice(conflict.projectId, 'replace')}
                          className="accent-violet-500"
                        />
                        <span className="font-semibold">Modpack 版に置換</span>
                        <span className="theme-text-muted ml-auto tabular-nums">
                          {conflict.packItem.versionNumber ??
                            conflict.packItem.versionId ??
                            '不明'}
                        </span>
                      </label>
                    </fieldset>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] theme-text-secondary">競合する Mod はありません。</p>
          )}

          <p className="text-[10px] theme-text-muted leading-relaxed">
            選択はプロファイルの内容に反映されます。Minecraft フォルダへの書き込みは
            Sync (環境との同期) で行われ、実行前に必ずプレビューで確認できます。
          </p>
        </div>

        {/* フッタ */}
        <div className="flex justify-end items-center gap-2 p-5 pt-3 border-t border-slate-500/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold shadow hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            追加する ({plan.additions.length} 件追加 / {replaceCount} 件置換)
          </button>
        </div>
      </div>
    </div>
  );
}
