'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import type { TabName, ThemeMode } from '@/types';

import { useToasts } from '@/hooks/useToasts';
import { useConfirm } from '@/hooks/useConfirm';
import { useProfiles } from '@/hooks/useProfiles';
import { useDependencyCheck } from '@/hooks/useDependencyCheck';
import { useZipExport } from '@/hooks/useZipExport';
import { useZipImport } from '@/hooks/useZipImport';
import { fetchLatestMinecraftVersions } from '@/lib/modrinth/client';

import { ToastContainer } from './ToastContainer';
import { ConfirmDialog } from './ConfirmDialog';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { NewProfileModal } from './NewProfileModal';
import { EditProfileModal } from './EditProfileModal';
import { DependencyCheckModal } from './DependencyCheckModal';
import { ZipProgressModal } from './ZipProgressModal';
import { AppContextProvider, type AppContextValue } from './AppContext';

// ============================================================================
// AppShell (Phase 5 版)
//
// Vite 版 App.tsx (300+ 行) の全 hook / モーダル / ヘッダー / ボトムナビを集約。
// Root Layout の Client 直下に 1 インスタンスだけ配置され、内部で AppContext
// を提供する。ページ (children / modal slot) は Context から必要な値を取得。
//
// タブ切替:
//   - Vite 版は setActiveTab() で内部 state を切り替えていた
//   - Next.js 版は `usePathname()` で URL からアクティブタブを判定し、
//     `router.push('/mods')` などで URL ベース遷移する
//
// LocalStorage hydration:
//   - useProfiles は初回 useEffect で復元 → 以降のみ保存
//   - 二重マウントを避けるため AppShell は Root Layout の Client 直下だけ
// ============================================================================

interface Props {
  children: ReactNode;
}

const PATH_TO_TAB: Record<string, TabName> = {
  '/': 'home',
  '/mods': 'mods',
  '/settings': 'settings'
};

const TAB_TO_PATH: Record<TabName, string> = {
  home: '/',
  mods: '/mods',
  settings: '/settings'
};

