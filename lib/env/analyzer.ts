/**
 * Import Analyzer (PHASE11_PLAN.md §3.1 の ②〜③、§4.6)。
 *
 * EnvironmentSource を解析して Profile 構成要素 (ProjectItem ×3 カテゴリ +
 * UnknownFile[]) を生成する。常に「新規 Profile 用の解析結果」であり、
 * 既存 Profile への merge は行わない (2026-08-26 改定)。
 *
 * フロー (計画書 §4.6.2):
 *   1. detectEnvironment (Detector chain) → 環境情報 + contentDirs
 *   2. contentDirs から対象ファイルを列挙 (mods/*.jar, resourcepacks/*.zip,
 *      shaderpacks/*.zip)
 *   3. ファイル読み込み → SHA-1 一括計算 (Web Worker / fallback)
 *   4. POST /version_files (100 個ずつ batch) で SHA-1 照合
 *   5. unique project ID を POST 相当の GET /projects?ids=[...] で取得
 *   6. ProjectItem[] (artifact 付き) + UnknownFile[] を構築
 *
 * ※ hash → version の永続キャッシュ (§4.6.2) は将来改善として未実装
 *   (2026-08-26: apiCache テーブル流用ではなく専用設計が必要なため)。
 */

import type { ContentCategory, ModrinthProject, ModrinthVersion, ProjectItem, UnknownFile } from '@/types';
import { generateId } from '@/lib/utils/id';
import { primaryCategoryId } from '@/lib/constants/categories';
import { fetchModrinthBatch, fetchModrinthVersionFilesBatch } from '@/lib/modrinth/client';
import { detectEnvironment } from './detector';
import type { DetectedEnvironment } from './detector/types';
import type { EnvironmentSource } from './source';
import { computeHashes } from './hashWorker';

/** カテゴリごとの対象拡張子 (計画書 §4.3) */
const CATEGORY_EXTENSIONS: Record<ContentCategory, readonly string[]> = {
  mod: ['.jar'],
  resourcepack: ['.zip'],
  shader: ['.zip']
};

const CATEGORY_TO_LOCATION: Record<ContentCategory, UnknownFile['location']> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks'
};

interface ScannedFile {
  category: ContentCategory;
  path: string;
  filename: string;
}

export interface AnalyzeProgress {
  phase: 'detect' | 'scan' | 'read' | 'hash' | 'resolve';
  done: number;
  total: number;
}

export interface ImportAnalysis {
  /** Detector chain の検出結果 (UI で編集可能な初期値) */
  environment: DetectedEnvironment;
  /** ソース情報 (表示用) */
  sourceKind: EnvironmentSource['kind'];
  sourceName: string;
  /** Modrinth 照合に成功したアイテム (artifact 付き) */
  mods: ProjectItem[];
  resourcepacks: ProjectItem[];
  shaderpacks: ProjectItem[];
  /** 照合できなかったファイル (§4.6.3: 削除・移動はしない) */
  unknownFiles: UnknownFile[];
  /** スキャンしたファイル数 (照合成否を含む) */
  scannedCounts: { mods: number; resourcepacks: number; shaderpacks: number };
  /**
   * 照合に成功したアイテムの version データ (projectId → version)。
   * Analysis View (§5 検証) で使う。UI 編集後の再検証には不要。
   */
  versionsByProject: Map<string, ModrinthVersion>;
}

