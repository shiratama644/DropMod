'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { ThemeMode } from '@/types';
import { useProfilesStore } from '@/lib/store/profiles';
import { useToastStore } from '@/lib/store/toast';
import { useConfirmStore } from '@/lib/store/confirm';
import { useAppAction } from '@/lib/store/appActions';
import {
  getMigrationStatus,
  restoreFromLocalStorageBackup
} from '@/lib/db/migrate';

// ============================================================================
// SettingsPageClient (Phase 9-A.1: useAppContext 撤去)
//
// Vite 版 `src/components/SettingsTab.tsx` の完全移植。
//
// Phase 9-A.1 の変更:
//   - useAppContext() を撤去
//   - store 由来 (theme/profiles/showToast/confirm): 各 Zustand store を細粒度 subscribe
//   - hook 由来 (handleDownloadZip 等): appActionsStore 経由で subscribe
//   - 目的: contextValue の 30+ フィールドのうち 1 つ変わっても全 consumer が
//     再レンダーする問題を解消 (Zustand 個別 selector で再レンダー最小化)
// ============================================================================

export const SettingsPageClient: React.FC = () => {
  // ---- Zustand store 直接参照 (細粒度 subscription) ----
  const theme = useProfilesStore((s) => s.theme);
  const setTheme = useProfilesStore((s) => s.setTheme);
  const profiles = useProfilesStore((s) => s.profiles);
  const currentProfileId = useProfilesStore((s) => s.currentProfileId);
  const showToast = useToastStore((s) => s.showToast);
  const confirm = useConfirmStore((s) => s.confirm);

  // ---- appActionsStore 経由 (AppShell 内 hook 由来の関数群) ----
  const handleDownloadZip = useAppAction('handleDownloadZip');
  const handleImportZipInput = useAppAction('handleImportZipInput');
  const handleDropZip = useAppAction('handleDropZip');
  const handleSwitchProfile = useAppAction('handleSwitchProfile');
  const handleDeleteProfile = useAppAction('handleDeleteProfile');
  const openNewProfileModal = useAppAction('openNewProfileModal');
  const handleResetData = useAppAction('handleResetData');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onSetTheme = (mode: ThemeMode) => setTheme(mode);

  // ------------------------------------------------------------------
  // M7-1 修正: データベース (Dexie) 状態の表示 + LocalStorage 復元 UI
  //
  //   - 起動時に一度 getMigrationStatus() で現状を取得
  //   - 「LocalStorage から復元」ボタン: confirm → restore → reload
  //   Dexie が壊れた場合の緊急復旧手段として提供 (計画書 §11.3)
  // ------------------------------------------------------------------
  const [dbStatus, setDbStatus] = useState<{
    migrated: boolean;
    migratedAt: Date | null;
    backupAvailable: boolean;
    backupExpiresAt: Date | null;
    schemaVersion: string | null;
  } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getMigrationStatus();
        if (!cancelled) setDbStatus(s);
      } catch (e) {
        console.warn('[DropMod] getMigrationStatus 失敗:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRestoreFromBackup = useCallback(async () => {
    if (!dbStatus?.backupAvailable) {
      showToast('復元可能な LocalStorage バックアップがありません', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'LocalStorage から復元しますか？',
      message:
        '現在の Dexie (IndexedDB) データを破棄し、LocalStorage バックアップから再構築します。' +
        '\n復元後は自動的にページがリロードされます。' +
        '\nこの操作は取り消せません。',
      confirmLabel: '復元する',
      cancelLabel: 'キャンセル',
      danger: true
    });
    if (!ok) return;
    setIsRestoring(true);
    try {
      const result = await restoreFromLocalStorageBackup();
      if (result.status === 'migrated') {
        showToast(
          `${result.profilesMigrated} 件のプロファイルを復元しました。リロードします...`,
          'success'
        );
        // 少し待ってからリロード (Toast を見せるため)
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        showToast(
          `復元できませんでした (${result.status})。LocalStorage が空か破損している可能性があります`,
          'warning'
        );
        setIsRestoring(false);
      }
    } catch (e) {
      console.error('[DropMod] 復元エラー:', e);
      showToast('復元中にエラーが発生しました', 'error');
      setIsRestoring(false);
    }
  }, [dbStatus, showToast, confirm]);

  const formatDate = (d: Date | null): string =>
    d ? d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  // Date.now() は React 19 の purity ルールで render / useMemo 中に呼べないため
  // useEffect で state 更新の形にする (dbStatus 変化のたびに再計算)
  const [remainingBackupDays, setRemainingBackupDays] = useState<number>(0);
  useEffect(() => {
    if (!dbStatus?.backupExpiresAt) {
      setRemainingBackupDays(0);
      return;
    }
    const remaining = Math.max(
      0,
      Math.ceil((dbStatus.backupExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    );
    setRemainingBackupDays(remaining);
  }, [dbStatus?.backupExpiresAt]);

  return (
    <section id="tab-settings" className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div className="glass-panel rounded-3xl p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div>
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <i className="fa-solid fa-sliders theme-text-brand" aria-hidden />
            環境設定 & プロファイル管理
          </h2>
          <p className="text-xs theme-text-muted mt-1">
            プロファイルの管理やテーマ変更、バックアップZIPのインポート・エクスポートを行います。
          </p>
        </div>

        <div className="border-t border-slate-500/20 pt-4 sm:pt-6 space-y-3">
          <h3 className="text-xs sm:text-sm font-bold">外観テーマ設定 (Color Theme)</h3>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <button
              type="button"
              onClick={() => onSetTheme('dark')}
              className={`btn-hover-effect p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                theme === 'dark'
                  ? 'border-2 border-emerald-500 bg-emerald-500/10 theme-text-brand shadow'
                  : 'border-slate-700 bg-slate-800/80 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <i className="fa-solid fa-moon theme-text-blue" aria-hidden />
              <span>ダークモード</span>
            </button>
            <button
              type="button"
              onClick={() => onSetTheme('light')}
              className={`btn-hover-effect p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                theme === 'light'
                  ? 'border-2 border-emerald-500 bg-emerald-500/10 theme-text-brand shadow'
                  : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <i className="fa-solid fa-sun theme-text-amber" aria-hidden />
              <span>ライトモード</span>
            </button>
          </div>
        </div>

        <div className="border-t border-slate-500/20 pt-4 sm:pt-6 space-y-3 sm:space-y-4">
          <h3 className="text-xs sm:text-sm font-bold">
            ZIPファイルのインポート / エクスポート
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div
              id="drop-zone"
              onDragOver={handleDragOver}
              onDrop={handleDropZip}
              className="glass-card p-4 sm:p-5 rounded-2xl border-dashed border-2 border-slate-500/40 hover:border-emerald-500 text-center flex flex-col items-center justify-center cursor-pointer relative min-h-[120px]"
            >
              <input
                type="file"
                accept=".zip,.mrpack,application/zip"
                className="absolute inset-0 opacity-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                onChange={handleImportZipInput}
              />
              <i className="fa-solid fa-cloud-arrow-up text-2xl sm:text-3xl theme-text-brand mb-1.5" aria-hidden />
              <p className="text-xs font-bold">ZIPプロファイル / .mrpack インポート</p>
              <p className="text-xs theme-text-muted mt-0.5">
                タップまたはファイルをドロップ (.zip / .mrpack)
              </p>
            </div>

            <div className="glass-card p-4 sm:p-5 rounded-2xl flex flex-col justify-between space-y-3">
              <div>
                <h4 className="text-xs font-bold">プロファイルをZIP保存 (全.jar込み)</h4>
                <p className="text-xs theme-text-muted mt-0.5">
                  登録されている全Modの.jarファイルをまとめて1つのZIPとして出力します。
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadZip}
                className="btn-hover-effect w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-download" aria-hidden />
                ZIPダウンロード
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-500/20 pt-4 sm:pt-6 space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold">保持されているプロファイル</h3>
            <button
              type="button"
              onClick={openNewProfileModal}
              className="btn-hover-effect px-3 py-1.5 theme-sub-box text-xs font-bold rounded-xl border transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-plus theme-text-brand" aria-hidden />
              新規作成
            </button>
          </div>
          <div className="space-y-2">
            {profiles.map((p) => {
              const isActive = p.id === currentProfileId;
              return (
                <div
                  key={p.id}
                  onClick={() => !isActive && handleSwitchProfile(p.id)}
                  className={`glass-card p-3 sm:p-3.5 rounded-2xl flex items-center justify-between transition-all ${
                    isActive
                      ? 'border-emerald-500/50 bg-emerald-500/10 shadow-md shadow-emerald-500/5'
                      : 'cursor-pointer hover:border-emerald-500/40 hover:bg-slate-500/5 active:scale-[0.99]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                    <div
                      className={`w-9 h-9 rounded-xl ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950 font-extrabold'
                          : 'theme-sub-box theme-text-muted'
                      } flex items-center justify-center text-xs shrink-0 shadow`}
                    >
                      <i className="fa-solid fa-folder" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-bold flex items-center gap-2 truncate">
                        <span className="truncate">{p.name}</span>
                        {isActive && (
                          <span className="text-xs px-2 py-0.5 bg-emerald-500/20 theme-text-brand rounded-full font-semibold border border-emerald-500/30 shrink-0">
                            <i className="fa-solid fa-check text-[10px] mr-1" aria-hidden />
                            選択中
                          </span>
                        )}
                      </div>
                      <div className="text-xs theme-text-muted mt-0.5">
                        {`MC ${p.mcVersion} (${p.loader}) • ${p.mods.length} 個のMod`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProfile(p.id);
                      }}
                      className="p-2 theme-text-muted hover:theme-text-red hover:bg-red-500/10 active:bg-red-500/20 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                      title="プロファイルを削除"
                    >
                      <i className="fa-solid fa-trash-can text-xs sm:text-sm" aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============================================================
             M7-1: データベース状態 & LocalStorage 復元
             Dexie が壊れた場合の緊急復旧手段として提供。
        ============================================================ */}
        <div className="border-t border-slate-500/20 pt-4 sm:pt-6 space-y-3">
          <div>
            <h3 className="text-xs sm:text-sm font-bold flex items-center gap-2">
              <i className="fa-solid fa-database theme-text-brand" aria-hidden />
              データベース状態
            </h3>
            <div className="text-xs theme-text-muted mt-1">
              プロファイルデータの保存先 (IndexedDB) の状態と、緊急復旧オプション。
            </div>
          </div>
          <div className="theme-sub-box rounded-xl p-3 text-xs space-y-1.5">
            <div className="flex justify-between gap-2">
              <span className="theme-text-muted">スキーマバージョン</span>
              <span className="font-mono">{dbStatus?.schemaVersion ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="theme-text-muted">移行完了日時</span>
              <span className="font-mono">{formatDate(dbStatus?.migratedAt ?? null)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="theme-text-muted">LocalStorage バックアップ</span>
              <span className={`font-mono ${dbStatus?.backupAvailable ? 'theme-text-brand' : 'theme-text-muted'}`}>
                {dbStatus?.backupAvailable
                  ? `あり (残り ${remainingBackupDays} 日)`
                  : 'なし'}
              </span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-xs theme-text-muted max-w-md">
              Dexie (IndexedDB) が破損している場合のみ使用してください。
              バックアップ (最終 7 日間) から Dexie を再構築し、ページをリロードします。
            </div>
            <button
              type="button"
              onClick={handleRestoreFromBackup}
              disabled={!dbStatus?.backupAvailable || isRestoring}
              className="btn-hover-effect w-full sm:w-auto px-3.5 py-2 text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 theme-text-amber border border-amber-500/30 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRestoring ? '復元中...' : 'LocalStorage から復元'}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-500/20 pt-4 sm:pt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="text-xs font-bold theme-text-red">データ初期化</div>
            <div className="text-xs theme-text-muted">
              ローカルストレージのプロファイルデータを初期状態に戻します。
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetData}
            className="btn-hover-effect w-full sm:w-auto px-3.5 py-2 text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 theme-text-red border border-red-500/30 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            データを初期化
          </button>
        </div>
      </div>
    </section>
  );
};
