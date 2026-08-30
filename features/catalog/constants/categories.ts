import type { ProjectType } from '@/lib/constants/search';

export interface CategoryOption {
  id: string;
  label: string;
}

// 2026-08-27: カテゴリ表示は Modrinth に合わせてすべて英語表記に統一
// (facet id と表示ラベルが一致するため照合しやすい)
const ALL: CategoryOption = { id: 'All', label: 'All' };

/** 互換: 従来の Mods カテゴリ */
export const CATEGORIES: CategoryOption[] = [
  ALL,
  { id: 'utility', label: 'Utility' },
  { id: 'optimization', label: 'Optimization' },
  { id: 'technology', label: 'Technology' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'magic', label: 'Magic' },
  { id: 'storage', label: 'Storage' },
  { id: 'decoration', label: 'Decoration' },
  { id: 'worldgen', label: 'World Gen' },
  { id: 'equipment', label: 'Equipment' }
];

const MODPACK_CATEGORIES: CategoryOption[] = [
  ALL,
  { id: 'challenging', label: 'Challenging' },
  { id: 'combat', label: 'Combat' },
  { id: 'kitchen-sink', label: 'Kitchen Sink' },
  { id: 'lightweight', label: 'Lightweight' },
  { id: 'multiplayer', label: 'Multiplayer' },
  { id: 'quests', label: 'Quests' },
  { id: 'technology', label: 'Technology' }
];

const RESOURCEPACK_CATEGORIES: CategoryOption[] = [
  ALL,
  { id: 'vanilla-like', label: 'Vanilla-like' },
  { id: 'realistic', label: 'Realistic' },
  { id: 'simplistic', label: 'Simplistic' },
  { id: 'themed', label: 'Themed' },
  { id: 'tweaks', label: 'Tweaks' },
  { id: '16x', label: '16x' },
  { id: '32x', label: '32x' },
  { id: '64x', label: '64x' },
  { id: '128x', label: '128x+' },
  { id: 'audio', label: 'Audio' },
  { id: 'font', label: 'Font' }
];

const SHADER_CATEGORIES: CategoryOption[] = [
  ALL,
  { id: 'cartoon', label: 'Cartoon' },
  { id: 'cursed', label: 'Cursed' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'realistic', label: 'Realistic' },
  { id: 'semi-realistic', label: 'Semi-realistic' },
  { id: 'vanilla-like', label: 'Vanilla-like' },
  { id: 'bloom', label: 'Bloom' },
  { id: 'colored-lighting', label: 'Colored Lighting' },
  { id: 'path-tracing', label: 'Path Tracing' },
  { id: 'pbr', label: 'PBR' },
  { id: 'reflections', label: 'Reflections' },
  { id: 'shadows', label: 'Shadows' }
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

/** フィルタチップに無い公式タグのラベル。チップ側ラベルが無いときだけ使う */
const EXTRA_CATEGORY_LABELS: Record<string, string> = {
  economy: 'Economy',
  food: 'Food',
  'game-mechanics': 'Game Mechanics',
  library: 'Library',
  management: 'Management',
  minigame: 'Minigame',
  mobs: 'Mobs',
  social: 'Social',
  transportation: 'Transportation',
  performance: 'Performance',
  '8x-': '8x',
  '256x': '256x',
  '512x+': '512x+',
  'core-shaders': 'Core Shaders',
  entities: 'Entities',
  environment: 'Environment',
  gui: 'GUI',
  items: 'Items',
  locale: 'Language',
  models: 'Models',
  blocks: 'Blocks',
  atmosphere: 'Atmosphere',
  foliage: 'Foliage',
  fonts: 'Fonts'
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
  if (!id) return 'Uncategorized';
  return CATEGORY_LABELS[id] ?? CATEGORY_LABELS[id.toLowerCase()] ?? id;
}
