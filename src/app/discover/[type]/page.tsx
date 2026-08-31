import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { HomeInteractive } from '@/features/catalog';
import {
  parseDiscoverSegment,
  sanitizeSearchQuery,
  type DiscoverSegment,
  type ProjectType
} from '@/lib/constants/search';
import { loadDiscoverSearch } from '@/features/catalog/api/loadDiscoverSearch';

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

// -----------------------------------------------------------------------------
// 初回ロード時のスケルトン (Suspense fallback)
//
// 検索結果の取得 (Modrinth API) を待たずにページ本体を先に表示し、
// 結果領域だけローディング表示にする (#27)。
// HomeInteractive 側にも初回 skeleton があるが、この fallback は
// 「サーバ側 fetch が完了するまで」の間に出す。
// -----------------------------------------------------------------------------
function DiscoverGridSkeleton() {
  const keys = [
    'discover-skeleton-a',
    'discover-skeleton-b',
    'discover-skeleton-c',
    'discover-skeleton-d',
    'discover-skeleton-e',
    'discover-skeleton-f'
  ];
  return (
    <div
      id="mod-grid"
      className="grid grid-cols-3 gap-2 sm:gap-4"
      role="status"
      aria-label="読み込み中"
    >
      {keys.map((k) => (
        <div key={k} className="glass-card rounded-2xl p-4 space-y-3 skeleton-shimmer">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700/50 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 bg-slate-700/50 rounded w-3/4" />
              <div className="h-3 bg-slate-700/30 rounded w-1/2" />
            </div>
          </div>
          <div className="h-8 bg-slate-700/30 rounded w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * 検索結果をサーバ側で取得して HomeInteractive に渡す (Suspense の子)。
 * fetch はここで await されるため、完了までの間は親の fallback が表示される。
 */
async function DiscoverFeed({
  initialQuery,
  projectType
}: {
  initialQuery: string;
  projectType: ProjectType;
}) {
  const { hits, initialHasMore } = await loadDiscoverSearch(initialQuery, projectType);
  return (
    <HomeInteractive
      initialHits={hits}
      initialHasMore={initialHasMore}
      initialQuery={initialQuery}
      initialProjectType={projectType}
    />
  );
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

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <h1 className="sr-only">{TITLES[type as DiscoverSegment].title}</h1>
      <Suspense fallback={<DiscoverGridSkeleton />}>
        <DiscoverFeed initialQuery={initialQuery} projectType={projectType} />
      </Suspense>
    </main>
  );
}
