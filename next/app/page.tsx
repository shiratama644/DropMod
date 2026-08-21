// ============================================================================
// Home ページ (Phase 5 版)
//
// Server Component として初期 24 件を Modrinth /search から SSR 取得 →
// Client Component (<HomeInteractive />) にハイドレート。
//
// ISR: 90 分毎に再生成 (docs/NEXTJS_MIGRATION_PLAN.md §7 参照)。
//
// プロファイル状態は AppContext (LocalStorage 由来) に統合済み。SSR 段階では
// まだ Client の LocalStorage を参照できないため、"default profile" 相当の
// 1.20.1 / Fabric ベースで初期 24 件を取得しておく。マウント後に
// HomeInteractive の絞り込み変更 useEffect が発火し、実際のアクティブ
// プロファイル (LocalStorage 復元後) に合わせて再検索される。
// ============================================================================

import { fetchLatestMinecraftVersions, fetchModrinthSearch } from '@/lib/modrinth/server';
import { HomeInteractive } from '@/components/HomeInteractive';

// 90分毎に ISR 再生成 (fetch のキャッシュ TTL は個別に指定済)
export const revalidate = 5400;

// SSR 初期取得用の "デフォルトプロファイル相当" (実際の Profile 型ではなく
// 検索パラメータのみ)
const SSR_DEFAULT_MC_VERSION = '1.20.1';
const SSR_DEFAULT_LOADER = 'Fabric';

const SEARCH_LIMIT = 24;

export default async function HomePage() {
  const [searchResult, mcVersions] = await Promise.all([
    fetchModrinthSearch({
      query: '',
      mcVersion: SSR_DEFAULT_MC_VERSION,
      loader: SSR_DEFAULT_LOADER,
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
