/**
 * Modrinth 実装の ContentProvider (Phase 12-C)。
 *
 * 既存の `lib/modrinth/client.ts` (キャッシュ・レートリミット・サーキットブレーカ・
 * プロキシ/直アクセスのフォールバックを持つ) へ**委譲するだけ**。
 * ここで HTTP を直接叩くと、Phase 10 で作り込んだ防御機構を迂回してしまう。
 */

import { fetchModrinth, fetchStableModVersion } from '@/lib/modrinth/client';
import type {
  ContentCategory,
  ModrinthProject,
  ModrinthVersion
} from '@/types';
import { contentCategoryFromProject } from '@/features/profiles/contentCategory';
import type {
  ContentProvider,
  ProviderContext,
  ProviderProject,
  ProviderSearchInput,
  ProviderSearchResult,
  ProviderUpdateInfo,
  ProviderVersion
} from './types';

/** Modrinth の project_type → DropMod のカテゴリ */
function toProjectType(project: Pick<ModrinthProject, 'project_type'>): ContentCategory {
  return contentCategoryFromProject(project);
}

function toProviderProject(project: ModrinthProject): ProviderProject {
  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    categories: project.categories ?? [],
    projectType: toProjectType(project),
    downloads: project.downloads,
    ...(project.icon_url ? { iconUrl: project.icon_url } : {})
  };
}

function toProviderVersion(version: ModrinthVersion): ProviderVersion {
  return {
    id: version.id,
    projectId: version.project_id,
    versionNumber: version.version_number,
    name: version.name,
    gameVersions: version.game_versions ?? [],
    loaders: version.loaders ?? [],
    datePublished: version.date_published,
    versionType: version.version_type,
    files: (version.files ?? []).map((f) => ({
      url: f.url,
      filename: f.filename,
      primary: f.primary,
      size: f.size
    }))
  };
}

/** ISO 8601 を数値に。不正値は 0 扱い (比較不能なら「古くない」側にする) */
function timestamp(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * `/search` の 1 件。`/project/:id` が返す `ModrinthProject` とは**フィールド名が違う**
 * (`project_id` vs `id`) ので別型にする。
 */
interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  project_type: string;
  categories?: string[];
  downloads?: number;
  icon_url?: string;
}

interface ModrinthSearchResponse {
  hits: ModrinthSearchHit[];
  total_hits: number;
}

export class ModrinthProvider implements ContentProvider {
  readonly id = 'modrinth' as const;
  readonly label = 'Modrinth';

  async getProject(idOrSlug: string): Promise<ProviderProject | null> {
    if (!idOrSlug) return null;
    try {
      const project = await fetchModrinth<ModrinthProject>(`/project/${idOrSlug}`);
      return project ? toProviderProject(project) : null;
    } catch {
      // 404 / ネットワーク失敗は「見つからない」として扱う (呼び出し側は分岐できる)
      return null;
    }
  }

  async searchProjects(input: ProviderSearchInput): Promise<ProviderSearchResult> {
    // Modrinth の facets は [[AND 条件], [OR 条件]] の入れ子配列
    const andFacets: string[][] = [];
    if (input.projectType) andFacets.push([`project_type:${input.projectType}`]);
    if (input.loader) andFacets.push([`categories:${input.loader.toLowerCase()}`]);
    if (input.mcVersion) andFacets.push([`versions:${input.mcVersion}`]);
    if (input.categories?.length) {
      andFacets.push(input.categories.map((c) => `categories:${c}`));
    }

    try {
      const res = await fetchModrinth<ModrinthSearchResponse>('/search', {
        query: input.query ?? '',
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
        facets: andFacets.length > 0 ? JSON.stringify(andFacets) : undefined
      });

      return {
        totalHits: res?.total_hits ?? 0,
        hits: (res?.hits ?? []).map((hit) => ({
          id: hit.project_id,
          slug: hit.slug,
          title: hit.title,
          description: hit.description,
          categories: hit.categories ?? [],
          projectType: toProjectType({ project_type: hit.project_type }),
          downloads: hit.downloads ?? 0,
          ...(hit.icon_url ? { iconUrl: hit.icon_url } : {})
        }))
      };
    } catch {
      return { hits: [], totalHits: 0 };
    }
  }

  async listVersions(projectId: string, context?: ProviderContext): Promise<ProviderVersion[]> {
    if (!projectId) return [];
    // 既存クライアントの「環境で絞り込み → 失敗なら全件」フォールバックを再利用
    const result = await fetchStableModVersion(
      projectId,
      {
        loader: context?.loader ?? '',
        mcVersion: context?.mcVersion ?? ''
      },
      // Resource Pack / Shader は loader facet を持たないので loader 未指定なら付けない
      { skipLoader: !context?.loader }
    );
    if (!result) return [];
    // 更新検知は時系列で比較するので新しい順に並べ直す
    return [...result.allVersions]
      .map(toProviderVersion)
      .sort((a, b) => timestamp(b.datePublished) - timestamp(a.datePublished));
  }

  async checkForUpdate(
    projectId: string,
    currentVersionId: string | undefined,
    context?: ProviderContext
  ): Promise<ProviderUpdateInfo> {
    const versions = await this.listVersions(projectId, context);
    if (versions.length === 0) {
      return { hasUpdate: false, current: null, latest: null };
    }

    // 最新は release 優先 (beta / alpha を「更新あり」とは言わない)
    const latest = versions.find((v) => v.versionType === 'release') ?? versions[0] ?? null;
    const current = currentVersionId
      ? (versions.find((v) => v.id === currentVersionId) ?? null)
      : null;

    if (!current || !latest) {
      return { hasUpdate: false, current, latest };
    }
    if (current.id === latest.id) {
      return { hasUpdate: false, current, latest };
    }

    // 公開日で比較する (バージョン番号の文字列比較は 0.10.0 < 0.9.0 を誤判定する)
    const hasUpdate = timestamp(latest.datePublished) > timestamp(current.datePublished);
    return { hasUpdate, current, latest };
  }
}

/** シングルトン (HTTP クライアントを多重生成しない) */
export const modrinthProvider = new ModrinthProvider();