function hasExtension(filename: string, extensions: readonly string[]): boolean {
  const lower = filename.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function pickPrimaryFile(version: ModrinthVersion): ModrinthVersion['files'][number] | undefined {
  return version.files?.find((f) => f.primary) ?? version.files?.[0];
}

/**
 * EnvironmentSource を解析して ImportAnalysis を返す。
 * 失敗 (Detector 例外を除く) は上位 (UI) で toast 等に表示するため throw される。
 */
export async function analyzeEnvironmentSource(
  source: EnvironmentSource,
  onProgress?: (progress: AnalyzeProgress) => void
): Promise<ImportAnalysis> {
  // ① 環境検出
  onProgress?.({ phase: 'detect', done: 0, total: 1 });
  const environment = await detectEnvironment(source);

  // ② ファイル列挙
  onProgress?.({ phase: 'scan', done: 0, total: 1 });
  const scanned: ScannedFile[] = [];
  const dirEntries: Array<[ContentCategory, string | undefined]> = [
    ['mod', environment.contentDirs.mods],
    ['resourcepack', environment.contentDirs.resourcepacks],
    ['shader', environment.contentDirs.shaderpacks]
  ];
  for (const [category, dir] of dirEntries) {
    if (!dir) continue;
    const files = await source.listFiles(dir);
    for (const filename of files) {
      if (hasExtension(filename, CATEGORY_EXTENSIONS[category])) {
        scanned.push({ category, path: `${dir}/${filename}`, filename });
      }
    }
  }

  // ③ ファイル読み込み (進捗: read)
  const contents = new Map<string, Uint8Array>();
  for (let i = 0; i < scanned.length; i++) {
    const file = scanned[i];
    if (!file) continue;
    contents.set(file.path, await source.readFile(file.path));
    onProgress?.({ phase: 'read', done: i + 1, total: scanned.length });
  }

  // ④ SHA-1 計算 (Worker / fallback)
  const hashInputs = scanned.map((file) => ({
    path: file.path,
    data: contents.get(file.path) ?? new Uint8Array(0)
  }));
  const hashes = await computeHashes(hashInputs, (p) =>
    onProgress?.({ phase: 'hash', done: p.done, total: p.total })
  );
  const sha1ByPath = new Map(hashes.map((h) => [h.path, h.sha1]));

  // ⑤ Modrinth 照合 (POST /version_files, 100 個ずつ)
  onProgress?.({ phase: 'resolve', done: 0, total: 1 });
  const allSha1 = hashes.map((h) => h.sha1);
  const versionBySha1 =
    allSha1.length > 0
      ? await fetchModrinthVersionFilesBatch<ModrinthVersion>(allSha1, 'sha1')
      : {};

  // unique project ID → メタデータ取得
  const projectIds = [
    ...new Set(
      Object.values(versionBySha1)
        .map((v) => v?.project_id)
        .filter((id): id is string => typeof id === 'string')
    )
  ];
  const projects =
    projectIds.length > 0
      ? await fetchModrinthBatch<ModrinthProject>('/projects', projectIds)
      : [];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  // ⑥ ProjectItem / UnknownFile 構築
  const analysis: ImportAnalysis = {
    environment,
    sourceKind: source.kind,
    sourceName: source.rootName,
    mods: [],
    resourcepacks: [],
    shaderpacks: [],
    unknownFiles: [],
    scannedCounts: { mods: 0, resourcepacks: 0, shaderpacks: 0 },
    versionsByProject: new Map()
  };

  for (const file of scanned) {
    analysis.scannedCounts[
      file.category === 'mod' ? 'mods' : file.category === 'resourcepack' ? 'resourcepacks' : 'shaderpacks'
    ]++;
    const sha1 = sha1ByPath.get(file.path);
    const size = contents.get(file.path)?.byteLength ?? 0;
    if (!sha1) continue;

    const version = versionBySha1[sha1];
    if (!version || typeof version.project_id !== 'string') {
      // 照合不可 → UnknownFile (location で記録、§4.6.3)
      analysis.unknownFiles.push({
        id: generateId('unknown'),
        location: CATEGORY_TO_LOCATION[file.category],
        filename: file.filename,
        path: file.path,
        sha1,
        size,
        discoveredAt: Date.now()
      });
      continue;
    }

    const project = projectById.get(version.project_id);
    const primaryFile = pickPrimaryFile(version);
    const item: ProjectItem = {
      projectId: version.project_id,
      versionId: version.id,
      versionNumber: version.version_number,
      name: project?.title ?? stripExtension(file.filename),
      type: file.category,
      slug: project?.slug,
      description: project?.description,
      icon_url: project?.icon_url,
      author: project?.author,
      category: primaryCategoryId(project?.display_categories, project?.categories),
      versionType: version.version_type,
      fileUrl: primaryFile?.url,
      filename: primaryFile?.filename ?? file.filename,
      artifact: { sha1, path: file.path, size }
    };
    if (file.category === 'mod') {
      analysis.mods.push(item);
    } else if (file.category === 'resourcepack') {
      analysis.resourcepacks.push(item);
    } else {
      analysis.shaderpacks.push(item);
    }
    analysis.versionsByProject.set(version.project_id, version);
  }

  return analysis;
}
