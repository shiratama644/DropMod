'use client';

import { SyncButton } from '@/features/sync';
import { useFolderLinked } from '@/features/sync';
import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { shouldUnoptimizeImage } from '@/lib/utils/image';
import { useRouter } from 'next/navigation';
import type { ContentCategory, DropdownOption, ProjectItem, ModrinthVersion } from '@/types';
import { CustomDropdown } from '@/components/ui/CustomDropdown';
import { fetchStableModVersion } from '@/lib/modrinth/client';
import { downloadAsBlob } from '@/lib/utils/download';
import { useCurrentProfileWithFallback } from '../hooks/useCurrentProfileWithFallback';
import { useAppAction } from '@/components/layout/appActions';
import { contentCategoryOf } from '../contentCategory';
import { categoryLabel } from '@/features/catalog';
import { detailPathFromProject } from '@/lib/constants/search';
import { versionDropdownOption } from '@/lib/utils/versionOption';

// ============================================================================
// ModsPageClient (Phase 9-A.2: useAppContext 撤去)
//
// Vite 版 `src/components/ModsTab.tsx` の完全移植。差分:
//   - Mod カードクリック時の詳細遷移は router.push(detailPathFromProject(...)) で /<型>/<slug> へ (ルーティング再設計)
//   - Vite 版と同一 UX: バージョン切替、.jar 直DL、削除、依存チェック起動、
//     全削除、ZIP 出力
//
// Phase 9-A.2 の変更:
//   - useAppContext() を撤去
//   - currentProfile: useProfilesStore の selectCurrentProfile selector で取得
//   - handleXxx 群は appActionsStore 経由 (useAppAction)
// ============================================================================

const PROFILE_TABS: ReadonlyArray<{
  id: ContentCategory;
  label: string;
  icon: string;
  emptyHref: string;
  emptyLabel: string;
}> = [
  { id: 'mod', label: 'Mods', icon: 'fa-solid fa-cube', emptyHref: '/discover/mods', emptyLabel: 'Modを探しに行く' },
  {
    id: 'resourcepack',
    label: 'Resource Packs',
    icon: 'fa-solid fa-palette',
    emptyHref: '/resourcepack',
    emptyLabel: 'Resource Pack ハブへ'
  },
  {
    id: 'shader',
    label: 'Shaders',
    icon: 'fa-solid fa-wand-sparkles',
    emptyHref: '/shader',
    emptyLabel: 'Shader ハブへ'
  }
];

