import React, { useState, useEffect } from 'react';
import { Profile, ModItem, ModrinthVersion } from '../types';
import { CustomDropdown } from './CustomDropdown';
import { fetchStableModVersion } from '../services/api';

interface ModsTabProps {
  profile: Profile;
  onRunDependencyCheck: () => void;
  onRemoveAllMods: () => void;
  onDownloadZip: () => void;
  onSwitchTab: (tab: 'home' | 'mods' | 'settings') => void;
  onOpenModDetail: (id: string) => void;
  onToggleMod: (id: string, e: React.MouseEvent) => void;
  onUpdateModVersion: (projectId: string, versionId: string) => void;
}

export const ModsTab: React.FC<ModsTabProps> = ({
  profile,
  onRunDependencyCheck,
  onRemoveAllMods,
  onDownloadZip,
  onSwitchTab,
  onOpenModDetail,
  onToggleMod,
  onUpdateModVersion
}) => {
  const [modVersionsMap, setModVersionsMap] = useState<Map<string, ModrinthVersion[]>>(new Map());

  useEffect(() => {
    let active = true;
    const loadVersions = async () => {
      const newMap = new Map<string, ModrinthVersion[]>();
      for (const mod of profile.mods) {
        try {
          const versionRes = await fetchStableModVersion(mod.id, profile);
          if (versionRes && active) {
            newMap.set(mod.id, versionRes.allVersions);
          }
        } catch (e) {}
      }
      if (active) setModVersionsMap(newMap);
    };
    if (profile.mods.length > 0) {
      loadVersions();
    }
    return () => {
      active = false;
    };
  }, [profile.mods, profile.mcVersion, profile.loader]);

  return (
    <section id="tab-mods" className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass-panel p-4 sm:p-5 rounded-2xl">
        <div>
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <i className="fa-solid fa-cubes-stacked theme-text-brand"></i>
            選択中のMod一覧
          </h2>
          <p className="text-xs theme-text-muted mt-0.5">
            登録済みのModの安定バージョン変更や、個別・一括ダウンロードが行えます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto w-full sm:w-auto">
          <button
            onClick={onRunDependencyCheck}
            className="btn-hover-effect flex-1 sm:flex-none justify-center px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-500/20 hover:bg-amber-500/30 theme-text-amber border border-amber-500/40 transition flex items-center gap-1.5 shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-shield-halved"></i> 依存・競合チェック
          </button>
          <button
            onClick={onRemoveAllMods}
            className="btn-hover-effect flex-1 sm:flex-none justify-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 theme-text-red border border-red-500/30 transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-trash-can"></i> すべて削除
          </button>
          <button
            onClick={onDownloadZip}
            className="btn-hover-effect flex-1 sm:flex-none justify-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition flex items-center gap-1.5 shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-file-zipper"></i> ZIP保存 (全.jar)
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border overflow-hidden">
        {profile.mods.length === 0 ? (
          <div id="empty-mods-state" className="p-8 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full theme-sub-box flex items-center justify-center mx-auto theme-text-muted text-xl sm:text-2xl mb-3">
              <i className="fa-solid fa-box-open"></i>
            </div>
            <h3 className="text-sm sm:text-base font-bold">Modが選択されていません</h3>
            <p className="text-xs theme-text-muted mt-1 max-w-sm mx-auto">
              「ホーム」タブからModrinthのModを検索して、このプロファイルに追加してください。
            </p>
            <button
              onClick={() => onSwitchTab('home')}
              className="mt-4 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl transition shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Modを探しに行く
            </button>
          </div>
        ) : (
          <>
            {/* デスクトップ表示 */}
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
                    const versionOptions =
                      availableVersions.length > 0
                        ? availableVersions.map((v) => ({
                            label: `${v.version_number} [${v.version_type === 'release' ? 'Stable' : v.version_type}]`,
                            value: v.id
                          }))
                        : [
                            {
                              label: mod.selectedVersionNumber || '最新安定版',
                              value: mod.selectedVersionId || 'latest'
                            }
                          ];

                    return (
                      <tr key={mod.id} className="hover:bg-slate-500/5 transition">
                        <td className="py-3.5 px-4">
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => onOpenModDetail(mod.id)}
                          >
                            {mod.icon_url ? (
                              <img
                                src={mod.icon_url}
                                className="w-8 h-8 rounded-lg object-contain bg-slate-800/80 p-0.5 shrink-0 shadow"
                                alt=""
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 text-xs font-bold shrink-0 shadow">
                                <i className="fa-solid fa-cube"></i>
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-sm hover:text-emerald-500 transition">
                                {mod.title}
                              </div>
                              <div className="text-xs theme-text-muted">
                                by {mod.author || 'Modrinth'} • {mod.filename || ''}
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
                            selectedValue={mod.selectedVersionId || (versionOptions[0] ? versionOptions[0].value : '')}
                            onChange={(newVerId) => onUpdateModVersion(mod.id, newVerId)}
                            label={`${mod.title} のバージョン選択`}
                          />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {mod.fileUrl && (
                              <a
                                href={mod.fileUrl}
                                download={mod.filename || 'mod.jar'}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 theme-text-blue hover:opacity-80 hover:bg-blue-500/10 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                                title=".jar を直接ダウンロード"
                              >
                                <i className="fa-solid fa-download text-sm"></i>
                              </a>
                            )}
                            <button
                              onClick={(e) => onToggleMod(mod.id, e)}
                              className="p-2 theme-text-muted hover:theme-text-red hover:bg-red-500/10 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                              title="削除"
                            >
                              <i className="fa-solid fa-trash-can text-sm"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* モバイル表示 */}
            <div className="block md:hidden p-3 space-y-3">
              {profile.mods.map((mod) => {
                const availableVersions = modVersionsMap.get(mod.id) || [];
                const versionOptions =
                  availableVersions.length > 0
                    ? availableVersions.map((v) => ({
                        label: `${v.version_number} [${v.version_type === 'release' ? 'Stable' : v.version_type}]`,
                        value: v.id
                      }))
                    : [
                        {
                          label: mod.selectedVersionNumber || '最新安定版',
                          value: mod.selectedVersionId || 'latest'
                        }
                      ];

                return (
                  <div key={mod.id} className="glass-card p-3.5 rounded-2xl flex flex-col gap-2.5 border">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                        onClick={() => onOpenModDetail(mod.id)}
                      >
                        {mod.icon_url ? (
                          <img
                            src={mod.icon_url}
                            className="w-8 h-8 rounded-lg object-contain bg-slate-800/80 p-0.5 shrink-0 shadow"
                            alt=""
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 text-xs font-bold shrink-0 shadow">
                            <i className="fa-solid fa-cube"></i>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-xs sm:text-sm truncate">{mod.title}</div>
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold theme-badge capitalize">
                            {mod.category || 'mod'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {mod.fileUrl && (
                          <a
                            href={mod.fileUrl}
                            download={mod.filename || 'mod.jar'}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 theme-text-blue active:bg-blue-500/10 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                            title=".jar を直接ダウンロード"
                          >
                            <i className="fa-solid fa-download text-sm"></i>
                          </a>
                        )}
                        <button
                          onClick={(e) => onToggleMod(mod.id, e)}
                          className="p-2 theme-text-muted active:theme-text-red active:bg-red-500/10 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                          <i className="fa-solid fa-trash-can text-sm"></i>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-500/10">
                      <span className="text-xs theme-text-muted font-medium">バージョン:</span>
                      <CustomDropdown
                        options={versionOptions}
                        selectedValue={mod.selectedVersionId || (versionOptions[0] ? versionOptions[0].value : '')}
                        onChange={(newVerId) => onUpdateModVersion(mod.id, newVerId)}
                        label={`${mod.title} のバージョン選択`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
};