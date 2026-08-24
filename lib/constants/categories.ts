import type { ProjectType } from './search';

export interface CategoryOption {
  id: string;
  label: string;
}

const ALL: CategoryOption = { id: 'All', label: 'すべて' };

/** 互換: 従来の Mods カテゴリ */
export const CATEGORIES: CategoryOption[] = [
  ALL,
  { id: 'utility', label: 'ユーティリティ' },
  { id: 'optimization', label: '軽量化' },
  { id: 'technology', label: '工業' },
  { id: 'adventure', label: '冒険' },
  { id: 'magic', label: '魔法' },
  { id: 'storage', label: 'ストレージ' },
  { id: 'decoration', label: '装飾' },
  { id: 'worldgen', label: 'ワールド生成' },
  { id: 'equipment', label: '装備' }
];

const MODPACK_CATEGORIES: CategoryOption[] = [
  ALL,
  { id: 'challenging', label: '高難度' },
  { id: 'combat', label: '戦闘' },
  { id: 'kitchen-sink', label: 'キッチンシンク' },
  { id: 'lightweight', label: '軽量' },
  { id: 'multiplayer', label: 'マルチプレイ' },
  { id: 'quests', label: 'クエスト' },
  { id: 'technology', label: '工業' }
];

const RESOURCEPACK_CATEGORIES: CategoryOption[] = [
  ALL,
  { id: 'vanilla-like', label: 'バニラ風' },
  { id: 'realistic', label: 'リアル' },
  { id: 'simplistic', label: 'シンプル' },
  { id: 'themed', label: 'テーマ' },
  { id: 'tweaks', label: '小改変' },
  { id: '16x', label: '16x' },
  { id: '32x', label: '32x' },
  { id: '64x', label: '64x' },
  { id: '128x', label: '128x+' },
  { id: 'audio', label: '音声' },
  { id: 'font', label: 'フォント' }
];

const SHADER_CATEGORIES: CategoryOption[] = [
  ALL,
  { id: 'cartoon', label: 'カートゥーン' },
  { id: 'cursed', label: 'カースド' },
  { id: 'fantasy', label: 'ファンタジー' },
  { id: 'realistic', label: 'リアル' },
  { id: 'semi-realistic', label: 'セミリアル' },
  { id: 'vanilla-like', label: 'バニラ風' },
  { id: 'bloom', label: 'ブルーム' },
  { id: 'colored-lighting', label: 'カラーライティング' },
  { id: 'path-tracing', label: 'パストレーシング' },
  { id: 'pbr', label: 'PBR' },
  { id: 'reflections', label: '反射' },
  { id: 'shadows', label: '影' }
];

export const CATEGORIES_BY_TYPE: Record<ProjectType, CategoryOption[]> = {
  mod: CATEGORIES,
  modpack: MODPACK_CATEGORIES,
  resourcepack: RESOURCEPACK_CATEGORIES,
  shader: SHADER_CATEGORIES
};

export function categoriesForProjectType(type: ProjectType): CategoryOption[] {
  return CATEGORIES_BY_TYPE[type] ?? CATEGORIES;
}

/** 検索 facet に混ざるローダー / プロジェクト種別。カードの「カテゴリー」には出さない */
const NON_CONTENT_CATEGORY_IDS = new Set([
  'fabric',
  'forge',
  'neoforge',
  'quilt',
  'liteloader',
  'rift',
  'risugami-modloader',
  'modloader',
  'legacy-fabric',
  'babric',
  'bta-babric',
  'java-agent',
  'nilloader',
  'ornithe',
  'bukkit',
  'spigot',
  'paper',
  'purpur',
  'folia',
  'sponge',
  'spongeapi',
  'velocity',
  'bungeecord',
  'waterfall',
  'geyser',
  'datapack',
  'iris',
  'canvas',
  'optifine',
  'vanilla',
  'minecraft',
  'mod',
  'modpack',
  'resourcepack',
  'shader',
  'plugin'
]);

/** フィルタチップに無い公式タグの日本語。チップ側ラベルが無いときだけ使う */
const EXTRA_CATEGORY_LABELS: Record<string, string> = {
  economy: '経済',
  food: '食料',
  'game-mechanics': 'ゲームメカニクス',
  library: 'ライブラリ',
  management: '管理',
  minigame: 'ミニゲーム',
  mobs: 'モブ',
  social: 'ソーシャル',
  transportation: '移動',
  performance: '軽量化',
  '8x-': '8x',
  '256x': '256x',
  '512x+': '512x+',
  'core-shaders': 'コアシェーダー',
  entities: 'エンティティ',
  environment: '環境',
  gui: 'GUI',
  items: 'アイテム',
  locale: '言語',
  models: 'モデル',
  blocks: 'ブロック',
  atmosphere: '大気',
  foliage: '植生',
  fonts: 'フォント'
};

const CATEGORY_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = { ...EXTRA_CATEGORY_LABELS };
  for (const list of Object.values(CATEGORIES_BY_TYPE)) {
    for (const option of list) {
      if (option.id !== 'All') map[option.id] = option.label;
    }
  }
  return map;
})();

function isContentCategoryId(id: string): boolean {
  const key = id.trim().toLowerCase();
  return key.length > 0 && !NON_CONTENT_CATEGORY_IDS.has(key);
}

/** display_categories を優先し、ローダー等を除いた先頭カテゴリー id */
export function primaryCategoryId(
  displayCategories?: readonly string[] | null,
  categories?: readonly string[] | null
): string | undefined {
  for (const list of [displayCategories, categories]) {
    if (!list) continue;
    for (const raw of list) {
      if (typeof raw !== 'string') continue;
      const id = raw.trim();
      if (isContentCategoryId(id)) return id;
    }
  }
  return undefined;
}

export function categoryLabel(id: string | undefined | null): string {
  if (!id) return '未分類';
  return CATEGORY_LABELS[id] ?? CATEGORY_LABELS[id.toLowerCase()] ?? id;
}
