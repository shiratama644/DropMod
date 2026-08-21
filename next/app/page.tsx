// ============================================================================
// Home ページ (Phase 3 版)
//
// Server Component として初期 24 件を Modrinth /search から SSR 取得 →
// Client Component (<HomeInteractive />) にハイドレート。
//
// ISR: 90 分毎に再生成 (docs/NEXTJS_MIGRATION_PLAN.md §7 参照)。
//
// プロファイル状態はブラウザの LocalStorage 由来のため、SSR 段階では
// デフォルトプロファイル (1.20.1 / Fabric) で検索を実行する。Phase 5 で
// AppShell 内の useProfiles Client Context と統合すると、Client 側で
// プロファイル切替後に再フェッチが走る形になる。
// ============================================================================

import type { Profile } from '@/types';
import { fetchLatestMinecraftVersions, fetchModrinthSearch } from '@/lib/modrinth/server';
import { HomeInteractive } from '@/components/HomeInteractive';

// 90分毎に ISR 再生成 (fetch のキャッシュ TTL は個別に指定済)
export const revalidate = 5400;

// 初期表示用のデフォルトプロファイル (Vite 版 useProfiles と同値)
const DEFAULT_PROFILE: Profile = {
  id: 'default-profile',
  name: '1.20.1 Fabric 軽量化・ユーティリティ',
  mcVersion: '1.20.1',
  loader: 'Fabric',
  description: 'Modrinthから直接Modを取得・ダウンロードする標準構成',
  mods: []
};

const SEARCH_LIMIT = 24;

export default async function HomePage() {
  // 初期 24 件 + Minecraft バージョン一覧を並列で取得
  // どちらか片方が失敗してもページ全体が落ちないよう try/catch でフォールバック
  const [searchResult, mcVersions] = await Promise.all([
    fetchModrinthSearch({
      query: '',
      mcVersion: DEFAULT_PROFILE.mcVersion,
      loader: DEFAULT_PROFILE.loader,
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
        profile={DEFAULT_PROFILE}
        initialHits={searchResult.hits}
        initialMcVersions={mcVersions}
        initialHasMore={initialHasMore}
      />
    </main>
  );
}
