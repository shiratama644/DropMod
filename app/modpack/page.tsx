import type { Metadata } from 'next';
import { ReservedCategoryPage } from '@/components/ReservedCategoryPage';

export const metadata: Metadata = {
  title: 'Modpacks',
  description: 'Modrinth Modpack ハブ。Phase 12 で .mrpack Import / Sync を実装予定。'
};

export default function ModpackReservedPage() {
  return (
    <ReservedCategoryPage
      title="Modpacks"
      icon="fa-boxes-stacked"
      searchType="modpack"
      phaseLabel="Phase 12"
      description="この URL (/modpack) は Phase 12 の Modrinth Modpack ハブ用に予約されています。いまは Modrinth 検索から Modpack を探せます。"
    />
  );
}
