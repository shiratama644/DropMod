/**
 * ContentProvider レジストリ (Phase 12-C)。
 *
 * Phase 12 は **Modrinth のみ**。CurseForge は `P13-A` (API proxy + Murmur2) で追加する。
 * `getProvider('curseforge')` は現状 `null` を返す — 呼べるのに動かない状態を
 * 作らないため、型は `ContentProvider | null` にしてある。
 */

import type { ContentProvider, ProviderId } from './types';
import { modrinthProvider } from './modrinth';

const REGISTRY: Partial<Record<ProviderId, ContentProvider>> = {
  modrinth: modrinthProvider
};

/** 既定のプロバイダ (Phase 12 は Modrinth 固定) */
export const DEFAULT_PROVIDER_ID: ProviderId = 'modrinth';

export function getProvider(id: ProviderId = DEFAULT_PROVIDER_ID): ContentProvider | null {
  return REGISTRY[id] ?? null;
}

/** 利用可能なプロバイダ一覧 (UI の選択肢用) */
export function availableProviders(): ContentProvider[] {
  return Object.values(REGISTRY).filter((p): p is ContentProvider => Boolean(p));
}

export type { ContentProvider, ProviderId, ProviderProject, ProviderVersion } from './types';
export type {
  ProviderContext,
  ProviderSearchInput,
  ProviderSearchResult,
  ProviderUpdateInfo
} from './types';
export { ModrinthProvider, modrinthProvider } from './modrinth';
