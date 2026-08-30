/**
 * Modrinth Modpack (.mrpack) パーサ (Phase 12-C / PHASE12_PLAN.md §10.6)。
 *
 * `.mrpack` は ZIP で、中身は:
 * ```
 * modrinth.index.json     … files[] (project_id / version_id) + dependencies
 * overrides/              … Minecraft フォルダへ**そのままコピー**するファイル
 * client-overrides/       … クライアント側にだけコピーするファイル
 * server-overrides/       … サーバ側にだけコピーするファイル (DropMod は対象外)
 * ```
 *
 * Phase 11 の Import は `modrinth.index.json` の `files[]` だけを見ており、
 * **`overrides/` を一切処理していなかった**。§10.6 は「overrides のファイルは
 * `source: 'modpack'` として ManagedFileRecord 化」を求めているので、ここで実装する。
 *
 * ## 管理対象を 3 カテゴリに限定する理由
 *
 * `overrides/` には `config/` など任意のファイルが入り得る。それらを台帳に入れると
 * **DropMod が管理していないファイルまで削除候補になる** (§4 禁止事項)。
 * Sync が扱う 3 カテゴリ (`mods/` / `resourcepacks/` / `shaderpacks/`) だけを
 * 台帳化し、それ以外は「対象外」として返す (呼び出し側は表示だけできる)。
 */

import type JSZip from 'jszip';
import type {
  ContentCategory,
  ManagedFileRecord,
  ModrinthProject,
  ModrinthVersion,
  ModpackSource,
  MrpackIndex,
  ProjectItem
} from '@/types';
import {
  fetchModrinthBatch,
  fetchModrinthVersionFilesBatch
} from '@/lib/modrinth/client';
import { contentCategoryFromPath, contentCategoryFromProject } from '@/lib/utils/contentCategory';
import { primaryCategoryId } from '@/lib/constants/categories';
import { calculateSha1 } from '@/lib/utils/hash';
import { generateId } from '@/lib/utils/id';
import { buildManagedFileId } from '@/lib/env/managed';

/** 環境ルートへコピーされる overrides ディレクトリ (DropMod はクライアントアプリ) */
export const OVERRIDES_DIRS = ['overrides', 'client-overrides'] as const;

/** サーバ専用。DropMod では対象外 */
export const SERVER_OVERRIDES_DIR = 'server-overrides';

/** 台帳化 (＝Sync の管理対象) するディレクトリ。これ以外は対象外 */
export const MANAGED_OVERRIDE_DIRS: Readonly<Record<ContentCategory, string>> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks'
};

export interface MrpackOverrideFile {
  /** 環境ルート相対パス (例: `mods/foo.jar`) */
  path: string;
  category: ContentCategory;
  sha1: string;
  size: number;
}

export interface MrpackSkippedFile {
  /** .mrpack 内の相対パス */
  path: string;
  reason: 'out-of-scope' | 'read-failed' | 'empty';
}

export interface MrpackOverridesResult {
  overrides: MrpackOverrideFile[];
  skipped: MrpackSkippedFile[];
}

/** `overrides/foo/bar.jar` → `foo/bar.jar`。overrides 配下でなければ null */
function stripOverridesPrefix(zipPath: string): string | null {
  const normalized = zipPath.replace(/\\/g, '/');
  for (const dir of OVERRIDES_DIRS) {
    const prefix = `${dir}/`;
    if (normalized.startsWith(prefix)) return normalized.slice(prefix.length);
  }
  return null;
}

/**
 * `mods/foo.jar` → `mod`。3 カテゴリ以外なら **null**。
 *
 * `contentCategoryFromPath()` は「わからなければ mod」にフォールバックするが、
 * ここでは**対象外を明示的に弾く**必要がある (config/ などを台帳に入れると
 * Sync の削除候補になるため)。あえて共通ヘルパを使わない。
 */
function categoryOfOverride(path: string): ContentCategory | null {
  const head = path.split('/')[0]?.toLowerCase();
  if (!head) return null;
  for (const [category, dir] of Object.entries(MANAGED_OVERRIDE_DIRS)) {
    if (head === dir) return category as ContentCategory;
  }
  return null;
}

/**
 * `.mrpack` 内の overrides を列挙し、fingerprint を計算する。
 *
 * `server-overrides/` と 3 カテゴリ以外は `skipped` に入れて返す
 * (**台帳には入れない** = Sync が削除しない)。
 */
