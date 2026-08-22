// ============================================================================
// Home ページ (Phase 5 版 + H4-5 修正)
//
// Server Component として初期 24 件を Modrinth /search から SSR 取得 →
// Client Component (<HomeInteractive />) にハイドレート。
//
// ISR: 90 分毎に再生成 (docs/NEXTJS_MIGRATION_PLAN.md §7 参照)。
//
// H4-5 修正: cookies() で dropmod_active_profile を読み取り、ユーザーの実際の
// プロファイルの mcVersion/loader で SSR fetch する。これで hydration 後に
// LocalStorage から復元されたプロファイルと SSR 結果がミスマッチして
// 「ちらつき」が起きる問題が解消される。
// cookie が無い or 無効なら SSR_DEFAULT (1.20.1 / Fabric) で fetch。
// ============================================================================

import { cookies } from 'next/headers';
import { fetchLatestMinecraftVersions, fetchModrinthSearch } from '@/lib/modrinth/server';
import { HomeInteractive } from '@/components/HomeInteractive';

// 90分毎に ISR 再生成 (fetch のキャッシュ TTL は個別に指定済)。
// ただし cookie 依存のため実質は cookie 値ごとに個別 SSR (Dynamic Rendering)
// になる可能性がある。Vercel の Edge Cache では cookie を Vary に含む挙動。
export const revalidate = 5400;

// cookie が無い時のフォールバック
const SSR_DEFAULT_MC_VERSION = '1.20.1';
const SSR_DEFAULT_LOADER = 'Fabric';

const SEARCH_LIMIT = 24;

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

  const [searchResult, mcVersions] = await Promise.all([
    fetchModrinthSearch({
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
    }),
    fetchLatestMinecraftVersions().catch(() => [])
  ]);

  const initialHasMore = searchResult.hits.length >= SEARCH_LIMIT;

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <HomeInteractive
        initialHits={searchResult.hits}
        initialMcVersions={mcVersions}
        initialHasMore={initialHasMore}
      />
    </main>
  );
}
