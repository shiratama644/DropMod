'use client';

import { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { Profile, ModItem, MrpackIndex } from '@/types';
import { calculateSha1, isWebCryptoAvailable, InsecureContextError } from '@/lib/utils/hash';
import {
  fetchModrinthBatch,
  fetchModrinthVersionFilesBatch
} from '@/lib/modrinth/client';
import { generateId } from '@/lib/utils/id';

export const useZipImport = (
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>,
  setCurrentProfileId: (id: string) => void,
  setIsNewProfileModalOpen: (open: boolean) => void,
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
) => {
  const [pendingImportData, setPendingImportData] = useState<{
    name: string;
    mods: ModItem[];
    mcVersion?: string;
    loader?: string;
  } | null>(null);

  // H5-6 修正: 二重取り込み防止 (素早く複数 ZIP を drop した際、後勝ちで
  // 前の pendingImportData が消失するバグ)
  const importInFlightRef = useRef<boolean>(false);

  // H4-4/L4-4 修正: useCallback ラップ (AppContext の useMemo deps に入るため)。
  const handleImportZipFile = useCallback(async (file: File) => {
    // H5-6 修正: inFlight ガード
    if (importInFlightRef.current) {
      showToast('別の ZIP を処理中です。完了してから再試行してください', 'warning');
      return;
    }
    importInFlightRef.current = true;
    showToast('ZIPファイルを解析中...', 'info');
    try {
      const zip = await JSZip.loadAsync(file);
      const mrpackFile = zip.file('modrinth.index.json');

      // 1. .mrpack (Modrinth Index ZIP) インポート: モーダルは開かずダイレクト追加
      if (mrpackFile) {
        const text = await mrpackFile.async('string');
        // L5-1 修正: MrpackIndex 型で受ける (any → 明示型)
        const mrpackData = JSON.parse(text) as MrpackIndex;
        const mcVer = mrpackData.dependencies?.minecraft || '1.20.1';
        // .mrpack の dependencies キー名は Modrinth 仕様に準拠:
        //   fabric-loader / forge / neoforge / quilt-loader
        // 明示的に判定して DropMod の loader ラベル (Fabric/Forge/NeoForge/Quilt) に対応付ける
        let loader = 'Fabric';
        if (mrpackData.dependencies?.forge) loader = 'Forge';
        if (mrpackData.dependencies?.neoforge) loader = 'NeoForge';
        if (mrpackData.dependencies?.['quilt-loader']) loader = 'Quilt';

        const importedMods: ModItem[] = [];
        if (mrpackData.files) {
          for (const f of mrpackData.files) {
            const downloadUrl = f.downloads && f.downloads[0] ? f.downloads[0] : '';
            const pathParts = f.path ? f.path.split('/') : ['mod.jar'];
            const filename = pathParts[pathParts.length - 1];

            importedMods.push({
              id: generateId('mrpack'),
              title: filename.replace('.jar', ''),
              description: 'Imported from .mrpack',
              fileUrl: downloadUrl,
              filename: filename,
              selectedVersionNumber: 'mrpack'
            });
          }
        }

        const newProfile: Profile = {
          id: generateId('mrpack'),
          name: (mrpackData.name || 'Modrinth Pack') + ' (インポート)',
          mcVersion: mcVer,
          loader: loader,
          description: 'Modrinth .mrpack からインポート',
          mods: importedMods
        };

        setProfiles((prev) => [...prev, newProfile]);
        setCurrentProfileId(newProfile.id);
        showToast(`「${newProfile.name}」のインポート完了！`, 'success');
        return;
      }

      // 2. .jar 詰め合わせ ZIP インポート (.jarハッシュ照合 ➔ プロファイル作成モーダル開く)
      const jarEntries = Object.keys(zip.files).filter(
        (name) => !zip.files[name].dir && name.toLowerCase().endsWith('.jar')
      );

      if (jarEntries.length === 0) {
        showToast('ZIP内に .jar ファイルが見つかりませんでした', 'warning');
        return;
      }

      // Web Crypto API (crypto.subtle) は Secure Context 限定
      // HTTP で配信された環境では明確なメッセージを出して早期return
      if (!isWebCryptoAvailable()) {
        showToast(
          'このページは HTTPS ではないため .jar ハッシュ照合機能が使えません。HTTPS 版でアクセスしてください',
          'warning'
        );
        return;
      }

      showToast(`${jarEntries.length} 個の .jar のハッシュをModrinthと照合中...`, 'info');

      const hashes: string[] = [];
      try {
        for (const entryName of jarEntries) {
          const fileBuffer = await zip.files[entryName].async('arraybuffer');
          const sha1 = await calculateSha1(fileBuffer);
          hashes.push(sha1);
        }
      } catch (e) {
        if (e instanceof InsecureContextError) {
          showToast(e.message, 'warning');
          return;
        }
        throw e;
      }

      // H5-4 修正: /version_files POST は 1000 個の hash 上限 → 100 個ずつ chunk 分割
      const versionMap = await fetchModrinthVersionFilesBatch<any>(hashes, 'sha1');

      const foundVersions = Object.values(versionMap);
      if (foundVersions.length === 0) {
        showToast('Modrinth上で一致するModが見つかりませんでした', 'warning');
        return;
      }

      // H5-4 修正: /projects も 1000 個上限 → chunk 分割
      const projectIds = Array.from(new Set(foundVersions.map((v) => v.project_id)));
      const projects = await fetchModrinthBatch<any>('/projects', projectIds);
      const projectMap = new Map<string, any>();
      projects.forEach((p) => projectMap.set(p.id, p));

      const initialMods: ModItem[] = [];
      for (const ver of foundVersions) {
        const proj = projectMap.get(ver.project_id);
        if (proj) {
          const primaryFile = ver.files.find((f: any) => f.primary) || ver.files[0];
          initialMods.push({
            id: proj.id,
            slug: proj.slug,
            title: proj.title,
            description: proj.description,
            icon_url: proj.icon_url,
            author: proj.author || 'Modrinth',
            category:
              (proj.display_categories && proj.display_categories[0]) ||
              (proj.categories && proj.categories[0]) ||
              'mod',
            selectedVersionId: ver.id,
            selectedVersionNumber: ver.version_number,
            versionType: ver.version_type || 'release',
            fileUrl: primaryFile ? primaryFile.url : '',
            filename: primaryFile ? primaryFile.filename : ''
          });
        }
      }

      const defaultName = file.name.replace(/\.[^/.]+$/, '');
      const firstVer = foundVersions[0];

      setPendingImportData({
        name: defaultName,
        mods: initialMods,
        mcVersion: firstVer?.game_versions ? firstVer.game_versions[0] : undefined,
        loader: firstVer?.loaders && firstVer.loaders[0]
          ? firstVer.loaders[0].charAt(0).toUpperCase() + firstVer.loaders[0].slice(1)
          : undefined
      });
      setIsNewProfileModalOpen(true);
      showToast(`Modrinth上で ${initialMods.length} 個のModを特定しました。プロファイルを作成してください。`, 'success');
    } catch (e) {
      console.error(e);
      // JSON parse エラーは mrpack 特有のエラーとして区別可能
      if (e instanceof SyntaxError) {
        showToast('ZIP内の modrinth.index.json が破損しています', 'warning');
      } else {
        showToast('ZIPファイルの解析またはModrinthとの照合に失敗しました', 'warning');
      }
    } finally {
      // H5-6 修正: inFlight ガード解除 (成功・失敗どちらでも)
      importInFlightRef.current = false;
    }
  }, [setProfiles, setCurrentProfileId, setIsNewProfileModalOpen, showToast]);

  const handleImportZipInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImportZipFile(file);
      e.target.value = '';
    },
    [handleImportZipFile]
  );

  const handleDropZip = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleImportZipFile(file);
    },
    [handleImportZipFile]
  );

  return {
    pendingImportData,
    setPendingImportData,
    handleImportZipInput,
    handleDropZip
  };
};