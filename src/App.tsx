import React, { useState, useEffect } from 'react';
import gsap from 'gsap';
import { ThemeMode, TabName } from './types';
import { CATEGORIES } from './constants/categories';

import { useToasts } from './hooks/useToasts';
import { useProfiles } from './hooks/useProfiles';
import { useModSearch } from './hooks/useModSearch';
import { useDependencyCheck } from './hooks/useDependencyCheck';
import { useZipExport } from './hooks/useZipExport';
import { useZipImport } from './hooks/useZipImport';

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

export const App: React.FC = () => {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [activeTab, setActiveTab] = useState<TabName>('home');

  // Toasts
  const { toasts, showToast, dismissToast } = useToasts();

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
  } = useProfiles(theme, setThemeState, showToast);

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
  const isAnyModalOpen =
    isNewProfileModalOpen ||
    isEditProfileModalOpen ||
    isModDetailModalOpen ||
    isDepCheckModalOpen ||
    isZipModalOpen;

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

  const handleSwitchTab = (tab: TabName) => {
    if (activeTab === tab) return;
    const currEl = document.getElementById(`tab-${activeTab}`);
    if (currEl) {
      gsap.to(currEl, {
        opacity: 0,
        y: -15,
        duration: 0.18,
        ease: 'power2.in',
        onComplete: () => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    } else {
      setActiveTab(tab);
    }
  };

  const handleResetData = () => {
    if (confirm('全てのプロファイルと設定を初期化しますか？')) {
      localStorage.removeItem('dropmod_state_v2');
      // 旧キーの残骸も念のため削除
      localStorage.removeItem('craftforge_state_v2');
      window.location.reload();
    }
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
    </div>
  );
};