export const AppShell: React.FC<Props> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();

  // ---------- Toast / Confirm ----------
  const { toasts, showToast, dismissToast } = useToasts();
  const { confirm, dialogProps: confirmDialogProps } = useConfirm();

  // ---------- Theme ----------
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'light') html.classList.remove('dark');
    else html.classList.add('dark');
  }, [theme]);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    []
  );

  // ---------- Profiles ----------
  const {
    profiles,
    setProfiles,
    currentProfileId,
    setCurrentProfileId,
    currentProfile,
    handleSwitchProfile,
    handleCreateProfile,
    handleDuplicateProfile,
    handleSaveEditedProfile,
    handleDeleteProfile,
    handleToggleMod,
    handleUpdateModVersion,
    handleRemoveAllMods
  } = useProfiles(theme, setThemeState, showToast, confirm);

  // ---------- Dependency check ----------
  const { hasDepWarning, runBackgroundDepCheck } = useDependencyCheck(currentProfile);

  // ---------- ZIP export / import ----------
  const {
    isZipModalOpen,
    zipProgress,
    zipStatusText,
    zipStatusCount,
    zipDetailText,
    handleDownloadZip,
    handleCancelZip
  } = useZipExport(currentProfile, showToast);

  // ---------- Modal open states ----------
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isDepCheckModalOpen, setIsDepCheckModalOpen] = useState(false);

  // ZIP import (mrpack 取り込み後、pendingImportData 付きで新規モーダルを開く)
  const {
    pendingImportData,
    setPendingImportData,
    handleImportZipInput,
    handleDropZip
  } = useZipImport(setProfiles, setCurrentProfileId, setIsNewProfileModalOpen, showToast);

  // ---------- MC versions (fallback fetch for Header profile modals) ----------
  // Home ページの SSR 側でも取得しているが、Header からのプロファイル作成/編集
  // ダイアログでも使うため、Client 側でも 1 回だけ取得しておく。
  const [mcVersions, setMcVersions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchLatestMinecraftVersions()
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          setMcVersions(list);
        }
      })
      .catch(() => {
        /* silently ignore, fallback list is used */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Modal helpers ----------
  const openNewProfileModal = useCallback(() => {
    setPendingImportData(null);
    setIsNewProfileModalOpen(true);
  }, [setPendingImportData]);

  const openEditProfileModal = useCallback(() => setIsEditProfileModalOpen(true), []);
  const openDependencyCheckModal = useCallback(() => setIsDepCheckModalOpen(true), []);

  // ---------- Modal-open scroll lock ----------
  // C4-2 修正: /mod/[slug] Parallel Route モーダル表示中も背景スクロールをロック。
  // Vite 版 App.tsx にあった isModDetailModalOpen ガードが Next.js 版で消失していた
  // 回帰バグを usePathname() ベースで復元 (URL が /mod/* かどうかで判定)。
  const isModDetailOpen = pathname?.startsWith('/mod/') ?? false;

  const isAnyModalOpen =
    isNewProfileModalOpen ||
    isEditProfileModalOpen ||
    isDepCheckModalOpen ||
    isZipModalOpen ||
    isModDetailOpen ||
    Boolean(confirmDialogProps.isOpen);

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isAnyModalOpen]);

  // ---------- Reset data ----------
  const handleResetData = useCallback(async () => {
    const ok = await confirm({
      title: 'データを初期化しますか？',
      message:
        '全てのプロファイルと設定が消去され、この操作は取り消せません。\n本当に初期化しますか？',
      confirmLabel: '初期化する',
      cancelLabel: 'キャンセル',
      danger: true
    });
    if (!ok) return;
    try {
      localStorage.removeItem('dropmod_state_v2');
      localStorage.removeItem('craftforge_state_v2');
    } catch {
      /* ignore */
    }
    window.location.reload();
  }, [confirm]);

  // ---------- Tab switching (URL-based) ----------
  // pathname が `/mod/*` の時はモーダル or フルページの詳細画面: BottomNav 側では
  // 「Mod 詳細を開く前にいた画面」に相当するタブを active にしたい。
  // 単純化のため、詳細画面時は home をアクティブ扱いにする (Home からのソフト
  // ナビが最も一般的な導線のため)。
  // M4-7 修正: dead code だった PATH_TO_TAB テーブルを実際に使う (可読性向上)。
  // /mod/[slug] などマッチしないパスは 'home' にフォールバック (Home が最も
  // 一般的な起点タブのため、Mod 詳細画面でも Home が active 表示になる)。
  const activeTab: TabName = useMemo(() => {
    return PATH_TO_TAB[pathname ?? '/'] ?? 'home';
  }, [pathname]);

  const handleSwitchTab = useCallback(
    (tab: TabName) => {
      const targetPath = TAB_TO_PATH[tab] ?? '/';
      if (pathname === targetPath) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      router.push(targetPath);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [pathname, router]
  );

  // ---------- Provide context ----------
  const contextValue: AppContextValue = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme,

      profiles,
      currentProfileId,
      currentProfile,
      handleSwitchProfile,
      handleCreateProfile,
      handleDuplicateProfile,
      handleSaveEditedProfile,
      handleDeleteProfile,
      handleToggleMod,
      handleUpdateModVersion,
      handleRemoveAllMods,

      hasDepWarning,
      runBackgroundDepCheck,

      isZipModalOpen,
      zipProgress,
      zipStatusText,
      zipStatusCount,
      zipDetailText,
      handleDownloadZip,
      handleCancelZip,

      handleImportZipInput,
      handleDropZip,

      showToast,
      confirm,

      openNewProfileModal,
      openEditProfileModal,
      openDependencyCheckModal,

      handleResetData,
      mcVersions
    }),
    [
      theme,
      toggleTheme,
      profiles,
      currentProfileId,
      currentProfile,
      handleSwitchProfile,
      handleCreateProfile,
      handleDuplicateProfile,
      handleSaveEditedProfile,
      handleDeleteProfile,
      handleToggleMod,
      handleUpdateModVersion,
      handleRemoveAllMods,
      hasDepWarning,
      runBackgroundDepCheck,
      isZipModalOpen,
      zipProgress,
      zipStatusText,
      zipStatusCount,
      zipDetailText,
      handleDownloadZip,
      handleCancelZip,
      handleImportZipInput,
      handleDropZip,
      showToast,
      confirm,
      openNewProfileModal,
      openEditProfileModal,
      openDependencyCheckModal,
      handleResetData,
      mcVersions
    ]
  );

  return (
    <AppContextProvider value={contextValue}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        profiles={profiles}
        currentProfileId={currentProfileId}
        onSwitchProfile={handleSwitchProfile}
        onOpenNewProfileModal={openNewProfileModal}
        onRunDependencyCheck={openDependencyCheckModal}
        onDownloadZip={handleDownloadZip}
        onImportZip={handleImportZipInput}
        onSwitchTab={handleSwitchTab}
        hasDepWarning={hasDepWarning}
      />

      {children}

      <BottomNav
        activeTab={activeTab}
        onSwitchTab={handleSwitchTab}
        modCount={currentProfile.mods.length}
        hasDepWarning={hasDepWarning}
      />

      {/* --- グローバル モーダル群 --- */}
      <NewProfileModal
        isOpen={isNewProfileModalOpen}
        onClose={() => {
          setIsNewProfileModalOpen(false);
          setPendingImportData(null);
        }}
        mcVersions={mcVersions}
        initialImportData={pendingImportData}
        onCreate={handleCreateProfile}
      />

      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
        profile={currentProfile}
        mcVersions={mcVersions}
        onSave={handleSaveEditedProfile}
      />

      <DependencyCheckModal
        isOpen={isDepCheckModalOpen}
        onClose={() => setIsDepCheckModalOpen(false)}
        profile={currentProfile}
        onToggleMod={handleToggleMod}
        onRefresh={runBackgroundDepCheck}
      />

      <ZipProgressModal
        isOpen={isZipModalOpen}
        onCancel={handleCancelZip}
        progressPercent={zipProgress}
        statusText={zipStatusText}
        statusCount={zipStatusCount}
        detailText={zipDetailText}
      />

      <ConfirmDialog {...confirmDialogProps} />
    </AppContextProvider>
  );
};