export async function parseMrpackOverrides(zip: JSZip): Promise<MrpackOverridesResult> {
  const overrides: MrpackOverrideFile[] = [];
  const skipped: MrpackSkippedFile[] = [];

  const entries = Object.keys(zip.files)
    .filter((p) => !zip.files[p]?.dir)
    .sort();

  for (const zipPath of entries) {
    // server-overrides は明示的に対象外 (列挙しない)
    if (zipPath.replace(/\\/g, '/').startsWith(`${SERVER_OVERRIDES_DIR}/`)) continue;

    const relative = stripOverridesPrefix(zipPath);
    // overrides 配下でなければ (modrinth.index.json など) 対象外
    if (relative === null) continue;
    if (!relative || relative.endsWith('/')) continue;

    const category = categoryOfOverride(relative);
    if (!category) {
      skipped.push({ path: relative, reason: 'out-of-scope' });
      continue;
    }

    const file = zip.file(zipPath);
    if (!file) {
      skipped.push({ path: relative, reason: 'read-failed' });
      continue;
    }

    try {
      const data = await file.async('uint8array');
      if (data.byteLength === 0) {
        skipped.push({ path: relative, reason: 'empty' });
        continue;
      }
      overrides.push({
        path: relative,
        category,
        sha1: await calculateSha1(data.slice().buffer),
        size: data.byteLength
      });
    } catch {
      skipped.push({ path: relative, reason: 'read-failed' });
    }
  }

  return { overrides, skipped };
}

/**
 * overrides を `ManagedFileRecord` に変換する (**pure function**)。
 *
 * `source` は必ず `'modpack'` (§10.5)。これで **D-6** (Modpack の紐付け解除時に
 * `'modpack'` → `'import'` へ昇格) が成立する。
 *
 * `projectId` は overrides に対応する Modrinth project が無いため空文字。
 * Sync の削除判定は `projectId` ではなく path + sha1 を使うので問題ない。
 */
export function mrpackOverridesToManaged(
  profileId: string,
  overrides: readonly MrpackOverrideFile[],
  now: number = Date.now()
): ManagedFileRecord[] {
  return overrides.map((override) => ({
    id: buildManagedFileId(profileId, override.path),
    profileId,
    category: override.category,
    projectId: '',
    path: override.path,
    sha1: override.sha1,
    size: override.size,
    source: 'modpack',
    managedAt: now
  }));
}

/**
 * **D-6**: Modpack の紐付けを解除する。
 *
 * `source: 'modpack'` のレコードを全て `'import'` に昇格させる。
 * **ファイル自体は Profile に残る** — 削除には別途ユーザーの確認が必要。
 * pure function (DB への書き込みは呼び出し側)。
 */
export function promoteModpackRecords(
  records: readonly ManagedFileRecord[]
): ManagedFileRecord[] {
  return records.map((record) =>
    record.source === 'modpack' ? { ...record, source: 'import' } : record
  );
}

/**
 * **P12-D2 (bug 3)**: `modrinth.index.json` の `files[]` を `ProjectItem[]` に展開する。
 *
 * 元々 `hooks/useZipImport.ts` に埋め込まれていたロジックを集約し、
 * **ZIP Import (.mrpack) と Discover からの Modpack 追加で共有**する
 * (`useZipImport` は新規 Profile、Discover は既存 Profile への追加)。
 *
 * - sha1 → `/version_files` (batch) → projectId → `/projects` (batch) でメタ解決
 * - 照合できなかった file は DropMod 内部 id (`mrpack-…`) + ダウンロード URL で
 *   継続する (**API 失敗でもファイル同期を止めない** — useZipImport と同一方針)
 * - `deps` を注入することでテストはモック HTTP を必要としない
 */
export interface ExpandMrpackFilesDeps {
  fetchVersions?: typeof fetchModrinthVersionFilesBatch;
  fetchProjects?: typeof fetchModrinthBatch;
}

