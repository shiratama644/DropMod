import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { HomeInteractive } from '@/features/catalog';
import {
  parseDiscoverSegment,
  sanitizeSearchQuery,
  type DiscoverSegment
} from '@/lib/constants/search';
import { loadDiscoverSearch } from '@/features/catalog/search/loadDiscoverSearch';

// ルートレイアウトの title.template = '%s | DropMod' が自動付与されるため
// title に ' - DropMod' を含めない (含めるとサイト名が二重になる)
const TITLES: Record<DiscoverSegment, { title: string; description: string }> = {
  mods: {
    title: 'Mods を探す',
    description: 'Modrinth から Mod を検索・追加できます。'
  },
  modpacks: {
    title: 'Modpacks を探す',
    description: 'Modrinth から Modpack を検索できます。'
  },
  resourcepacks: {
    title: 'Resource Packs を探す',
    description: 'Modrinth から Resource Pack を検索できます。'
  },
  shaders: {
    title: 'Shaders を探す',
    description: 'Modrinth から Shader を検索できます。'
  }
};

export async function generateMetadata({
  params
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const projectType = parseDiscoverSegment(type);
  if (!projectType) return { title: '探す' };
  const segment = type as DiscoverSegment;
  return TITLES[segment];
}

export function generateStaticParams() {
  return [
    { type: 'mods' },
    { type: 'modpacks' },
    { type: 'resourcepacks' },
    { type: 'shaders' }
  ];
}

export default async function DiscoverTypePage({
  params,
  searchParams
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { type } = await params;
  const projectType = parseDiscoverSegment(type);
  if (!projectType) notFound();

  const urlParams = await searchParams;
  const initialQuery = sanitizeSearchQuery(urlParams.q);
  const { hits, initialHasMore } = await loadDiscoverSearch(initialQuery, projectType);

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <h1 className="sr-only">{TITLES[type as DiscoverSegment].title}</h1>
      <Suspense fallback={null}>
        <HomeInteractive
          initialHits={hits}
          initialHasMore={initialHasMore}
          initialQuery={initialQuery}
          initialProjectType={projectType}
        />
      </Suspense>
    </main>
  );
}
