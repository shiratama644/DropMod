// ============================================================================
// プロジェクト詳細/モーダルのサーバ側データ取得・メタデータ生成（共有ロジック）
//
// ルーティング再設計 (ROUTING_REDESIGN_PLAN.md) により、詳細ページ (/<型>/[slug])
// と プレビューモーダル (/discover/<型>/[slug]) は同じデータ（project / versions /
// author）を消費する。本モジュールに取得ロジックを集約し、各ルートの page.tsx は
// 薄く保つ（二重実装・二重 fetch を防ぐ）。
// ============================================================================

import { logger } from '@/lib/platform/logger';
import type { Metadata } from 'next';
import {
  fetchModrinthProject,
  fetchModrinthProjectAuthor,
  fetchModrinthProjectVersions,
  fetchModrinthSearch
} from '@/lib/modrinth/server';
import { detailPathForType, type ProjectType } from '@/lib/constants/search';
import type { ModrinthProject, ModrinthVersion } from '@/types';

export const DETAIL_REVALIDATE = 3600; // 1時間 ISR

// 事前生成する人気上位の件数 (型ごと)。
// 2026-08-26: 100 → 15 に削減。100/型 × 4 型 = 400 ページ × 3 fetch ≒ 1,200 req
// を build 中にバーストさせると Modrinth の 300 req/min を確実に超過し全面 429
// になっていた。15/型 (≈60 ページ ≒ 180 req) に抑え、残りは dynamicParams=true
// による初回アクセス時 ISR 生成に任せる (PHASE10_5_PLAN.md 続報)。
const PREBUILD_LIMIT = 15;

export interface ProjectDetailData {
  project: ModrinthProject | null;
  versions: ModrinthVersion[];
  author: string | null;
}

/**
 * 詳細/モーダル両方で使うデータを並列取得（各 fetch 失敗時はフォールバック）。
 * project が null（fetch 失敗）でも呼び出し側でフォールバック表示できるようそのまま返す。
 */
export async function fetchProjectDetailData(slug: string): Promise<ProjectDetailData> {
  const [project, versions, author] = await Promise.all([
    fetchModrinthProject(slug).catch((e) => {
      logger.warn('project fetch failed:', slug, e);
      return null;
    }),
    fetchModrinthProjectVersions(slug).catch((e) => {
      logger.warn('versions fetch failed:', slug, e);
      return [];
    }),
    fetchModrinthProjectAuthor(slug).catch(() => null)
  ]);
  return { project, versions, author };
}

/**
 * 詳細ページの事前生成用。指定型の人気上位スラッグを返す。
 * Modrinth 到達不可時は空配列（dynamicParams=true なので実行時生成される）。
 */
export async function generateDetailStaticParams(
  type: ProjectType
): Promise<Array<{ slug: string }>> {
  try {
    const result = await fetchModrinthSearch({
      query: '',
      category: 'All',
      sortBy: 'popular',
      offset: 0,
      limit: PREBUILD_LIMIT,
      projectType: type
    });
    return result.hits
      .map((h) => h.slug || h.project_id)
      .filter((s): s is string => Boolean(s))
      .map((slug) => ({ slug }));
  } catch (e) {
    logger.warn(`generateDetailStaticParams(${type}) failed:`, e);
    return [];
  }
}

/**
 * 詳細ページの metadata（OGP / canonical）。canonical = /<型>/<slug>。
 * build 全体を落とさないよう try/catch でフォールバック。
 */
export async function buildDetailMetadata(
  type: ProjectType,
  slug: string
): Promise<Metadata> {
  const canonicalPath = detailPathForType(type, slug);
  try {
    const project = await fetchModrinthProject(slug);
    // layout.tsx の title.template = '%s | DropMod' が自動付与されるため
    // title は Mod タイトルのみ。OG/Twitter は template 効かないので明示。
    const shortTitle = project.title;
    const fullTitle = `${project.title} | DropMod`;
    const description =
      project.description ||
      `${project.title} の詳細情報。Modrinth から取得したメタデータ・ダウンロード・スクリーンショット。`;
    return {
      title: shortTitle,
      description,
      alternates: { canonical: canonicalPath },
      openGraph: {
        title: fullTitle,
        description,
        type: 'article',
        url: canonicalPath
        // og:image は opengraph-image.tsx (1200×630) が担当。96px アイコンは使わない。
      },
      twitter: {
        card: 'summary_large_image',
        title: fullTitle,
        description
      }
    };
  } catch (e) {
    logger.warn(`buildDetailMetadata(${type}, ${slug}) failed:`, e);
    return {
      title: slug,
      description: 'Modrinth Mod 詳細',
      alternates: { canonical: canonicalPath }
    };
  }
}