export async function expandMrpackFiles(
  index: MrpackIndex,
  deps: ExpandMrpackFilesDeps = {}
): Promise<ProjectItem[]> {
  const fetchVersions = deps.fetchVersions ?? fetchModrinthVersionFilesBatch;
  const fetchProjects = deps.fetchProjects ?? fetchModrinthBatch;

  const importedMods: ProjectItem[] = [];
  if (!index.files) return importedMods;

  const hashes = index.files
    .map((f) => f.hashes?.sha1)
    .filter((h): h is string => typeof h === 'string' && h.length > 0);
  let versionByHash: Record<string, ModrinthVersion> = {};
  if (hashes.length > 0) {
    try {
      versionByHash = await fetchVersions<ModrinthVersion>(hashes, 'sha1');
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
      const projects = await fetchProjects<ModrinthProject>('/projects', resolvedProjectIds);
      for (const p of projects) {
        projectMap.set(p.id, p);
      }
    } catch {
      // メタ取得失敗でも fileUrl があれば ZIP エクスポートは可能
    }
  }

  for (const f of index.files) {
    const downloadUrl = f.downloads?.[0] ? f.downloads[0] : '';
    const pathParts = f.path ? f.path.split('/') : ['mod.jar'];
    const filename = pathParts[pathParts.length - 1] || 'mod.jar';
    const matched = f.hashes?.sha1 ? versionByHash[f.hashes.sha1] : undefined;
    const proj = matched?.project_id ? projectMap.get(matched.project_id) : undefined;
    const primaryFile =
      matched?.files?.find((file) => file.primary) || matched?.files?.[0];

    const path = f.path || `mods/${filename}`;
    // P12-D3: 導入時の実体情報を ProjectItem.artifact に持たせる。
    // Sync の差分判定 (update/addition) と、ロック情報 (lockedVersions) の
    // sha1/path/size がここから導出される。
    const sha1 = f.hashes?.sha1 || primaryFile?.hashes?.sha1;
    const item: ProjectItem = {
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
    };
    if (sha1) {
      item.artifact = {
        sha1,
        path,
        size:
          f.fileSize ??
          primaryFile?.size ??
          0
      };
    }
    importedMods.push(item);
  }

  return importedMods;
}

/**
 * **P12-D2 / D-3 の先行構造**: 展開した収録物からロック情報を作る。
 *
 * `lockedVersions` (ModpackSource) は「導入時点で Modpack が指定していた
 * version」を保持する。P12-D3 の Sync 側競合検出が「導入時の指定」と
 * 「Profile の現在値」を突き合わせるための基準。
 *
 * Modrinth 照合できなかったファイル (`mrpack-…` 内部 id) は問い合わせ対象に
 * ならないためロックにも含めない。
 * @returns versionId が判明している項目のみの map。無ければ空オブジェクト
 */
export function modpackLocksFromItems(
  items: readonly ProjectItem[]
): NonNullable<ModpackSource['lockedVersions']> {
  const locks: NonNullable<ModpackSource['lockedVersions']> = {};
  for (const item of items) {
    if (!item.versionId || item.projectId.startsWith('mrpack-')) continue;
    locks[item.projectId] = {
      versionId: item.versionId,
      ...(item.versionNumber ? { versionNumber: item.versionNumber } : {}),
      ...(item.fileUrl ? { fileUrl: item.fileUrl } : {}),
      ...(item.filename ? { filename: item.filename } : {}),
      // P12-D3: replace 時に Profile を導入時の実体情報で復元するため
      ...(item.artifact?.sha1 ? { sha1: item.artifact.sha1 } : {}),
      ...(item.artifact?.size ? { size: item.artifact.size } : {}),
      ...(item.artifact?.path ? { path: item.artifact.path } : {})
    };
  }
  return locks;
}

/**
 * `.mrpack` の `dependencies` から環境を読み取る。
 *
 * Modrinth 仕様のキー名に準拠 (`fabric-loader` / `forge` / `neoforge` / `quilt-loader`)。
 * Phase 11 の `useZipImport` に同じロジックが埋め込まれているので、こちらへ寄せる。
 */
export function environmentFromMrpack(
  index: MrpackIndex
): { mcVersion?: string; loader?: 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt'; loaderVersion?: string } {
  const deps = index.dependencies ?? {};
  const mcVersion = deps.minecraft;
  const loaderVersion =
    deps['fabric-loader'] ?? deps.forge ?? deps.neoforge ?? deps['quilt-loader'];

  let loader: 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt' | undefined;
  if (deps['fabric-loader']) loader = 'Fabric';
  else if (deps.forge) loader = 'Forge';
  else if (deps.neoforge) loader = 'NeoForge';
  else if (deps['quilt-loader']) loader = 'Quilt';

  return {
    ...(mcVersion ? { mcVersion } : {}),
    ...(loader ? { loader } : {}),
    ...(loaderVersion ? { loaderVersion } : {})
  };
}
