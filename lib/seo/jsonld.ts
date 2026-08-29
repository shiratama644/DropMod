import {
  detailPathForType,
  discoverPathForType,
  type ProjectType
} from '@/lib/constants/search';
import type { ModrinthProject } from '@/types';

const TYPE_LABEL: Record<ProjectType, string> = {
  mod: 'Mods',
  modpack: 'Modpacks',
  resourcepack: 'Resource Packs',
  shader: 'Shaders'
};

export function projectTypeLabel(type: ProjectType): string {
  return TYPE_LABEL[type];
}

export function buildWebSiteJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'DropMod',
    url: origin,
    inLanguage: 'ja',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${origin}/discover/mods?q={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };
}

export function buildOrganizationJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'DropMod',
    url: origin,
    logo: `${origin}/icon-512.png`
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function buildBreadcrumbListJsonLd(origin: string, items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${origin}${item.path}`
    }))
  };
}

export function detailBreadcrumbItems(
  type: ProjectType,
  slug: string,
  title: string
): BreadcrumbItem[] {
  return [
    { name: 'Home', path: '/' },
    { name: projectTypeLabel(type), path: discoverPathForType(type) },
    { name: title, path: detailPathForType(type, slug) }
  ];
}

/**
 * 詳細ページ用 SoftwareApplication。
 * aggregateRating は付けない（Modrinth に実評価がなくスパム判定リスク）。
 */
export function buildSoftwareApplicationJsonLd(
  origin: string,
  type: ProjectType,
  project: Pick<
    ModrinthProject,
    'title' | 'description' | 'icon_url' | 'author' | 'downloads' | 'slug'
  >
) {
  const url = `${origin}${detailPathForType(type, project.slug)}`;
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: project.title,
    description: project.description,
    url,
    applicationCategory: 'GameExtension',
    operatingSystem: 'Minecraft',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    }
  };
  if (project.icon_url) {
    jsonLd.image = project.icon_url;
  }
  if (project.author) {
    jsonLd.author = { '@type': 'Person', name: project.author };
  }
  if (typeof project.downloads === 'number' && Number.isFinite(project.downloads)) {
    jsonLd.interactionStatistic = {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/DownloadAction',
      userInteractionCount: project.downloads
    };
  }
  return jsonLd;
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