export const ModsPageClient: React.FC = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ContentCategory>('mod');
  const [listQuery, setListQuery] = useState('');

  // ---- Zustand: currentProfile を selector で計算 (profiles/currentProfileId の
  //      どちらかが変わった時のみ再レンダー) ----
  //   B33 修正: 共通 hook (useCurrentProfileWithFallback) に集約、
  //   fallback リテラルの参照安定化と 3 コンポーネント間の DRY を実現。
  const profile = useCurrentProfileWithFallback();

  // ---- appActionsStore 経由 ----
  const handleToggleMod = useAppAction('handleToggleMod');
  const handleUpdateModVersion = useAppAction('handleUpdateModVersion');
  const handleRemoveMods = useAppAction('handleRemoveMods');
  const folderLinked = useFolderLinked();
  const handleDownloadZip = useAppAction('handleDownloadZip');
  const openDependencyCheckModal = useAppAction('openDependencyCheckModal');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [modVersionsMap, setModVersionsMap] = useState<Map<string, ModrinthVersion[]>>(
    new Map()
  );

  // Phase 10-P5 (useExhaustiveDependencies): プロファイルが切り替わった時
  //   (id 変更) or 対応 MC/Loader が変わった時 (別プロファイル環境相当) に
  //   modVersionsMap を全リセットする意図トリガー。effect 本体では 3 依存を
  //   参照しないが、これは仕様通り。
  // biome-ignore lint/correctness/useExhaustiveDependencies: プロファイル切り替え検知トリガーとして意図的
  useEffect(() => {
    setModVersionsMap(new Map());
  }, [profile.id, profile.environment.mcVersion, profile.environment.loader]);

  const modIdsSignature = profile.mods.map((m) => m.projectId).join(',');

  // Phase 10-P5 (useExhaustiveDependencies): 意図的な複合パターン
  //   1. modIdsSignature: mods 配列の内容変化を string 化で diff 検知
  //      (profile.mods 直接 deps だと参照変化毎に発火するため signature 化)
  //   2. profile.mcVersion / profile.loader: fetchStableModVersion に渡す
  //      profile capture の更新検知として明示 (Biome は "signature より generic"
  //      と警告するが、effect 内で使うのは profile 全体で mcVersion/loader も含む)
  //   3. modVersionsMap.has: 内部で参照しているが deps に入れると無限ループ
  //      (この effect が modVersionsMap を setState するため)
  //
  // 従来 eslint-disable-next-line で無視していた。Biome も同じ意図で ignore。
  // biome-ignore lint/correctness/useExhaustiveDependencies: signature 化 + 無限ループ回避のため意図的
  useEffect(() => {
    let active = true;
    const missingMods = profile.mods.filter(
      (mod) => mod.projectId && !modVersionsMap.has(mod.projectId)
    );
    if (missingMods.length === 0) {
      const currentIds = new Set(profile.mods.map((m) => m.projectId));
      let needsClean = false;
      modVersionsMap.forEach((_v, k) => {
        if (!currentIds.has(k)) needsClean = true;
      });
      if (needsClean) {
        const cleaned = new Map<string, ModrinthVersion[]>();
        modVersionsMap.forEach((v, k) => {
          if (currentIds.has(k)) cleaned.set(k, v);
        });
        setModVersionsMap(cleaned);
      }
      return;
    }

    const loadVersions = async () => {
      const results = await Promise.all(
        missingMods.map(async (mod) => {
          try {
            const versionRes = await fetchStableModVersion(mod.projectId, {
              loader: profile.environment.loader,
              mcVersion: profile.environment.mcVersion
            });
            return { id: mod.projectId, versions: versionRes?.allVersions };
          } catch {
            return { id: mod.projectId, versions: undefined };
          }
        })
      );
      if (!active) return;
      setModVersionsMap((prev) => {
        const next = new Map(prev);
        results.forEach(({ id, versions }) => {
          if (versions && versions.length > 0) next.set(id, versions);
        });
        const currentIds = new Set(profile.mods.map((m) => m.projectId));
        Array.from(next.keys()).forEach((k) => {
          if (!currentIds.has(k)) next.delete(k);
        });
        return next;
      });
    };

    if (profile.mods.length > 0) {
      loadVersions();
    }
    return () => {
      active = false;
    };
  }, [modIdsSignature, profile.environment.mcVersion, profile.environment.loader]);

  const handleDirectJarDownload = useCallback(async (mod: ProjectItem) => {
    if (!mod.fileUrl) return;
    const filename = mod.filename || `${mod.slug || mod.projectId}.jar`;
    const result = await downloadAsBlob(mod.fileUrl, filename);
    if (!result.ok && result.error !== 'Aborted') {
      console.warn('[DropMod] jar direct download failed:', result);
    }
  }, []);

  const buildVersionOptions = useCallback(
    (mod: ProjectItem, availableVersions: ModrinthVersion[]): DropdownOption[] => {
      const opts = availableVersions.map((v) =>
        versionDropdownOption(v.version_number, v.id, v.version_type)
      );
      const currentId = mod.versionId || '';
      const hasCurrent = opts.some((o) => o.value === currentId);
      if (currentId && !hasCurrent) {
        opts.unshift(
          versionDropdownOption(
            mod.versionNumber || 'カスタム',
            currentId,
            mod.versionType
          )
        );
      }
      if (opts.length === 0) {
        opts.push({
          label: mod.versionNumber || '最新安定版',
          value: currentId || 'latest'
        });
      }
      return opts;
    },
    []
  );

  // 2026-08-27 修正: Phase 11 で Import された resourcepacks / shaderpacks も
  // タブ表示の対象に含める。従来は profile.mods のみ参照しており、
  // RP / Shader タブに Phase 11 の Import 結果が表示されなかった。
  const allContentItems = useMemo(
    () => [
      ...profile.mods,
      ...(profile.resourcepacks ?? []),
      ...(profile.shaderpacks ?? [])
    ],
    [profile.mods, profile.resourcepacks, profile.shaderpacks]
  );

  const tabCounts = useMemo(() => {
    const counts: Record<ContentCategory, number> = { mod: 0, resourcepack: 0, shader: 0 };
    for (const mod of allContentItems) {
      counts[contentCategoryOf(mod)] += 1;
    }
    return counts;
  }, [allContentItems]);

  const visibleMods = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return allContentItems.filter((mod) => {
      if (contentCategoryOf(mod) !== activeTab) return false;
      if (!q) return true;
      const hay = `${mod.name} ${mod.author ?? ''} ${mod.filename ?? ''} ${mod.slug ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allContentItems, activeTab, listQuery]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: タブ/プロファイル切替で選択を捨てる意図
  useEffect(() => {
    setSelectedIds(new Set());
  }, [profile.id, activeTab]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleIds = useMemo(() => visibleMods.map((m) => m.projectId), [visibleMods]);
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter((id) => selectedIds.has(id)).length,
    [visibleIds, selectedIds]
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (visibleIds.length > 0 && visibleIds.every((id) => next.has(id))) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }, [visibleIds]);

  const handleDeleteSelected = useCallback(async () => {
    const ids = visibleIds.filter((id) => selectedIds.has(id));
    if (ids.length === 0) return;
    await handleRemoveMods(ids);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, [visibleIds, selectedIds, handleRemoveMods]);

  const handleOpenModDetail = useCallback(
    (mod: ProjectItem) => {
      // Phase 9-F: /mod/[slug] → /mods/[slug] (URL 再設計)
      // ⚠️ /profile ページからの遷移は Intercepting Route の scope 外 (別セグメント)
      //    なので通常のフルページ遷移になる。Intercepting Route は /mods 一覧からのみ発火。
      router.push(detailPathFromProject(mod.type, mod.slug || mod.projectId));
    },
    [router]
  );

  return (
    <section id="tab-mods" className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass-panel p-4 sm:p-5 rounded-2xl">
        <div>
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <i className="fa-solid fa-cubes-stacked theme-text-brand" aria-hidden />
            選択中一覧
          </h2>
          <p className="text-xs theme-text-muted mt-0.5">
            Mods / Resource Packs / Shaders を切り替え、名前で絞り込めます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto w-full sm:w-auto">
          <button
            type="button"
            onClick={openDependencyCheckModal}
            className="btn-hover-effect flex-1 sm:flex-none justify-center px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-500/20 hover:bg-amber-500/30 theme-text-amber border border-amber-500/40 transition flex items-center gap-1.5 shadow focus-visible:ring-2 focus-visible:ring-emerald-500 md:hidden"
          >
            <i className="fa-solid fa-shield-halved" aria-hidden />
            依存・競合チェック
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteSelected()}
            disabled={selectedVisibleCount === 0}
            className="btn-hover-effect flex-1 sm:flex-none justify-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 theme-text-red border border-red-500/30 transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 disabled:pointer-events-none"
          >
            <i className="fa-solid fa-trash-can" aria-hidden />
            {`選択を削除${selectedVisibleCount > 0 ? ` (${selectedVisibleCount})` : ''}`}
          </button>
          {/* D-8: フォルダ紐付け済みなら Sync に置き換える (プロファイルごと) */}
          {folderLinked ? (
            <SyncButton
              variant="primary"
              label="フォルダへ同期 (全.jar)"
              className="flex-1 sm:flex-none md:hidden"
            />
          ) : (
            <button
              type="button"
              onClick={handleDownloadZip}
              className="btn-hover-effect flex-1 sm:flex-none justify-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition flex items-center gap-1.5 shadow focus-visible:ring-2 focus-visible:ring-emerald-500 md:hidden"
            >
              <i className="fa-solid fa-file-zipper" aria-hidden />
              ZIP保存 (全.jar)
            </button>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl border overflow-hidden">
        <div className="p-3 sm:p-4 space-y-3 border-b border-slate-500/15">
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1" role="tablist" aria-label="コンテンツ種別">
            {PROFILE_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`btn-hover-effect px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isActive
                      ? 'bg-emerald-600 text-slate-950 font-bold shadow'
                      : 'theme-sub-box theme-text-secondary hover:text-emerald-500'
                  }`}
                >
                  <i className={tab.icon} aria-hidden />
                  <span>{tab.label}</span>
                  <span className="font-mono opacity-80">{tabCounts[tab.id]}</span>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <i
              className="fa-solid fa-magnifying-glass theme-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="選択中の名前・作者で検索..."
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs sm:text-sm dynamic-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
            {listQuery && (
              <button
                type="button"
                onClick={() => setListQuery('')}
                aria-label="検索内容をクリア"
                className="absolute right-3 top-1/2 -translate-y-1/2 theme-text-muted hover:text-emerald-500 text-xs p-1"
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            )}
          </div>
        </div>
        {visibleMods.length === 0 ? (
          <EmptyState
            tab={activeTab}
            hasAny={tabCounts[activeTab] > 0}
            query={listQuery}
          />
        ) : (
          <>
            <DesktopTable
              items={visibleMods}
              modVersionsMap={modVersionsMap}
              buildVersionOptions={buildVersionOptions}
              onOpenDetail={handleOpenModDetail}
              onDirectDownload={handleDirectJarDownload}
              onToggleMod={handleToggleMod}
              onUpdateModVersion={handleUpdateModVersion}
              selectedIds={selectedIds}
              allVisibleSelected={allVisibleSelected}
              onToggleSelected={toggleSelected}
              onToggleSelectAll={toggleSelectAllVisible}
            />
            <MobileList
              items={visibleMods}
              modVersionsMap={modVersionsMap}
              buildVersionOptions={buildVersionOptions}
              onOpenDetail={handleOpenModDetail}
              onDirectDownload={handleDirectJarDownload}
              onToggleMod={handleToggleMod}
              onUpdateModVersion={handleUpdateModVersion}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
            />
          </>
        )}
      </div>
    </section>
  );
};

// -----------------------------------------------------------------------------
// 内部小コンポーネント
// -----------------------------------------------------------------------------

function EmptyState({
  tab,
  hasAny,
  query
}: {
  tab: ContentCategory;
  hasAny: boolean;
  query: string;
}) {
  const meta = PROFILE_TABS.find((t) => t.id === tab) ?? PROFILE_TABS[0];
  if (!meta) return null;
  if (hasAny && query.trim()) {
    return (
      <div id="empty-mods-state" className="p-8 sm:p-12 text-center">
        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full theme-sub-box flex items-center justify-center mx-auto theme-text-muted text-xl sm:text-2xl mb-3">
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
        </div>
        <h3 className="text-sm sm:text-base font-bold">一致する項目がありません</h3>
        <p className="text-xs theme-text-muted mt-1 max-w-sm mx-auto">
          検索語を変えるか、クリアして一覧に戻ってください。
        </p>
      </div>
    );
  }
  return (
    <div id="empty-mods-state" className="p-8 sm:p-12 text-center">
      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full theme-sub-box flex items-center justify-center mx-auto theme-text-muted text-xl sm:text-2xl mb-3">
        <i className="fa-solid fa-box-open" aria-hidden />
      </div>
      <h3 className="text-sm sm:text-base font-bold">{`${meta.label} はまだありません`}</h3>
      <p className="text-xs theme-text-muted mt-1 max-w-sm mx-auto">
        「探す」から追加するか、Phase 11 のフォルダ取り込みで自動検出できます。
      </p>
      <Link
        href={meta.emptyHref}
        className="inline-block mt-4 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl transition shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        {meta.emptyLabel}
      </Link>
    </div>
  );
}

interface RowProps {
  items: ProjectItem[];
  modVersionsMap: Map<string, ModrinthVersion[]>;
  buildVersionOptions: (
    mod: ProjectItem,
    availableVersions: ModrinthVersion[]
  ) => DropdownOption[];
  onOpenDetail: (mod: ProjectItem) => void;
  onDirectDownload: (mod: ProjectItem) => void;
  onToggleMod: (
    id: string,
    e?: React.MouseEvent,
    silent?: boolean
  ) => Promise<void>;
  onUpdateModVersion: (
    projectId: string,
    versionId: string,
    knownVersion?: ModrinthVersion
  ) => void | Promise<void>;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
}

function DesktopTable({
  items,
  modVersionsMap,
  buildVersionOptions,
  onOpenDetail,
  onDirectDownload,
  onToggleMod,
  onUpdateModVersion,
  selectedIds,
  onToggleSelected,
  allVisibleSelected,
  onToggleSelectAll
}: RowProps & { allVisibleSelected: boolean; onToggleSelectAll: () => void }) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="theme-sub-box text-xs font-semibold uppercase tracking-wider theme-text-muted border-b border-slate-500/20">
            <th className="py-3.5 pl-4 pr-1 w-10">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onToggleSelectAll}
                aria-label="表示中をすべて選択"
                className="size-4 accent-emerald-600"
              />
            </th>
            <th className="py-3.5 px-4">Mod名称</th>
            <th className="py-3.5 px-4">カテゴリ</th>
            <th className="py-3.5 px-4">バージョン選択</th>
            <th className="py-3.5 px-4 text-right">ダウンロード / 操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-500/10 text-sm">
          {items.map((mod) => {
            const availableVersions = modVersionsMap.get(mod.projectId) || [];
            const versionOptions = buildVersionOptions(mod, availableVersions);
            return (
              <tr key={mod.projectId} className="hover:bg-slate-500/5 transition">
                <td className="py-3.5 pl-4 pr-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(mod.projectId)}
                    onChange={() => onToggleSelected(mod.projectId)}
                    aria-label={`${mod.name} を選択`}
                    className="size-4 accent-emerald-600"
                  />
                </td>
                <td className="py-3.5 px-4">
                  {/* Phase 10-P5 (a11y/useSemanticElements 相当):
                      Mod 詳細を開く UI は意味論的に button。
                      button 標準スタイルを打ち消すため text-left / w-full を追加。 */}
                  <button
                    type="button"
                    className="flex items-center gap-3 cursor-pointer w-full text-left"
                    onClick={() => onOpenDetail(mod)}
                  >
                    {mod.icon_url ? (
                      // <img> → next/image (WebP 自動変換 + srcset)
                      <Image
                        src={mod.icon_url}
                        alt={mod.name}
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-lg object-contain bg-slate-800/80 p-0.5 shrink-0 shadow"
                          unoptimized={shouldUnoptimizeImage(mod.icon_url)}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 text-xs font-bold shrink-0 shadow">
                        <i className="fa-solid fa-cube" aria-hidden />
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-sm hover:text-emerald-500 transition">
                        {mod.name}
                      </div>
                      <div className="text-xs theme-text-muted">
                        {`by ${mod.author || 'Modrinth'} • ${mod.filename || ''}`}
                      </div>
                    </div>
                  </button>
                </td>
                <td className="py-3.5 px-4">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold theme-badge capitalize">
                    {categoryLabel(mod.category)}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  <CustomDropdown
                    options={versionOptions}
                    selectedValue={
                      mod.versionId ||
                      (versionOptions[0] ? versionOptions[0].value : '')
                    }
                    onChange={(newVerId) =>
                      onUpdateModVersion(
                        mod.projectId,
                        newVerId,
                        availableVersions.find((v) => v.id === newVerId)
                      )
                    }
                    label={`${mod.name} のバージョン選択`}
                  />
                </td>
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {mod.fileUrl && (
                      <button
                        type="button"
                        onClick={() => onDirectDownload(mod)}
                        className="p-2 theme-text-blue hover:opacity-80 hover:bg-blue-500/10 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                        title=".jar を直接ダウンロード"
                      >
                        <i className="fa-solid fa-download text-sm" aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => onToggleMod(mod.projectId, e)}
                      className="p-2 theme-text-muted hover:theme-text-red hover:bg-red-500/10 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                      title="削除"
                    >
                      <i className="fa-solid fa-trash-can text-sm" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MobileList({
  items,
  modVersionsMap,
  buildVersionOptions,
  onOpenDetail,
  onDirectDownload,
  onToggleMod,
  onUpdateModVersion,
  selectedIds,
  onToggleSelected
}: RowProps) {
  return (
    <div className="block md:hidden p-3 space-y-3">
      {items.map((mod) => {
        const availableVersions = modVersionsMap.get(mod.projectId) || [];
        const versionOptions = buildVersionOptions(mod, availableVersions);
        return (
          <div
            key={mod.projectId}
            className="glass-card p-3.5 rounded-2xl flex flex-col gap-2.5 border"
          >
            <div className="flex items-center justify-between gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(mod.projectId)}
                onChange={() => onToggleSelected(mod.projectId)}
                aria-label={`${mod.name} を選択`}
                className="size-4 accent-emerald-600 shrink-0"
              />
              {/* Phase 10-P5 (a11y/useSemanticElements 相当):
                  Mod 詳細を開く UI は意味論的に button。
                  button 標準スタイルを打ち消すため text-left / w-auto を保持。 */}
              <button
                type="button"
                className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left flex-1"
                onClick={() => onOpenDetail(mod)}
              >
                {mod.icon_url ? (
                  // <img> → next/image (WebP 自動変換 + srcset)
                  <Image
                    src={mod.icon_url}
                    alt={mod.name}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-lg object-contain bg-slate-800/80 p-0.5 shrink-0 shadow"
                      unoptimized={shouldUnoptimizeImage(mod.icon_url)}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 text-xs font-bold shrink-0 shadow">
                    <i className="fa-solid fa-cube" aria-hidden />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-bold text-xs sm:text-sm truncate">
                    {mod.name}
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold theme-badge capitalize">
                    {categoryLabel(mod.category)}
                  </span>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {mod.fileUrl && (
                  <button
                    type="button"
                    onClick={() => onDirectDownload(mod)}
                    className="p-2 theme-text-blue active:bg-blue-500/10 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                    title=".jar を直接ダウンロード"
                  >
                    <i className="fa-solid fa-download text-sm" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => onToggleMod(mod.projectId, e)}
                  className="p-2 theme-text-muted active:theme-text-red active:bg-red-500/10 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <i className="fa-solid fa-trash-can text-sm" aria-hidden />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-500/10">
              <span className="text-xs theme-text-muted font-medium">
                バージョン:
              </span>
              <CustomDropdown
                options={versionOptions}
                selectedValue={
                  mod.versionId ||
                  (versionOptions[0] ? versionOptions[0].value : '')
                }
                onChange={(newVerId) => onUpdateModVersion(mod.projectId, newVerId)}
                label={`${mod.name} のバージョン選択`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
