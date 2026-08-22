// ============================================================================
// Home ページ (Phase 5 版 + H4-5 + M5-1/M5-2 修正)
//
// Server Component として初期 24 件を Modrinth /search から SSR 取得 →
// Client Component (<HomeInteractive />) にハイドレート。
//
// H4-5 修正: cookies() で dropmod_active_profile を読み取り、ユーザーの実際の
// プロファイルの mcVersion/loader で SSR fetch する。これで hydration 後に
// LocalStorage から復元されたプロファイルと SSR 結果がミスマッチして
// 「ちらつき」が起きる問題が解消される。
// cookie が無い or 無効なら SSR_DEFAULT (1.20.1 / Fabric) で fetch。
//
// M5-1 修正: initialMcVersions props は AppShell 側で別途 fetch しており
// 実質未使用だったため削除。Server → Client の props 転送を最小化。
//
// M5-2 修正: revalidate 定数削除。cookies() を使う時点で Next.js は自動的に
// Dynamic Rendering に切り替えるため、revalidate 定数は無視される dead config。
// fetch のキャッシュ (revalidate/tags) は fetchModrinthSearch 内で個別指定。
// ============================================================================

import { cookies } from 'next/headers';
import { fetchModrinthSearch } from '@/lib/modrinth/server';
import { HomeInteractive } from '@/components/HomeInteractive';
import { SEARCH_LIMIT } from '@/lib/constants/search';

// cookie が無い時のフォールバック
const SSR_DEFAULT_MC_VERSION = '1.20.1';
const SSR_DEFAULT_LOADER = 'Fabric';

interface ActiveProfileCookie {
  mcVersion: string;
  loader: string;
}

/** dropmod_active_profile cookie を安全にパース */
function parseActiveProfileCookie(raw: string | undefined): ActiveProfileCookie | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const obj = JSON.parse(decoded);
    if (
      obj &&
      typeof obj === 'object' &&
      typeof obj.mcVersion === 'string' &&
      typeof obj.loader === 'string' &&
      obj.mcVersion.length < 32 &&
      obj.loader.length < 32
    ) {
      return { mcVersion: obj.mcVersion, loader: obj.loader };
    }
  } catch {
    /* 破損した cookie は無視 */
  }
  return null;
}

export default async function HomePage() {
  // Next.js 15+ では cookies() は async
  const cookieStore = await cookies();
  const activeProfileCookie = cookieStore.get('dropmod_active_profile')?.value;
  const parsed = parseActiveProfileCookie(activeProfileCookie);

  const mcVersion = parsed?.mcVersion || SSR_DEFAULT_MC_VERSION;
  const loader = parsed?.loader || SSR_DEFAULT_LOADER;

  const searchResult = await fetchModrinthSearch({
    query: '',
    mcVersion,
    loader,
    category: 'All',
    sortBy: 'popular',
    offset: 0,
    limit: SEARCH_LIMIT
  }).catch((e) => {
    console.warn('[DropMod] Home SSR search failed:', e);
    return { hits: [], total_hits: 0, offset: 0, limit: SEARCH_LIMIT };
  });

  const initialHasMore = searchResult.hits.length >= SEARCH_LIMIT;

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <HomeInteractive
        initialHits={searchResult.hits}
        initialHasMore={initialHasMore}
      />
    </main>
  );
}
