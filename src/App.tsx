import React, { useState, useEffect } from 'react';
import { ThemeMode, TabName } from './types';
import { CATEGORIES } from './constants/categories';

import { useToasts } from './hooks/useToasts';
import { useProfiles } from './hooks/useProfiles';
import { useModSearch } from './hooks/useModSearch';
import { useDependencyCheck } from './hooks/useDependencyCheck';
import { useZipExport } from './hooks/useZipExport';
import { useZipImport } from './hooks/useZipImport';
import { useConfirm } from './hooks/useConfirm';

import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ToastContainer } from './components/ToastContainer';
import { HomeTab } from './components/HomeTab';
import { ModsTab } from './components/ModsTab';
import { SettingsTab } from './components/SettingsTab';
import { NewProfileModal } from './components/NewProfileModal';
import { EditProfileModal } from './components/EditProfileModal';
import { ModDetailModal } from './components/ModDetailModal';
import { DependencyCheckModal } from './components/DependencyCheckModal';
import { ZipProgressModal } from './components/ZipProgressModal';
import { ConfirmDialog } from './components/ConfirmDialog';

export const App: React.FC = () => {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [activeTab, setActiveTab] = useState<TabName>('home');

  // Toasts
  const { toasts, showToast, dismissToast } = useToasts();

  // Custom Confirm (window.confirm 置換)
  const { confirm, dialogProps: confirmDialogProps } = useConfirm();

  // Profiles
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

  // Mod Search
  const {
    mcVersions,
    selectedCategory,
    setSelectedCategory,
    sortBy,
    setSortBy,
    searchInput,
    setSearchInput,
    hits,
    isLoadingMods,
    hasMoreMods,
    searchError,
    retrySearch,
    sentinelRef
  } = useModSearch(currentProfile, activeTab, showToast);

  // Dependency Check
  const { hasDepWarning, runBackgroundDepCheck } = useDependencyCheck(currentProfile);

  // ZIP Export
  const {
    isZipModalOpen,
    zipProgress,
    zipStatusText,
    zipStatusCount,
    zipDetailText,
    handleDownloadZip,
    handleCancelZip
  } = useZipExport(currentProfile, showToast);

  // Modal State
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isModDetailModalOpen, setIsModDetailModalOpen] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [isDepCheckModalOpen, setIsDepCheckModalOpen] = useState(false);

  // ZIP Import
  const {
    pendingImportData,
    setPendingImportData,
    handleImportZipInput,
    handleDropZip
  } = useZipImport(setProfiles, setCurrentProfileId, setIsNewProfileModalOpen, showToast);

  // ダークモードクラス切替
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'light') html.classList.remove('dark');
    else html.classList.add('dark');
  }, [theme]);

  // モーダルオープン時の背景スクロールロック
  // (ConfirmDialog もカウントしないと、確認ダイアログ表示中に背景が
  //  スクロール可能になり、ダイアログの touch/pointer 対象がずれる)
  const isAnyModalOpen =
    isNewProfileModalOpen ||
    isEditProfileModalOpen ||
    isModDetailModalOpen ||
    isDepCheckModalOpen ||
    isZipModalOpen ||
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

  // ---------------------------------------------------------------------
  // タブ切替
  //
  // 以前は GSAP で `document.getElementById('tab-xxx')` に opacity:0 を
  // 書き込んでから setActiveTab() していた。しかしこのアプローチは以下の
  // 深刻な不具合を持っていた:
  //   - onComplete が発火しないと画面が opacity:0 のまま残る (真っ暗)
  //   - 同じ id を持つ要素が React 差し替えで残ると inline style が残留
  //   - タブ切替中に別要因で再レンダーされると DOM 参照が古い
  // → シンプルに state 切替のみ。フェード演出は CSS animation 側で担当。
  // ---------------------------------------------------------------------
  const handleSwitchTab = (tab: TabName) => {
    if (activeTab === tab) return;
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetData = async () => {
    const ok = await confirm({
      title: 'データを初期化しますか？',
      message:
        '全てのプロファイルと設定が消去され、この操作は取り消せません。\n本当に初期化しますか？',
      confirmLabel: '初期化する',
      cancelLabel: 'キャンセル',
      danger: true
    });
    if (!ok) return;
    localStorage.removeItem('dropmod_state_v2');
    // 旧キーの残骸も念のため削除
    localStorage.removeItem('craftforge_state_v2');
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col pb-28 md:pb-24">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <Header
        theme={theme}
        onToggleTheme={() => setThemeState(theme === 'dark' ? 'light' : 'dark')}
        profiles={profiles}
        currentProfileId={currentProfileId}
        onSwitchProfile={handleSwitchProfile}
        onOpenNewProfileModal={() => {
          setPendingImportData(null);
          setIsNewProfileModalOpen(true);
        }}
        onRunDependencyCheck={() => setIsDepCheckModalOpen(true)}
        onDownloadZip={handleDownloadZip}
        onImportZip={handleImportZipInput}
        onSwitchTab={handleSwitchTab}
        hasDepWarning={hasDepWarning}
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
        {activeTab === 'home' && (
          <HomeTab
            profile={currentProfile}
            onEditProfile={() => setIsEditProfileModalOpen(true)}
            onDuplicateProfile={handleDuplicateProfile}
            onRunDependencyCheck={() => setIsDepCheckModalOpen(true)}
            onSwitchTab={handleSwitchTab}
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            onClearSearch={() => setSearchInput('')}
            sortBy={sortBy}
            onChangeSortBy={setSortBy}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            categories={CATEGORIES}
            hits={hits}
            isLoading={isLoadingMods}
            hasMore={hasMoreMods}
            searchError={searchError}
            onRetrySearch={retrySearch}
            onOpenModDetail={(id) => {
              setDetailProjectId(id);
              setIsModDetailModalOpen(true);
            }}
            onToggleMod={handleToggleMod}
            sentinelRef={sentinelRef}
          />
        )}

        {activeTab === 'mods' && (
          <ModsTab
            profile={currentProfile}
            onRunDependencyCheck={() => setIsDepCheckModalOpen(true)}
            onRemoveAllMods={handleRemoveAllMods}
            onDownloadZip={handleDownloadZip}
            onSwitchTab={handleSwitchTab}
            onOpenModDetail={(id) => {
              setDetailProjectId(id);
              setIsModDetailModalOpen(true);
            }}
            onToggleMod={handleToggleMod}
            onUpdateModVersion={handleUpdateModVersion}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            theme={theme}
            onSetTheme={setThemeState}
            onDownloadZip={handleDownloadZip}
            onImportZip={handleImportZipInput}
            onDropZip={handleDropZip}
            profiles={profiles}
            currentProfileId={currentProfileId}
            onSwitchProfile={handleSwitchProfile}
            onOpenNewProfileModal={() => {
              setPendingImportData(null);
              setIsNewProfileModalOpen(true);
            }}
            onDeleteProfile={handleDeleteProfile}
            onResetData={handleResetData}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onSwitchTab={handleSwitchTab}
        modCount={currentProfile.mods.length}
        hasDepWarning={hasDepWarning}
      />

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

      <ModDetailModal
        isOpen={isModDetailModalOpen}
        onClose={() => setIsModDetailModalOpen(false)}
        projectId={detailProjectId}
        profile={currentProfile}
        onToggleMod={handleToggleMod}
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

      {/* window.confirm() 置換用 (プロファイル削除・全Mod削除・データ初期化で使用) */}
      <ConfirmDialog {...confirmDialogProps} />
    </div>
  );
};