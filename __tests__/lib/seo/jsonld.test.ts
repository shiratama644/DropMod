import { describe, expect, it } from 'vitest';
import {
  buildBreadcrumbListJsonLd,
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebSiteJsonLd,
  detailBreadcrumbItems,
  serializeJsonLd
} from '@/features/seo';

const ORIGIN = 'https://dropmod.example';

describe('JSON-LD builders (SEO-1 / 2-2)', () => {
  it('WebSite に SearchAction がある', () => {
    const ld = buildWebSiteJsonLd(ORIGIN);
    expect(ld['@type']).toBe('WebSite');
    expect(ld.potentialAction.target.urlTemplate).toBe(
      `${ORIGIN}/discover/mods?q={search_term_string}`
    );
  });

  it('Organization に logo がある', () => {
    const ld = buildOrganizationJsonLd(ORIGIN);
    expect(ld.logo).toBe(`${ORIGIN}/icon-512.png`);
  });

  it('SoftwareApplication は DL 数を interactionStatistic にし、aggregateRating を持たない', () => {
    const ld = buildSoftwareApplicationJsonLd(ORIGIN, 'mod', {
      title: 'Sodium',
      description: 'renderer',
      icon_url: 'https://cdn.modrinth.com/icon.png',
      author: 'JellySquid',
      downloads: 1_500_000,
      slug: 'sodium'
    });
    expect(ld['@type']).toBe('SoftwareApplication');
    expect(ld.applicationCategory).toBe('GameExtension');
    expect(ld.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(ld.interactionStatistic).toEqual({
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/DownloadAction',
      userInteractionCount: 1_500_000
    });
    expect(ld).not.toHaveProperty('aggregateRating');
    expect(ld.url).toBe(`${ORIGIN}/mod/sodium`);
  });

  it('パンくずは Home → 一覧 → 詳細', () => {
    const items = detailBreadcrumbItems('shader', 'iris', 'Iris');
    expect(items.map((i) => i.path)).toEqual(['/', '/discover/shaders', '/shader/iris']);
    const ld = buildBreadcrumbListJsonLd(ORIGIN, items);
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[1]?.item).toBe(`${ORIGIN}/discover/shaders`);
  });

  it('serializeJsonLd は script 破壊用の < をエスケープする', () => {
    expect(serializeJsonLd({ name: '</script>' })).toContain('\\u003c/script>');
  });
});
