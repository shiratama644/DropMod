'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import type { TabName } from '@/types';

import { useToasts } from '@/hooks/useToasts';
import { useConfirm } from '@/hooks/useConfirm';
import { useProfiles } from '@/hooks/useProfiles';
import { useDependencyCheck } from '@/hooks/useDependencyCheck';
import { useZipExport } from '@/hooks/useZipExport';
import { useZipImport } from '@/hooks/useZipImport';
import { fetchLatestMinecraftVersions } from '@/lib/modrinth/client';
import { db } from '@/lib/db/dexie';
import { useProfilesStore } from '@/lib/store/profiles';

import { ToastContainer } from './ToastContainer';
import { ConfirmDialog } from './ConfirmDialog';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { DesktopSidebar } from './DesktopSidebar';
import { NewProfileModal } from './NewProfileModal';
import { EditProfileModal } from './EditProfileModal';
import { DependencyCheckModal } from './DependencyCheckModal';
import { ZipProgressModal } from './ZipProgressModal';
import { useAppActionsStore } from '@/lib/store/appActions';
// QueryProviders は app/layout.tsx に移設 (C7-2 対応で useQueryClient が
// AppShell 内で呼ばれるようになったため、AppShell 自身を Provider 内に配置する必要あり)
import { OfflineBanner } from './OfflineBanner';
import { WebVitalsReporter } from './WebVitalsReporter';

// ============================================================================
// AppShell
//
// Vite 版 App.tsx (300+ 行) の全 hook / モーダル / ヘッダー / ボトムナビを集約。
// Root Layout の Client 直下に 1 インスタンスだけ配置。
// 下流コンポーネント (Settings/Mods/Home/ModDetail) は Zustand
// (useProfilesStore / useAppActionsStore 等) を直接参照する。
// (Phase 10-B: AppContext 完全削除)
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

// Phase 9-F: URL 再設計に伴い 4 タブ構成
//   - Home  (/)         → 'home'
//   - 探す  (/mods)     → 'mods'      (Modrinth 検索一覧)
//   - 現在  (/profile)  → 'profile'   (選択中プロファイル、旧 /mods の役割)
//   - 設定  (/settings) → 'settings'
const PATH_TO_TAB: Record<string, TabName> = {
  '/': 'home',
  '/mods': 'mods',
  '/profile': 'profile',
  '/settings': 'settings'
};

// TAB_TO_PATH は <Link href> 化 + handleSwitchTab を scroll のみに
// 変更したため未使用になった (削除)。旧: router.push(TAB_TO_PATH[tab]) 用途。

