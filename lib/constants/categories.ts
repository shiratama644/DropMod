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
