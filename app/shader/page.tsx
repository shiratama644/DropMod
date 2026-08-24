import type { Metadata } from 'next';
import { ReservedCategoryPage } from '@/components/ReservedCategoryPage';

export const metadata: Metadata = {
  title: 'Shaders',
  description: 'Shader ハブ。Phase 11 でローカル shaderpacks/ の Import を実装予定。'
};

export default function ShaderReservedPage() {
  return (
    <ReservedCategoryPage
      title="Shaders"
      icon="fa-wand-sparkles"
      searchType="shader"
      phaseLabel="Phase 11"
      description="この URL (/shader) は Phase 11 の Shader ハブ用に予約されています。いまは Modrinth 検索から探せます。"
    />
  );
}
