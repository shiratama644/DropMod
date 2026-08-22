'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { Profile, ModItem } from '@/types';

// ==========================================
// 定数
// ==========================================
const CONCURRENCY = 4;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const URL_REVOKE_DELAY_MS = 10000;

// ==========================================
// 型定義
// ==========================================
export interface ZipProgressState {
  isOpen: boolean;
  progress: number;
  statusText: string;
  statusCount: string;
  detailText: string;
}

const INITIAL_STATE: ZipProgressState = {
  isOpen: false,
  progress: 0,
  statusText: '',
  statusCount: '',
  detailText: '',
};

// ==========================================
// 純粋ヘルパー関数 (テスト・保守が容易な領域)
// ==========================================

/** Modのファイル名を決定する */
const getModFileName = (mod: ModItem): string => {
  if (mod.filename) return mod.filename;
  const version = mod.selectedVersionNumber ? `-${mod.selectedVersionNumber}` : '';
  const identifier = mod.slug || mod.id;
  return `${identifier}${version}.jar`;
};

/** ファイル名用の文字列サニタイズ */
const sanitizeFileName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9-_\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g, '_');
};

/** ZIP出力ファイル名を生成する */
const generateZipFileName = (profile: Profile): string => {
  const cleanName = sanitizeFileName(profile.name);
  return `${cleanName}_MC${profile.mcVersion}_mods.zip`;
};

/** profile.json のコンテンツを生成する */
const generateExportDataJson = (profile: Profile): string => {
  const exportData = {
    formatVersion: '1.1.0',
    exportedAt: new Date().toISOString(),
    profile,
  };
  return JSON.stringify(exportData, null, 2);
};

/**
 * README.txt のコンテンツを生成する。
 * 実ZIP内のファイル名 (dedup 後) を渡してもらうことで、README と
 * 実ファイル名の不一致を防ぐ。
 */
const generateReadmeText = (
  profile: Profile,
  actualFilenames: Map<string, string>
): string => {
  const modsList = profile.mods
    .map((mod) => {
      const actualName = actualFilenames.get(mod.id) || getModFileName(mod);
      return `- ${mod.title} (${mod.selectedVersionNumber || 'Stable'}) -> ${actualName}\n  Source: ${mod.fileUrl || 'N/A'}`;
    })
    .join('\n');

  return [
    'DropMod Mod Profile Export',
    '==============================',
    `Profile Name: ${profile.name}`,
    `Minecraft Version: ${profile.mcVersion}`,
    `Mod Loader: ${profile.loader}`,
    `Exported At: ${new Date().toLocaleString()}`,
    '',
    `Included Mods (${profile.mods.length}):`,
    modsList,
  ].join('\n');
};

/** ブラウザで Blob をダウンロード実行する */
const triggerBlobDownload = (blob: Blob, fileName: string): void => {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;

  // Firefox / Safari 対策のためDOMに一時追加してクリック
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(downloadUrl), URL_REVOKE_DELAY_MS);
};

/** 1つのModファイルをダウンロードする (リトライ機能付き) */
const downloadModFile = async (
  fileUrl: string,
  signal: AbortSignal
): Promise<Blob | null> => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal.aborted) throw new Error('Aborted');

    try {
      const res = await fetch(fileUrl, { signal });
      if (res.ok) {
        return await res.blob();
      }

      // 403 / 404 等のクライアントエラーはリトライしても解決しないため即失敗
      if (res.status === 403 || res.status === 404) {
        return null;
      }
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new Error('Aborted');
      }
    }

    // リトライ前の遅延 (最後のリトライ時は待たない)
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return null;
};

