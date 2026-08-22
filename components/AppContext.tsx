'use client';

/**
 * AppContext (Phase 9-A.5 で stub 化、Phase 10 で完全削除予定)
 *
 * Phase 9-A で全 4 消費者コンポーネント (HomeInteractive / ModDetailModalShell /
 * ModsPageClient / SettingsPageClient) を `useProfilesStore` / `useToastStore` /
 * `useConfirmStore` / `useAppAction` の直接参照に書き換えたため、Context は
 * 実質使われていない。
 *
 * ただし以下の理由で **即削除ではなく stub 化** に留める:
 *   1. 緊急ロールバック: Phase 9 実装で予期せぬ回帰が見つかった場合、
 *      Provider だけ残しておけば「AppContextProvider を復活 → 既存 Zustand
 *      並走」のフォールバックが利く
 *   2. 外部ドキュメント / メモリ: docs や commit log に AppContext の存在を
 *      前提とした記述があるため、いきなり削除ではなく 1 phase 猶予を挟む
 *   3. Provider Component は pass-through で Runtime コスト実質ゼロ
 *
 * Phase 10 で `AppContextProvider` の使用箇所 (AppShell の 1 箇所のみ) を
 * 消し、このファイル全体を削除する予定。
 */

import type { ReactNode } from 'react';

/**
 * @deprecated Phase 10 で削除予定。全 field は Zustand store 直接参照に移行済み。
 *   型は互換のため残すが実質空オブジェクト。誤って import しても実質参照できない。
 */
export type AppContextValue = Record<string, never>;

/**
 * @deprecated Phase 10 で削除予定。呼び出すと即 throw する。
 *
 * 対応する Zustand store (Phase 9 の移行先):
 *   - profiles / theme          → useProfilesStore
 *   - toast (showToast)          → useToastStore
 *   - confirm                    → useConfirmStore
 *   - zipExport (isZipModalOpen/zipProgress/handleDownloadZip 等)
 *                                → useZipExportStore + useAppAction('handleDownloadZip')
 *   - zipImport (handleImportZipInput 等) → useAppAction
 *   - depCheck (hasDepWarning)   → useDepCheckStore
 *   - modal open state           → useAppAction('openXxxModal')
 *
 * 例:
 *   // Before
 *   const { profiles, showToast } = useAppContext();
 *   // After
 *   const profiles = useProfilesStore((s) => s.profiles);
 *   const showToast = useToastStore((s) => s.showToast);
 */
export function useAppContext(): never {
  throw new Error(
    '[DropMod] useAppContext() は Phase 9-A で撤去されました。' +
      '対応する Zustand store (useProfilesStore/useToastStore/etc.) を直接使うか、' +
      '`useAppAction(key)` (lib/store/appActions.ts) を利用してください。' +
      '詳細は docs/PHASE9_PLAN.md 付録 A を参照。'
  );
}

/**
 * @deprecated Phase 10 で削除予定。Pass-through wrapper (Runtime コストなし)。
 * 現状 AppShell から 1 箇所のみ呼ばれるが、Phase 9-A 実装で全依存が
 * Zustand + appActionsStore に移った後は「単に children を返すだけ」の
 * ダミーとして機能。value prop は完全無視される。
 */
interface ProviderProps {
  value?: unknown; // 後方互換のためだけに保持、無視
  children: ReactNode;
}

export function AppContextProvider({ children }: ProviderProps) {
  return <>{children}</>;
}
