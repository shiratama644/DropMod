'use client';

import { useCallback, useRef } from 'react';
import JSZip from 'jszip';
import type {
  Profile,
  ProfileLoader,
  ProjectItem,
  MrpackIndex,
  ModrinthProject,
  ModrinthVersion
} from '@/types';
import { calculateSha1, isWebCryptoAvailable, InsecureContextError } from '@/lib/utils/hash';
import {
  fetchModrinthBatch,
  fetchModrinthVersionFilesBatch
} from '@/lib/modrinth/client';
import { generateId } from '@/lib/utils/id';
import { useZipImportStore } from '@/lib/store/zipImport';
import { contentCategoryFromPath, contentCategoryFromProject } from '@/lib/utils/contentCategory';
import { primaryCategoryId } from '@/lib/constants/categories';

function normalizeImportedLoader(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s.includes('quilt')) return 'Quilt';
  if (s.includes('neoforge')) return 'NeoForge';
  if (s.includes('forge')) return 'Forge';
  if (s.includes('fabric')) return 'Fabric';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export const useZipImport = (
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>,
  setCurrentProfileId: (id: string) => void,
  setIsNewProfileModalOpen: (open: boolean) => void,
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
) => {
  // 9-B.2: pendingImportData を Zustand store 経由に。
  //   NewProfileModal など下流コンポーネントが Context 経由でなく直接
  //   useZipImportStore((s) => s.pendingImportData) で購読できるようにする。
  const pendingImportData = useZipImportStore((s) => s.pendingImportData);
  const setPendingImportData = useZipImportStore((s) => s.setPendingImportData);

  // 二重取り込み防止 (素早く複数 ZIP を drop した際、後勝ちで
  // 前の pendingImportData が消失するバグ)
  const importInFlightRef = useRef<boolean>(false);

  // useCallback ラップ (AppContext の useMemo deps に入るため)。
  const handleImportZipFile = useCallback(async (file: File) => {
    // inFlight ガード
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
        // MrpackIndex 型で受ける (any → 明示型)
        const mrpackData = JSON.parse(text) as MrpackIndex;
        const mcVer = mrpackData.dependencies?.minecraft || '1.20.1';
        // .mrpack の dependencies キー名は Modrinth 仕様に準拠:
        //   fabric-loader / forge / neoforge / quilt-loader
        // 明示的に判定して DropMod の loader ラベル (Fabric/Forge/NeoForge/Quilt) に対応付ける
        let loader: ProfileLoader = 'Fabric';
        if (mrpackData.dependencies?.forge) loader = 'Forge';
        if (mrpackData.dependencies?.neoforge) loader = 'NeoForge';
        if (mrpackData.dependencies?.['quilt-loader']) loader = 'Quilt';

        const importedMods: ProjectItem[] = [];
        if (mrpackData.files) {
          const hashes = mrpackData.files
            .map((f) => f.hashes?.sha1)
            .filter((h): h is string => typeof h === 'string' && h.length > 0);
          let versionByHash: Record<string, ModrinthVersion> = {};
          if (hashes.length > 0) {
            try {
              versionByHash = await fetchModrinthVersionFilesBatch<ModrinthVersion>(
                hashes,
                'sha1'
              );
            } catch {
              versionByHash = {};
            }
          }

          const resolvedProjectIds = Array.from(
            new Set(
              Object.values(versionByHash)
                .map((v) => v.project_id)
                .filter((id): id is string => Boolean(id))
            )
          );
          const projectMap = new Map<string, ModrinthProject>();
          if (resolvedProjectIds.length > 0) {
            try {
              const projects = await fetchModrinthBatch<ModrinthProject>(
                '/projects',
                resolvedProjectIds
              );
              for (const p of projects) {
                projectMap.set(p.id, p);
              }
            } catch {
              // メタ取得失敗でも fileUrl があれば ZIP エクスポートは可能
            }
          }

          for (const f of mrpackData.files) {
            const downloadUrl = f.downloads?.[0] ? f.downloads[0] : '';
            const pathParts = f.path ? f.path.split('/') : ['mod.jar'];
            const filename = pathParts[pathParts.length - 1] || 'mod.jar';
            const matched = f.hashes?.sha1 ? versionByHash[f.hashes.sha1] : undefined;
            const proj = matched?.project_id ? projectMap.get(matched.project_id) : undefined;
            const primaryFile =
              matched?.files?.find((file) => file.primary) || matched?.files?.[0];

            importedMods.push({
              projectId: matched?.project_id || generateId('mrpack'),
              slug: proj?.slug,
              name: proj?.title || filename.replace('.jar', ''),
              description: proj?.description || 'Imported from .mrpack',
              icon_url: proj?.icon_url,
              author: proj?.author,
              type: proj
                ? contentCategoryFromProject(proj)
                : contentCategoryFromPath(f.path),
              category: proj
                ? primaryCategoryId(proj.display_categories, proj.categories)
                : undefined,
              versionId: matched?.id,
              versionNumber: matched?.version_number || 'mrpack',
              versionType: matched?.version_type || 'release',
              fileUrl: downloadUrl || primaryFile?.url || '',
              filename
            });
          }
        }

        const newProfile: Profile = {
          id: generateId('mrpack'),
          name: `${mrpackData.name || 'Modrinth Pack'} (インポート)`,
          environment: {
            mcVersion: mcVer,
            loader: loader
          },
          description: 'Modrinth .mrpack からインポート',
          mods: importedMods
        };

        setProfiles((prev) => [...prev, newProfile]);
        setCurrentProfileId(newProfile.id);
        showToast(`「${newProfile.name}」のインポート完了！`, 'success');
        return;
      }

      // 2. .jar 詰め合わせ ZIP インポート (.jarハッシュ照合 ➔ プロファイル作成モーダル開く)
      // zip.files[name] は T | undefined
      const jarEntries = Object.keys(zip.files).filter((name) => {
        const entry = zip.files[name];
        return !!entry && !entry.dir && name.toLowerCase().endsWith('.jar');
      });

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
          // 配列インデックスは T | undefined 型なので明示ガード
          const zipEntry = zip.files[entryName];
          if (!zipEntry) continue;
          const fileBuffer = await zipEntry.async('arraybuffer');
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

      // /version_files POST は 1000 個の hash 上限 → 100 個ずつ chunk 分割
      const versionMap = await fetchModrinthVersionFilesBatch<ModrinthVersion>(hashes, 'sha1');

      const foundVersions = Object.values(versionMap);
      if (foundVersions.length === 0) {
        showToast('Modrinth上で一致するModが見つかりませんでした', 'warning');
        return;
      }

      // /projects も 1000 個上限 → chunk 分割
      const projectIds = Array.from(new Set(foundVersions.map((v) => v.project_id)));
      const projects = await fetchModrinthBatch<ModrinthProject>('/projects', projectIds);
      const projectMap = new Map<string, ModrinthProject>();
      // Phase 10-P5 (suspicious/useIterableCallbackReturn):
      //   Map.set() は Map を返すので arrow の暗黙 return を回避するため
      //   block-body にして void を返す。
      projects.forEach((p) => {
        projectMap.set(p.id, p);
      });

      const initialMods: ProjectItem[] = [];
      for (const ver of foundVersions) {
        const proj = projectMap.get(ver.project_id);
        if (proj) {
          const primaryFile = ver.files.find((f) => f.primary) || ver.files[0];
          initialMods.push({
            projectId: proj.id,
            slug: proj.slug,
            name: proj.title,
            description: proj.description,
            icon_url: proj.icon_url,
            author: proj.author || 'Modrinth',
            type: contentCategoryFromProject(proj),
            category: primaryCategoryId(proj.display_categories, proj.categories),
            versionId: ver.id,
            versionNumber: ver.version_number,
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
        loader: normalizeImportedLoader(firstVer?.loaders?.[0])
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
      // inFlight ガード解除 (成功・失敗どちらでも)
      importInFlightRef.current = false;
    }
  }, [setProfiles, setCurrentProfileId, setIsNewProfileModalOpen, showToast, setPendingImportData]);

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