import type { MetadataRoute } from 'next';

export function staticSitemapEntries(
  baseUrl: string,
  now: Date
): MetadataRoute.Sitemap {
  return [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    {
      url: `${baseUrl}/discover/mods`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1.0
    },
    {
      url: `${baseUrl}/discover/modpacks`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8
    },
    {
      url: `${baseUrl}/discover/resourcepacks`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8
    },
    {
      url: `${baseUrl}/discover/shaders`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8
    },
    {
      url: `${baseUrl}/profile`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4
    },
    {
      url: `${baseUrl}/settings`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3
    },
    {
      url: `${baseUrl}/modpack`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5
    },
    {
      url: `${baseUrl}/resourcepack`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5
    },
    {
      url: `${baseUrl}/shader`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5
    }
  ];
}