export const AppShell: React.FC<Props> = ({ children }) => {
  const pathname = usePathname();

  // ---------- Toast / Confirm ----------
  const { toasts, showToast, dismissToast } = useToasts();
  const { confirm, dialogProps: confirmDialogProps } = useConfirm();

  // ---------- Theme (Sub-Phase 8-C: Zustand 経由) ----------
  const theme = useProfilesStore((s) => s.theme);
  const setThemeState = useProfilesStore((s) => s.setTheme);
  const toggleTheme = useProfilesStore((s) => s.toggleTheme);
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'light') html.classList.remove('dark');
    else html.classList.add('dark');
  }, [theme]);

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
  // Phase 10-P3: 詳細ページのスクロール不能バグを修正。
  //
  // 従来 (Phase 9-F):
  //   `const isModDetailOpen = pathname?.startsWith('/mods/') ?? false`
  //   を isAnyModalOpen に含めていたため、モーダル (Intercepting Route) と
  //   フルページ (直接 URL アクセス) を URL だけでは区別できず、
  //   フルページ `/mods/sodium` を開いても body に overflow:hidden + touchAction:none
  //   がかかり、マウスホイール / タッチスクロールが完全に殺されていた。
  //
  // 修正:
  //   URL ベースの一律ロックを撤廃。モーダル (variant="modal") がマウント中の
  //   スクロール抑止は ModDetailModalShell 自身の useEffect で自己管理する
  //   (Vite 版 App.tsx の isModDetailModalOpen ガードと同等の効果を持ちつつ、
  //    フルページには影響しない)。
  //
  //   isAnyModalOpen の残り 5 個 (NewProfile / EditProfile / DepCheck / Zip /
  //   Confirm) は AppShell 直下の Client Component として mount/unmount が
  //   AppShell 内で完結するため、従来通り AppShell 側でロックする。

  const isAnyModalOpen =
    isNewProfileModalOpen ||
    isEditProfileModalOpen ||
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

  // Header / BottomNav は常時表示 (スクロール hide は撤回)。

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
      // Sub-Phase 8-A: Dexie (IndexedDB) を削除。
      //   - profiles / apiCache / meta の 3 テーブルを含む DropModDB ごと削除
      //   - Dexie.delete() は非同期だが await で完了を待ってから reload する
      //   - close() を先に呼ぶことで他タブのハンドルを切り reload 後の再作成を確実にする
      await db.close();
      await db.delete();

      // LocalStorage バックアップ (7 日間分) も削除
      localStorage.removeItem('dropmod_state_v2');
      localStorage.removeItem('craftforge_state_v2');

      // SSR プロファイル情報を保持する cookie も削除。
      // これが無いと reload 後の SSR で旧プロファイル用 Mod カードが並び、
      // ユーザーには「初期化バグ」に見える。
      // 書き込み側と同じく Secure フラグを付けて削除リクエスト
      // (localhost では自動的に無視される)
      // Phase 10-P5 (noDocumentCookie): SSR 用 active profile cookie の削除。
      //   cookieStore API は Safari 未対応 (2026 時点 experimental) なので直接操作。
      // biome-ignore lint/suspicious/noDocumentCookie: SSR 用 cookie 削除 (max-age=0)
      document.cookie = 'dropmod_active_profile=; path=/; max-age=0; SameSite=Lax; Secure';
      // biome-ignore lint/suspicious/noDocumentCookie: theme FOUC cookie 削除
      document.cookie = 'dropmod_theme=; path=/; max-age=0; SameSite=Lax; Secure';
    } catch (e) {
      console.warn('[DropMod] データ初期化中に例外:', e);
    }
    window.location.reload();
  }, [confirm]);

  // ---------- Tab switching (URL-based) ----------
  // pathname が `/mods/xxx` の時はモーダル or フルページの詳細画面: BottomNav 側では
  // 「Mod 詳細を開く前にいた画面」に相当するタブ ('mods') を active にしたい。
  //
  // Phase 9-F: URL 再設計後の判定
  //   - /mods/xxx  → 'mods' タブ (Mod 詳細は /mods 由来の遷移が主)
  //   - その他マッチしないパスは 'home' フォールバック
  const activeTab: TabName = useMemo(() => {
    const path = pathname ?? '/';
    // /mods/[slug] の場合は 'mods' タブを active に (Mod 詳細はモーダル or フルページ)
    if (path.startsWith('/mods/')) return 'mods';
    return PATH_TO_TAB[path] ?? 'home';
  }, [pathname]);

  // BottomNav/Header は <Link href> で遷移し、
  // このハンドラはスクロールトップ処理のみを担当。
  // 以前は router.push() を実行していたため <Link> の navigation と
  // 二重遷移が発生していた (URL 履歴汚染 + RSC ペイロード fetch レース)。
  //
  // なお TAB_TO_PATH は「同じタブを再クリック時のパス判定」に依然使用するが、
  // 実質的にはどのタブでも scrollTo するので現状は使わない。
  const handleSwitchTab = useCallback((_tab: TabName) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ---------- (Phase 9-A.5 / 10-B) contextValue useMemo は撤去済み ----------
  //   従来 30+ フィールドを含む Fat Context を作っていたが、Phase 9-A で全 4 消費者
  //   コンポーネントを Zustand + appActionsStore 直接参照に移行 → Phase 10-B で
  //   AppContext.tsx 自体を完全削除。

  // Phase 9-A: appActionsStore への登録
  //   下流コンポーネント (Settings/Mods/Home/ModDetail) が Zustand 直接参照で
  //   action を取得できるようにする。
  //   AppShell がマウントされている間だけ有効。
  //
  // B19 修正: 従来は cleanup で unregisterAppActions() を呼んでいたため、
  //   props/state 変化のたびに 「unregister → register」 の 1 tick window が
  //   発生 (Strict Mode の double-invoke で顕在化)、その間の button click で
  //   useAppAction が no-op を返してしまう問題があった。
  //   → cleanup を撤廃し、次の register 呼び出しで上書きされる形にする。
  //      「actions=null」の window を排除。
  //   → unmount 時のみ確実に unregister するため、別 useEffect ([] deps) を分離。
  const registerAppActions = useAppActionsStore((s) => s.registerAppActions);
  const unregisterAppActions = useAppActionsStore((s) => s.unregisterAppActions);
  useEffect(() => {
    registerAppActions({
      handleSwitchProfile,
      handleCreateProfile,
      handleDuplicateProfile,
      handleSaveEditedProfile,
      handleDeleteProfile,
      handleToggleMod,
      handleUpdateModVersion,
      handleRemoveAllMods,
      runBackgroundDepCheck,
      handleDownloadZip,
      handleCancelZip,
      handleImportZipInput,
      handleDropZip,
      openNewProfileModal,
      openEditProfileModal,
      openDependencyCheckModal,
      handleResetData,
      mcVersions,
      currentProfile
    });
    // B19 修正: cleanup で unregister を呼ばない (次の register で上書きされるだけ)
  }, [
    registerAppActions,
    handleSwitchProfile,
    handleCreateProfile,
    handleDuplicateProfile,
    handleSaveEditedProfile,
    handleDeleteProfile,
    handleToggleMod,
    handleUpdateModVersion,
    handleRemoveAllMods,
    runBackgroundDepCheck,
    handleDownloadZip,
    handleCancelZip,
    handleImportZipInput,
    handleDropZip,
    openNewProfileModal,
    openEditProfileModal,
    openDependencyCheckModal,
    handleResetData,
    mcVersions,
    currentProfile
  ]);

  // B19 修正: unmount 時のみ unregister (メモリリーク防止のため)
  useEffect(() => {
    return () => {
      unregisterAppActions();
    };
  }, [unregisterAppActions]);

  return (
    <>
      <WebVitalsReporter />
      <OfflineBanner />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* PC (md 以上): 左固定サイドバー。全ページで表示 (LP でも表示) */}
      <DesktopSidebar
        activeTab={activeTab}
        onSwitchTab={handleSwitchTab}
        modCount={currentProfile.mods.length}
        hasDepWarning={hasDepWarning}
        theme={theme}
        onToggleTheme={toggleTheme}
        profiles={profiles}
        currentProfileId={currentProfileId}
        onSwitchProfile={handleSwitchProfile}
        onOpenNewProfileModal={openNewProfileModal}
        onRunDependencyCheck={openDependencyCheckModal}
        onDownloadZip={handleDownloadZip}
        onImportZip={handleImportZipInput}
      />

      {/* モバイル (< md) 専用の上部 Header。PC は DesktopSidebar のみ。
          LP は Header 非表示 (BottomNav のみ)。Header 自体も md:hidden。 */}
      {pathname !== '/' && (
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
      )}

      {/* コンテンツ area: PC は左サイドバー分の余白 (pl-64)。
          既存ページの構造 (max-w-* mx-auto など) は保持。 */}
      <div className="md:pl-64">{children}</div>

      {/* モバイル (< md) 専用の下部 BottomNav。md:hidden 指定済み。常時表示。 */}
      <BottomNav
        activeTab={activeTab}
        onSwitchTab={handleSwitchTab}
        modCount={currentProfile.mods.length}
        hasDepWarning={hasDepWarning}
        theme={theme}
        onToggleTheme={toggleTheme}
        onDownloadZip={handleDownloadZip}
        onImportZip={handleImportZipInput}
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
    </>
  );
};
