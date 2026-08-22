'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { ModItem, ModrinthVersion, Profile } from '@/types';
import { CustomDropdown } from './CustomDropdown';
import { fetchStableModVersion } from '@/lib/modrinth/client';
import { downloadAsBlob } from '@/lib/utils/download';
import { useAppContext } from './AppContext';

// ============================================================================
// ModsPageClient (Phase 5)
//
// Vite 版 `src/components/ModsTab.tsx` の完全移植。差分:
//   - 引数 profile / handleToggleMod / handleUpdateModVersion / ...
//     は全て useAppContext() 経由に変更
//   - Mod カードクリック時の詳細遷移は router.push(`/mod/${slug}`) に統一
//     (Home 経由でなく直接 URL 更新でも Modal Route が動くように)
//   - Vite 版と同一 UX: バージョン切替、.jar 直DL、削除、依存チェック起動、
//     全削除、ZIP 出力
// ============================================================================

export const ModsPageClient: React.FC = () => {
  const router = useRouter();
  const {
    currentProfile: profile,
    handleToggleMod,
    handleUpdateModVersion,
    handleRemoveAllMods,
    handleDownloadZip,
    openDependencyCheckModal
  } = useAppContext();

  const [modVersionsMap, setModVersionsMap] = useState<Map<string, ModrinthVersion[]>>(
    new Map()
  );

  useEffect(() => {
    setModVersionsMap(new Map());
  }, [profile.id, profile.mcVersion, profile.loader]);

  const modIdsSignature = profile.mods.map((m) => m.id).join(',');

  useEffect(() => {
    let active = true;
    const missingMods = profile.mods.filter(
      (mod) => mod.id && !modVersionsMap.has(mod.id)
    );
    if (missingMods.length === 0) {
      const currentIds = new Set(profile.mods.map((m) => m.id));
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
            const versionRes = await fetchStableModVersion(mod.id, profile);
            return { id: mod.id, versions: versionRes?.allVersions };
          } catch {
            return { id: mod.id, versions: undefined };
          }
        })
      );
      if (!active) return;
      setModVersionsMap((prev) => {
        const next = new Map(prev);
        results.forEach(({ id, versions }) => {
          if (versions && versions.length > 0) next.set(id, versions);
        });
        const currentIds = new Set(profile.mods.map((m) => m.id));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modIdsSignature, profile.mcVersion, profile.loader]);

  const handleDirectJarDownload = useCallback(async (mod: ModItem) => {
    if (!mod.fileUrl) return;
    const filename = mod.filename || `${mod.slug || mod.id}.jar`;
    const result = await downloadAsBlob(mod.fileUrl, filename);
    if (!result.ok && result.error !== 'Aborted') {
      console.warn('[DropMod] jar direct download failed:', result);
    }
  }, []);

  const buildVersionOptions = useCallback(
    (mod: ModItem, availableVersions: ModrinthVersion[]) => {
      const opts = availableVersions.map((v) => ({
        label: `${v.version_number} [${
          v.version_type === 'release' ? 'Stable' : v.version_type
        }]`,
        value: v.id
      }));
      const currentId = mod.selectedVersionId || '';
      const hasCurrent = opts.some((o) => o.value === currentId);
      if (currentId && !hasCurrent) {
        opts.unshift({
          label: `${mod.selectedVersionNumber || 'カスタム'} [現在]`,
          value: currentId
        });
      }
      if (opts.length === 0) {
        opts.push({
          label: mod.selectedVersionNumber || '最新安定版',
          value: currentId || 'latest'
        });
      }
      return opts;
    },
    []
  );

  const handleOpenModDetail = useCallback(
    (mod: ModItem) => {
      router.push(`/mod/${mod.slug || mod.id}`);
    },
    [router]
  );

  return (
    <section id="tab-mods" className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass-panel p-4 sm:p-5 rounded-2xl">
        <div>
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <i className="fa-solid fa-cubes-stacked theme-text-brand" aria-hidden />
            選択中のMod一覧
          </h2>
          <p className="text-xs theme-text-muted mt-0.5">
            登録済みのModの安定バージョン変更や、個別・一括ダウンロードが行えます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto w-full sm:w-auto">
          <button
            type="button"
            onClick={openDependencyCheckModal}
            className="btn-hover-effect flex-1 sm:flex-none justify-center px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-500/20 hover:bg-amber-500/30 theme-text-amber border border-amber-500/40 transition flex items-center gap-1.5 shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-shield-halved" aria-hidden />
            依存・競合チェック
          </button>
          <button
            type="button"
            onClick={handleRemoveAllMods}
            className="btn-hover-effect flex-1 sm:flex-none justify-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 theme-text-red border border-red-500/30 transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-trash-can" aria-hidden />
            すべて削除
          </button>
          <button
            type="button"
            onClick={handleDownloadZip}
            className="btn-hover-effect flex-1 sm:flex-none justify-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition flex items-center gap-1.5 shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-file-zipper" aria-hidden />
            ZIP保存 (全.jar)
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border overflow-hidden">
        {profile.mods.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <DesktopTable
              profile={profile}
              modVersionsMap={modVersionsMap}
              buildVersionOptions={buildVersionOptions}
              onOpenDetail={handleOpenModDetail}
              onDirectDownload={handleDirectJarDownload}
              onToggleMod={handleToggleMod}
              onUpdateModVersion={handleUpdateModVersion}
            />
            <MobileList
              profile={profile}
              modVersionsMap={modVersionsMap}
              buildVersionOptions={buildVersionOptions}
              onOpenDetail={handleOpenModDetail}
              onDirectDownload={handleDirectJarDownload}
              onToggleMod={handleToggleMod}
              onUpdateModVersion={handleUpdateModVersion}
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

function EmptyState() {
  // H4-1 修正: <button router.push> → <Link href> に変更 (SEO/新規タブ対応)
  return (
    <div id="empty-mods-state" className="p-8 sm:p-12 text-center">
      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full theme-sub-box flex items-center justify-center mx-auto theme-text-muted text-xl sm:text-2xl mb-3">
        <i className="fa-solid fa-box-open" aria-hidden />
      </div>
      <h3 className="text-sm sm:text-base font-bold">Modが選択されていません</h3>
      <p className="text-xs theme-text-muted mt-1 max-w-sm mx-auto">
        「ホーム」タブからModrinthのModを検索して、このプロファイルに追加してください。
      </p>
      <Link
        href="/"
        className="inline-block mt-4 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl transition shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        Modを探しに行く
      </Link>
    </div>
  );
}

interface RowProps {
  profile: Profile;
  modVersionsMap: Map<string, ModrinthVersion[]>;
  buildVersionOptions: (
    mod: ModItem,
    availableVersions: ModrinthVersion[]
  ) => { label: string; value: string }[];
  onOpenDetail: (mod: ModItem) => void;
  onDirectDownload: (mod: ModItem) => void;
  onToggleMod: (
    id: string,
    e?: React.MouseEvent,
    silent?: boolean
  ) => Promise<void>;
  onUpdateModVersion: (projectId: string, versionId: string) => void | Promise<void>;
}

function DesktopTable({
  profile,
  modVersionsMap,
  buildVersionOptions,
  onOpenDetail,
  onDirectDownload,
  onToggleMod,
  onUpdateModVersion
}: RowProps) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="theme-sub-box text-xs font-semibold uppercase tracking-wider theme-text-muted border-b border-slate-500/20">
            <th className="py-3.5 px-4">Mod名称</th>
            <th className="py-3.5 px-4">カテゴリ</th>
            <th className="py-3.5 px-4">バージョン選択 (安定版)</th>
            <th className="py-3.5 px-4 text-right">ダウンロード / 操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-500/10 text-sm">
          {profile.mods.map((mod) => {
            const availableVersions = modVersionsMap.get(mod.id) || [];
            const versionOptions = buildVersionOptions(mod, availableVersions);
            return (
              <tr key={mod.id} className="hover:bg-slate-500/5 transition">
                <td className="py-3.5 px-4">
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => onOpenDetail(mod)}
                  >
                    {mod.icon_url ? (
                      // H4-3 修正: <img> → next/image (WebP 自動変換 + srcset)
                      <Image
                        src={mod.icon_url}
                        alt={mod.title}
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-lg object-contain bg-slate-800/80 p-0.5 shrink-0 shadow"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 text-xs font-bold shrink-0 shadow">
                        <i className="fa-solid fa-cube" aria-hidden />
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-sm hover:text-emerald-500 transition">
                        {mod.title}
                      </div>
                      <div className="text-xs theme-text-muted">
                        {`by ${mod.author || 'Modrinth'} • ${mod.filename || ''}`}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold theme-badge capitalize">
                    {mod.category || 'mod'}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  <CustomDropdown
                    options={versionOptions}
                    selectedValue={
                      mod.selectedVersionId ||
                      (versionOptions[0] ? versionOptions[0].value : '')
                    }
                    onChange={(newVerId) => onUpdateModVersion(mod.id, newVerId)}
                    label={`${mod.title} のバージョン選択`}
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
                      onClick={(e) => onToggleMod(mod.id, e)}
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
  profile,
  modVersionsMap,
  buildVersionOptions,
  onOpenDetail,
  onDirectDownload,
  onToggleMod,
  onUpdateModVersion
}: RowProps) {
  return (
    <div className="block md:hidden p-3 space-y-3">
      {profile.mods.map((mod) => {
        const availableVersions = modVersionsMap.get(mod.id) || [];
        const versionOptions = buildVersionOptions(mod, availableVersions);
        return (
          <div
            key={mod.id}
            className="glass-card p-3.5 rounded-2xl flex flex-col gap-2.5 border"
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                onClick={() => onOpenDetail(mod)}
              >
                {mod.icon_url ? (
                  // H4-3 修正: <img> → next/image (WebP 自動変換 + srcset)
                  <Image
                    src={mod.icon_url}
                    alt={mod.title}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-lg object-contain bg-slate-800/80 p-0.5 shrink-0 shadow"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 text-xs font-bold shrink-0 shadow">
                    <i className="fa-solid fa-cube" aria-hidden />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-bold text-xs sm:text-sm truncate">
                    {mod.title}
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold theme-badge capitalize">
                    {mod.category || 'mod'}
                  </span>
                </div>
              </div>
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
                  onClick={(e) => onToggleMod(mod.id, e)}
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
                  mod.selectedVersionId ||
                  (versionOptions[0] ? versionOptions[0].value : '')
                }
                onChange={(newVerId) => onUpdateModVersion(mod.id, newVerId)}
                label={`${mod.title} のバージョン選択`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
