/**
 * 破損 LocalStorage / Dexie データへの防御関数。
 *
 * - profiles が配列でない / 空配列 の場合は undefined を返す (呼び出し側でデフォルト値)
 * - 各 profile が必要フィールドを欠く場合は補完
 * - currentProfileId が存在しないプロファイルを指す場合は先頭に戻す
 *
 * 完全な pure function (state / props / IndexedDB / LocalStorage を触らない) なので
 * ユニットテストしやすく、SSR / 移行スクリプト / hydration の 3 経路すべてで再利用可能。
 *
 * この関数を lib/state/sanitize.ts に置く理由 (Sub-Phase 8-A):
 *   - useProfiles.ts に元々あったが、lib/db/migrate.ts から import すると
 *     循環参照 (useProfiles ↔ migrate) になるため、共通ヘルパとして独立モジュール化。
 *
 * Phase 11-A (2026-08-26):
 *   - Profile の新形状 (environment 集約 / ProjectItem) に対応
 *   - 旧形状 (flat な mcVersion/loader/loaderVersion + ModItem) の入力も
 *     新形状に変換して返す (LocalStorage 旧バックアップからの流入対策)
 *   - 変換ロジック (normalizeProfileForV2) は Dexie schema v2 の upgrade と共用
 */

import type {
  ContentCategory,
  Profile,
  ProfileLoader,
  ProjectItem,
  ThemeMode,
  UnknownFile
} from '@/types';

export interface SanitizedState {
  theme?: ThemeMode;
  currentProfileId?: string;
  profiles?: Profile[];
}

// ---------------------------------------------------------------------------
// Phase 11-A: 旧形状 → 新形状 (ProjectItem / environment) の正規化
// Dexie v2 migration (lib/db/dexie.ts) と共用する pure function。
// ---------------------------------------------------------------------------

const PROFILE_LOADERS: readonly ProfileLoader[] = [
  'Fabric',
  'Forge',
  'NeoForge',
  'Quilt',
  'Vanilla'
];

/** loader 値の正規化。不正値は 'Fabric' (PHASE11_PLAN.md §4.5) */
export function normalizeLoader(raw: unknown): ProfileLoader {
  return typeof raw === 'string' && (PROFILE_LOADERS as readonly string[]).includes(raw)
    ? (raw as ProfileLoader)
    : 'Fabric';
}

function normalizeContentCategory(raw: unknown): ContentCategory {
  return raw === 'resourcepack' || raw === 'shader' ? raw : 'mod';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function strOr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * 1 個の ModItem (旧) または ProjectItem (新) を新形状 ProjectItem に正規化。
 * projectId (旧 id) が文字列で無いものは null。
 */
export function normalizeProjectItem(raw: unknown): ProjectItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const projectId = str(src.projectId) ?? str(src.id);
  if (!projectId) return null;
  const item: ProjectItem = {
    projectId,
    name: strOr(str(src.name) ?? src.title, '(名称未設定)'),
    type: normalizeContentCategory(str(src.type) ?? str(src.projectType)),
    versionId: str(src.versionId) ?? str(src.selectedVersionId),
    versionNumber: str(src.versionNumber) ?? str(src.selectedVersionNumber),
    slug: str(src.slug),
    description: str(src.description),
    icon_url: str(src.icon_url),
    author: str(src.author),
    category: str(src.category),
    versionType: str(src.versionType),
    fileUrl: str(src.fileUrl),
    filename: str(src.filename),
    provider:
      src.provider === 'curseforge' || src.provider === 'unknown'
        ? src.provider
        : src.provider === 'modrinth'
          ? 'modrinth'
          : undefined
  };
  const artifact = src.artifact;
  if (artifact && typeof artifact === 'object') {
    const a = artifact as Record<string, unknown>;
    const sha1 = str(a.sha1);
    const path = str(a.path);
    const size = typeof a.size === 'number' && Number.isFinite(a.size) ? a.size : undefined;
    if (sha1 && path && size !== undefined) {
      item.artifact = { sha1, path, size };
    }
  }
  return item;
}

