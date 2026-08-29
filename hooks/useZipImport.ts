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
import { contentCategoryFromProject } from '@/lib/utils/contentCategory';
import { primaryCategoryId } from '@/lib/constants/categories';
import { ZipSource, isMinecraftFolderZip } from '@/lib/env/zipSource';
import { detectModpackFormat, CURSEFORGE_UNSUPPORTED_MESSAGE } from '@/lib/env/modpack';
import { analyzeEnvironmentSource } from '@/lib/env/analyzer';
import { analyzeImportHealth } from '@/lib/env/analysis';
import { generateProfileName } from '@/lib/env/profileName';
import {
  environmentFromMrpack,
  expandMrpackFiles,
  modpackLocksFromItems,
  mrpackOverridesToManaged,
  parseMrpackOverrides
} from '@/lib/env/mrpack';
import { syncManagedFiles } from '@/lib/db/dexie';

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

  // useCallback ラップ (AppShell の appActionsStore register useEffect の deps に入るため)。
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
        // .mrpack の dependencies キー名は Modrinth 仕様に準拠
        //   (fabric-loader / forge / neoforge / quilt-loader)。
        // 判定は lib/env/mrpack.ts に集約した (Phase 12-C)
        const mrpackEnv = environmentFromMrpack(mrpackData);
        const loader: ProfileLoader = mrpackEnv.loader ?? 'Fabric';

        // **Phase 12-C (§10.6)**: overrides/ を source:'modpack' として台帳化する。
        // Phase 11 は modrinth.index.json の files[] しか見ていなかった。
        const { overrides, skipped: skippedOverrides } = await parseMrpackOverrides(zip);

        // **P12-D2**: files[] → ProjectItem[] 展開は mrpack.ts に集約
        // (ZIP Import と Discover からの Modpack 追加で共有)。
        // 挙動は useZipImport 従来実装と同一 (API 失敗時は内部 id + fileUrl で継続)。
        const importedMods = await expandMrpackFiles(mrpackData);

        const newProfile: Profile = {
          id: generateId('mrpack'),
          name: `${mrpackData.name || 'Modrinth Pack'} (インポート)`,
          environment: {
            mcVersion: mcVer,
            loader: loader
          },
          description: 'Modrinth .mrpack からインポート',
          mods: importedMods,
          // **Phase 12-C (§10.6)**: Modpack は Profile の **Source**。
          // 更新検知と D-6 (紐付け解除) がこれを読む
          modpackSource: {
            provider: 'modrinth',
            name: mrpackData.name || 'Modrinth Pack',
            ...(mrpackData.versionId ? { versionId: mrpackData.versionId } : {}),
            importedAt: Date.now(),
            // P12-D2: 導入時の指定バージョン (D-3 のロック情報) を先行保持
            lockedVersions: modpackLocksFromItems(importedMods)
          }
        };

        setProfiles((prev) => [...prev, newProfile]);
        setCurrentProfileId(newProfile.id);

        // overrides を台帳に登録 (source: 'modpack')。
        // これで **D-6** (紐付け解除時に 'import' へ昇格) と Sync の削除判定が成立する
        if (overrides.length > 0) {
          await syncManagedFiles(
            newProfile.id,
            mrpackOverridesToManaged(newProfile.id, overrides)
          );
        }

        showToast(
          `「${newProfile.name}」のインポート完了！${
            overrides.length > 0 ? ` (${overrides.length} ファイルを管理対象に追加)` : ''
          }${
            skippedOverrides.length > 0
              ? ` / 対象外 ${skippedOverrides.length} ファイル`
              : ''
          }`,
          'success'
        );
        return;
      }

      // 1.5. .minecraft フォルダ全体 ZIP (Phase 11-C: Firefox/Safari フォールバック)
      //   mods/ や versions/ 等を含む ZIP を環境として解析し、NewProfileModal で
      //   解析結果 (Analysis View) を確認してから作成する。
      // **CurseForge 形式の Modpack を検知する** (Phase 12-C / §10.6)
      //
      // Modrinth と CurseForge はどちらも ZIP で、拡張子だけでは区別できない。
      // CurseForge は Phase 13 まで未対応なので、**ここで止めて理由を伝える**。
      // 中途半端に Import すると `files[]` の projectID/fileID が Modrinth の ID 体系と
      // 別物なので、台帳に無効な projectId が混ざり Update 検知も Sync も壊れる。
      if (!mrpackFile) {
        // すでに loadAsync 済みの zip を渡す (**二度パースしない**)
        const { format } = await detectModpackFormat(zip);
        if (format === 'curseforge') {
          // importInFlightRef の解除は finally 節で行う
          showToast(CURSEFORGE_UNSUPPORTED_MESSAGE, 'error');
          return;
        }
      }

      if (!mrpackFile && isMinecraftFolderZip(zip)) {
        // ZIP が「.minecraft フォルダ自身」を含む場合はサブフォルダを root にする
        const hasDotMinecraftRoot = Object.keys(zip.files).some((path) =>
          path.startsWith('.minecraft/')
        );
        // 2026-08-27 修正: zip.folder() ではなく pathPrefix 方式。
        //   folder() は file() には相対パスで動くが files の key は
        //   フルパスのまま → exists/listFiles が壊れる。
        const pathPrefix = hasDotMinecraftRoot ? '.minecraft/' : '';
        {
          showToast('.minecraft を解析中...', 'info');
          const source = new ZipSource(
            zip,
            file.name.replace(/\.[^/.]+$/, ''),
            pathPrefix
          );
          const analysis = await analyzeEnvironmentSource(source);
          const analysisIssues = analyzeImportHealth(analysis);
          const total =
            analysis.mods.length +
            analysis.resourcepacks.length +
            analysis.shaderpacks.length;

          setPendingImportData({
            name: generateProfileName(source.rootName, analysis.environment),
            mods: analysis.mods,
            resourcepacks:
              analysis.resourcepacks.length > 0 ? analysis.resourcepacks : undefined,
            shaderpacks:
              analysis.shaderpacks.length > 0 ? analysis.shaderpacks : undefined,
            unknownFiles:
              analysis.unknownFiles.length > 0 ? analysis.unknownFiles : undefined,
            analysisIssues,
            rootType: analysis.environment.rootType,
            mcVersion: analysis.environment.mcVersion,
            loader: analysis.environment.loader,
            loaderVersion: analysis.environment.loaderVersion,
            description: `環境取り込み (${total} 個 / 未識別 ${analysis.unknownFiles.length} 個)`,
            source: 'import'
          });
          setIsNewProfileModalOpen(true);
          showToast(`${total} 個のアイテムを認識しました`, 'success');
          return;
        }
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