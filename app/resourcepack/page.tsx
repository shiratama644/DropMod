import type { Metadata } from 'next';
import { ReservedCategoryPage } from '@/components/ReservedCategoryPage';

export const metadata: Metadata = {
  title: 'Resource Packs',
  description: 'Resource Pack ハブ。Phase 11 でローカル resourcepacks/ の Import を実装予定。'
};

export default function ResourcepackReservedPage() {
  return (
    <ReservedCategoryPage
      title="Resource Packs"
      icon="fa-palette"
      searchType="resourcepack"
      phaseLabel="Phase 11"
      description="この URL (/resourcepack) は Phase 11 の Resource Pack ハブ用に予約されています。いまは Modrinth 検索から探せます。"
    />
  );
}
