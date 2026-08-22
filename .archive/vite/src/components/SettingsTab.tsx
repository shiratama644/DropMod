import React from 'react';
import { Profile, ThemeMode } from '../types';

interface SettingsTabProps {
  theme: ThemeMode;
  onSetTheme: (mode: ThemeMode) => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDropZip: (e: React.DragEvent) => void;
  profiles: Profile[];
  currentProfileId: string;
  onSwitchProfile: (id: string) => void;
  onOpenNewProfileModal: () => void;
  onDeleteProfile: (id: string) => void;
  onResetData: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  theme,
  onSetTheme,
  onDownloadZip,
  onImportZip,
  onDropZip,
  profiles,
  currentProfileId,
  onSwitchProfile,
  onOpenNewProfileModal,
  onDeleteProfile,
  onResetData
}) => {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <section id="tab-settings" className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div className="glass-panel rounded-3xl p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div>
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <i className="fa-solid fa-sliders theme-text-brand"></i>
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
              onClick={() => onSetTheme('dark')}
              className={`btn-hover-effect p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                theme === 'dark'
                  ? 'border-2 border-emerald-500 bg-emerald-500/10 theme-text-brand shadow'
                  : 'border-slate-700 bg-slate-800/80 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <i className="fa-solid fa-moon theme-text-blue"></i>
              <span>ダークモード</span>
            </button>
            <button
              onClick={() => onSetTheme('light')}
              className={`btn-hover-effect p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                theme === 'light'
                  ? 'border-2 border-emerald-500 bg-emerald-500/10 theme-text-brand shadow'
                  : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <i className="fa-solid fa-sun theme-text-amber"></i>
              <span>ライトモード</span>
            </button>
          </div>
        </div>

        <div className="border-t border-slate-500/20 pt-4 sm:pt-6 space-y-3 sm:space-y-4">
          <h3 className="text-xs sm:text-sm font-bold">ZIPファイルのインポート / エクスポート</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div
              id="drop-zone"
              onDragOver={handleDragOver}
              onDrop={onDropZip}
              className="glass-card p-4 sm:p-5 rounded-2xl border-dashed border-2 border-slate-500/40 hover:border-emerald-500 text-center flex flex-col items-center justify-center cursor-pointer relative min-h-[120px]"
            >
              <input
                type="file"
                accept=".zip,.mrpack,application/zip"
                className="absolute inset-0 opacity-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                onChange={onImportZip}
              />
              <i className="fa-solid fa-cloud-arrow-up text-2xl sm:text-3xl theme-text-brand mb-1.5"></i>
              <p className="text-xs font-bold">ZIPプロファイル / .mrpack インポート</p>
              <p className="text-xs theme-text-muted mt-0.5">タップまたはファイルをドロップ (.zip / .mrpack)</p>
            </div>

            <div className="glass-card p-4 sm:p-5 rounded-2xl flex flex-col justify-between space-y-3">
              <div>
                <h4 className="text-xs font-bold">プロファイルをZIP保存 (全.jar込み)</h4>
                <p className="text-xs theme-text-muted mt-0.5">
                  登録されている全Modの.jarファイルをまとめて1つのZIPとして出力します。
                </p>
              </div>
              <button
                onClick={onDownloadZip}
                className="btn-hover-effect w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-download"></i> ZIPダウンロード
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-500/20 pt-4 sm:pt-6 space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold">保持されているプロファイル</h3>
            <button
              onClick={onOpenNewProfileModal}
              className="btn-hover-effect px-3 py-1.5 theme-sub-box text-xs font-bold rounded-xl border transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-plus theme-text-brand"></i> 新規作成
            </button>
          </div>
          <div className="space-y-2">
            {profiles.map((p) => {
              const isActive = p.id === currentProfileId;
              return (
                <div
                  key={p.id}
                  onClick={() => !isActive && onSwitchProfile(p.id)}
                  className={`glass-card p-3 sm:p-3.5 rounded-2xl flex items-center justify-between transition-all ${
                    isActive
                      ? 'border-emerald-500/50 bg-emerald-500/10 shadow-md shadow-emerald-500/5'
                      : 'cursor-pointer hover:border-emerald-500/40 hover:bg-slate-500/5 active:scale-[0.99]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                    <div
                      className={`w-9 h-9 rounded-xl ${
                        isActive ? 'bg-emerald-500 text-slate-950 font-extrabold' : 'theme-sub-box theme-text-muted'
                      } flex items-center justify-center text-xs shrink-0 shadow`}
                    >
                      <i className="fa-solid fa-folder"></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-bold flex items-center gap-2 truncate">
                        <span className="truncate">{p.name}</span>
                        {isActive && (
                          <span className="text-xs px-2 py-0.5 bg-emerald-500/20 theme-text-brand rounded-full font-semibold border border-emerald-500/30 shrink-0">
                            <i className="fa-solid fa-check text-[10px] mr-1"></i>選択中
                          </span>
                        )}
                      </div>
                      <div className="text-xs theme-text-muted mt-0.5">
                        MC {p.mcVersion} ({p.loader}) • {p.mods.length} 個のMod
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProfile(p.id);
                      }}
                      className="p-2 theme-text-muted hover:theme-text-red hover:bg-red-500/10 active:bg-red-500/20 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                      title="プロファイルを削除"
                    >
                      <i className="fa-solid fa-trash-can text-xs sm:text-sm"></i>
                    </button>
                  </div>
                </div>
              );
            })}
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
            onClick={onResetData}
            className="btn-hover-effect w-full sm:w-auto px-3.5 py-2 text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 theme-text-red border border-red-500/30 rounded-xl transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            データを初期化
          </button>
        </div>
      </div>
    </section>
  );
};