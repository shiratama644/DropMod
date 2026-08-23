import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { HomeInteractive } from '@/components/HomeInteractive';
import {
  parseDiscoverSegment,
  sanitizeSearchQuery,
  type DiscoverSegment
} from '@/lib/constants/search';
import { loadDiscoverSearch } from '@/lib/search/loadDiscoverSearch';

const TITLES: Record<DiscoverSegment, { title: string; description: string }> = {
  mods: {
    title: 'Mods を探す - DropMod',
    description: 'Modrinth から Mod を検索・追加できます。'
  },
  modpack: {
    title: 'Modpacks を探す - DropMod',
    description: 'Modrinth から Modpack を検索できます。'
  },
  resourcepack: {
    title: 'Resource Packs を探す - DropMod',
    description: 'Modrinth から Resource Pack を検索できます。'
  },
  shader: {
    title: 'Shaders を探す - DropMod',
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
  if (!projectType) return { title: '探す - DropMod' };
  const segment = type as DiscoverSegment;
  return TITLES[segment];
}

export function generateStaticParams() {
  return [
    { type: 'mods' },
    { type: 'modpack' },
    { type: 'resourcepack' },
    { type: 'shader' }
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