// ==========================================
// メイン Hook
// ==========================================
export const useZipExport = (
  currentProfile: Profile,
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
) => {
  // 5つの状態を1つのオブジェクトにまとめ、更新の整合性を担保
  const [zipState, setZipState] = useState<ZipProgressState>(INITIAL_STATE);
  const activeZipAbortRef = useRef<AbortController | null>(null);

  // 部分的な状態更新用ヘルパー
  const updateZipState = useCallback((patch: Partial<ZipProgressState>) => {
    setZipState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleCancelZip = useCallback(() => {
    const wasActive = activeZipAbortRef.current !== null;
    if (activeZipAbortRef.current) {
      activeZipAbortRef.current.abort();
      activeZipAbortRef.current = null;
    }
    updateZipState({ isOpen: false });
    // 完了直後のモーダル閉じで toast が二重表示されるのを回避
    if (wasActive) {
      showToast('ZIPエクスポートをキャンセルしました', 'info');
    }
  }, [showToast, updateZipState]);

  // M5-12 修正: アンマウント時に in-flight DL を abort。
  // ZIP 生成中にユーザーがページ遷移 (or リロード) すると abort されずに
  // fetch が継続し、ネットワーク帯域を無駄に消費する問題を解消。
  useEffect(() => {
    return () => {
      if (activeZipAbortRef.current) {
        activeZipAbortRef.current.abort();
        activeZipAbortRef.current = null;
      }
    };
  }, []);

  // H4-4 修正: useCallback ラップ (AppContext の useMemo deps に入るため参照安定化)。
  // currentProfile は上位で変化するので deps に含める必要があるが、少なくとも
  // profile 変化なしのレンダー間では同一参照を維持できる。
  const handleDownloadZip = useCallback(async () => {
    // 1. ガード節（プロファイル内にModがない場合）
    if (currentProfile.mods.length === 0) {
      showToast('プロファイルにModが登録されていません', 'warning');
      return;
    }

    const totalMods = currentProfile.mods.length;
    const abortController = new AbortController();
    activeZipAbortRef.current = abortController;
    const { signal } = abortController;

    // 初期状態の設定
    setZipState({
      isOpen: true,
      progress: 0,
      statusCount: `0 / ${totalMods}`,
      statusText: '初期化中...',
      detailText: 'ZIPフォルダ構造を構築中',
    });

    try {
      const zip = new JSZip();
      const modsFolder = zip.folder('mods');

      // テキスト・JSONメタデータの追加 (profile.json は先、README.txt は
      // 全 Mod の実ファイル名 (dedup後) が確定してから最後に書く)
      zip.file('profile.json', generateExportDataJson(currentProfile));

      // 進行状態の集約変数
      let successCount = 0;
      let failCount = 0;
      let processedCount = 0;
      let currentIndex = 0;

      // ファイル名重複解消のための使用済み名 Set (L-6)
      // 同じ filename の Mod が複数ある場合、後発は "name-2.jar", "name-3.jar" と
      // サフィックスを付けて衝突を防ぐ (JSZip の暗黙上書き対策)
      const usedFileNames = new Set<string>();
      // Mod ID → 実際に ZIP へ書き込んだファイル名 のマップ (README生成用)
      const actualFilenames = new Map<string, string>();
      const dedupeFileName = (name: string): string => {
        if (!usedFileNames.has(name)) {
          usedFileNames.add(name);
          return name;
        }
        const dotIdx = name.lastIndexOf('.');
        const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
        const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
        let counter = 2;
        let candidate = `${base}-${counter}${ext}`;
        while (usedFileNames.has(candidate)) {
          counter++;
          candidate = `${base}-${counter}${ext}`;
        }
        usedFileNames.add(candidate);
        return candidate;
      };

      // ワーカー定義
      const worker = async () => {
        while (currentIndex < totalMods) {
          if (signal.aborted) throw new Error('Aborted');

          const index = currentIndex++;
          // L6-3 (noUncheckedIndexedAccess) 対応: 配列インデックスは T | undefined。
          // while 条件で範囲内は保証されているが、型システムに明示ガードを与える。
          const mod = currentProfile.mods[index];
          if (!mod) {
            processedCount++;
            failCount++;
            continue;
          }

          updateZipState({
            detailText: `ダウンロード中: ${mod.title} (${mod.selectedVersionNumber || 'Stable'})`,
          });

          if (mod.fileUrl) {
            const blob = await downloadModFile(mod.fileUrl, signal);
            if (blob) {
              const uniqueName = dedupeFileName(getModFileName(mod));
              modsFolder?.file(uniqueName, blob);
              actualFilenames.set(mod.id, uniqueName);
              successCount++;
            } else {
              failCount++;
            }
          } else {
            failCount++;
          }

          processedCount++;

          // 進捗計算 (0〜90%)
          const percent = Math.round((processedCount / totalMods) * 90);
          updateZipState({
            progress: percent,
            statusCount: `${processedCount} / ${totalMods}`,
            statusText: `ダウンロード進行中 (${processedCount}/${totalMods})`,
            detailText: `取得完了: ${mod.title}`,
          });
        }
      };

      // 並列ワーカーの起動
      const workerCount = Math.min(CONCURRENCY, totalMods);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (signal.aborted) throw new Error('Aborted');

      // README を実ファイル名 (dedup後) で最後に追加
      zip.file('README.txt', generateReadmeText(currentProfile, actualFilenames));

      // 圧縮フェーズ (90〜100%)
      updateZipState({
        progress: 90,
        statusText: 'ZIPフォルダを圧縮中...',
        detailText: '圧縮パッケージ生成中',
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        if (signal.aborted) return;
        const compressPercent = 90 + Math.round((metadata.percent / 100) * 10);
        updateZipState({
          progress: compressPercent,
          detailText: metadata.currentFile ? `圧縮中: ${metadata.currentFile}` : '圧縮中...',
        });
      });

      if (signal.aborted) throw new Error('Aborted');

      updateZipState({ progress: 100 });

      // Blobのダウンロード開始
      triggerBlobDownload(zipBlob, generateZipFileName(currentProfile));

      // 完了と同時に abort 用 controller をクリアして
      // 完了直後の cancel トーストが誤って出るのを防ぐ
      if (activeZipAbortRef.current === abortController) {
        activeZipAbortRef.current = null;
      }

      // 完了通知とモーダル閉じる処理
      setTimeout(() => {
        updateZipState({ isOpen: false });
        showToast(
          `完了！${successCount}/${totalMods} 個の.jar入りZIPを出力しました${
            failCount > 0 ? ` (${failCount}個取得失敗)` : ''
          }`,
          successCount > 0 ? 'success' : 'warning'
        );
      }, 400);

    } catch (error) {
      if (error instanceof Error && error.message === 'Aborted') {
        return; // キャンセル時は何もしない (handleCancelZipで処理済み)
      }
      updateZipState({ isOpen: false });
      showToast('ZIPの生成に失敗しました', 'warning');
    } finally {
      if (activeZipAbortRef.current === abortController) {
        activeZipAbortRef.current = null;
      }
    }
  }, [currentProfile, showToast, updateZipState]);

  return {
    isZipModalOpen: zipState.isOpen,
    zipProgress: zipState.progress,
    zipStatusText: zipState.statusText,
    zipStatusCount: zipState.statusCount,
    zipDetailText: zipState.detailText,
    handleDownloadZip,
    handleCancelZip,
  };
};