function normalizeProjectItemList(raw: unknown): ProjectItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => normalizeProjectItem(m))
    .filter((m): m is ProjectItem => m !== null);
}

function normalizeUnknownFile(raw: unknown): UnknownFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const id = str(src.id);
  const filename = str(src.filename);
  const path = str(src.path);
  const sha1 = str(src.sha1);
  if (!id || !filename || !path || !sha1) return null;
  return {
    id,
    filename,
    path,
    sha1,
    location:
      src.location === 'resourcepacks' || src.location === 'shaderpacks'
        ? src.location
        : 'mods',
    size: typeof src.size === 'number' && Number.isFinite(src.size) ? src.size : 0,
    discoveredAt:
      typeof src.discoveredAt === 'number' && Number.isFinite(src.discoveredAt)
        ? src.discoveredAt
        : 0
  };
}

/**
 * 旧形状 (flat) / 新形状 (environment) 両対応の Profile 正規化。
 * id が文字列で無いものは null。
 *
 * - 旧: { id, name, mcVersion, loader, loaderVersion?, description?, mods: ModItem[] }
 * - 新: { id, name, environment: {...}, mods: ProjectItem[], ... }
 */
export function normalizeProfileForV2(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const id = str(src.id);
  if (!id) return null;

  // environment: 新形状を優先、欠損フィールドは旧 flat フィールドから補完
  const env =
    src.environment && typeof src.environment === 'object'
      ? (src.environment as Record<string, unknown>)
      : {};
  const mcVersion =
    str(env.mcVersion) ?? str(src.mcVersion) ?? '1.20.1';
  const loader = normalizeLoader(str(env.loader) ?? str(src.loader));
  const loaderVersion = str(env.loaderVersion) ?? str(src.loaderVersion);

  const profile: Profile = {
    id,
    name: strOr(src.name, '(名称未設定)'),
    description: str(src.description) ?? '',
    environment: loaderVersion
      ? { mcVersion, loader, loaderVersion }
      : { mcVersion, loader },
    mods: normalizeProjectItemList(src.mods)
  };

  const resourcepacks = normalizeProjectItemList(src.resourcepacks);
  if (resourcepacks.length > 0) profile.resourcepacks = resourcepacks;
  const shaderpacks = normalizeProjectItemList(src.shaderpacks);
  if (shaderpacks.length > 0) profile.shaderpacks = shaderpacks;

  if (Array.isArray(src.unknownFiles)) {
    const unknownFiles = src.unknownFiles
      .map((f) => normalizeUnknownFile(f))
      .filter((f): f is UnknownFile => f !== null);
    if (unknownFiles.length > 0) profile.unknownFiles = unknownFiles;
  }

  return profile;
}

// ---------------------------------------------------------------------------
// sanitizeLoadedState (LocalStorage / hydration 防御)
// ---------------------------------------------------------------------------

export function sanitizeLoadedState(raw: unknown): SanitizedState | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as {
    profiles?: unknown;
    theme?: unknown;
    currentProfileId?: unknown;
  };

  let normalizedProfiles: Profile[] | undefined;
  if (Array.isArray(src.profiles)) {
    normalizedProfiles = (src.profiles as unknown[])
      .map((p) => normalizeProfileForV2(p))
      .filter((p): p is Profile => p !== null);
    if (normalizedProfiles.length === 0) {
      normalizedProfiles = undefined;
    }
  }

  let normalizedTheme: ThemeMode | undefined;
  if (src.theme === 'dark' || src.theme === 'light') normalizedTheme = src.theme;

  let normalizedCurrentId: string | undefined;
  if (typeof src.currentProfileId === 'string') {
    const target = src.currentProfileId;
    if (normalizedProfiles?.some((p) => p.id === target)) {
      normalizedCurrentId = target;
    } else if (normalizedProfiles?.[0]) {
      normalizedCurrentId = normalizedProfiles[0].id;
    }
  }

  return {
    theme: normalizedTheme,
    currentProfileId: normalizedCurrentId,
    profiles: normalizedProfiles
  };
}
