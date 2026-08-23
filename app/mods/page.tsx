// ============================================================================
// /mods ページ (Phase 9-F: URL 再設計で Home の Modrinth 検索 UI を移設)
//
// Server Component として初期 24 件を Modrinth /search から SSR 取得 →
// Client Component (<HomeInteractive />) にハイドレート。
//
// cookies() で dropmod_active_profile を読み取り、ユーザーの実際の
// プロファイルの mcVersion/loader で SSR fetch する。これで hydration 後に
// LocalStorage から復元されたプロファイルと SSR 結果がミスマッチして
// 「ちらつき」が起きる問題が解消される。
// cookie が無い or 無効なら SSR_DEFAULT (1.20.1 / Fabric) で fetch。
//
// URL 変更経緯:
//   - Phase 9-F 以前: / (Home) にこの内容 (Modrinth 検索一覧)
//   - Phase 9-F 以降: /mods に移設。Home は簡易ランディングに縮小
//   - 旧 /mods (選択中プロファイル) は /profile に移設
//
// Intercepting Routes:
//   - /mods からのソフトナビ (Link href="/mods/[slug]") でモーダル表示
//   - 直接アクセスや他ページからは通常フルページ
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

export const metadata = {
  title: 'Mod を探す - DropMod',
  description:
    'Modrinth から Mod を検索・追加できます。カテゴリ・並び順・Minecraft バージョン・ローダーで絞り込み可能。'
};

export default async function ModsListPage() {
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
    console.warn('[DropMod] /mods SSR search failed:', e);
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
