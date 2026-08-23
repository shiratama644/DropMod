export type ThemeMode = 'dark' | 'light';
// Phase 9-F: URL 再設計に伴い 'profile' タブを追加
//   - 'home'     → /          (簡易ランディング)
//   - 'mods'     → /mods      (Modrinth 検索一覧、旧 Home のコンテンツ)
//   - 'profile'  → /profile   (選択中プロファイルの Mod 一覧、旧 /mods のコンテンツ)
//   - 'settings' → /settings  (変わらず)
export type TabName = 'home' | 'mods' | 'profile' | 'settings';

export interface ModItem {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  icon_url?: string;
  author?: string;
  category?: string;
  selectedVersionId?: string;
  selectedVersionNumber?: string;
  versionType?: string;
  fileUrl?: string;
  filename?: string;
}

export interface Profile {
  id: string;
  name: string;
  mcVersion: string;
  loader: string;
  description?: string;
  mods: ModItem[];
}

export interface ModrinthHit {
  project_id: string;
  project_type: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  display_categories: string[];
  versions: string[];
  downloads: number;
  // Modrinth API はアイコン未設定プロジェクトを null で返すため
  // null を許容する型にしている。呼び出し側で null チェック必須。
  icon_url: string | null;
}

export interface ModrinthGalleryImage {
  url: string;
  featured?: boolean;
  title?: string;
  description?: string;
  created?: string;
  ordering?: number;
}

export interface ModrinthProject {
  id: string;
  slug: string;
  project_type: string;
  title: string;
  description: string;
  body?: string;
  gallery?: ModrinthGalleryImage[];
  categories: string[];
  display_categories: string[];
  downloads: number;
  icon_url?: string;
  published: string;
  updated: string;
  author?: string;
}

export interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface ModrinthDependency {
  project_id: string;
  version_id?: string;
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  author_id: string;
  featured: boolean;
  name: string;
  version_number: string;
  changelog?: string;
  date_published: string;
  downloads: number;
  version_type: 'release' | 'beta' | 'alpha';
  files: ModrinthVersionFile[];
  dependencies?: ModrinthDependency[];
  game_versions: string[];
  loaders: string[];
}

export interface Toast {
  id: string;
  message: string;
  // 'error' 種別は削除失敗・致命的エラー時の赤系表示用。
  // 'warning' との視覚的区別のため独立した種別として持たせる。
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface DropdownOption {
  label: string;
  value: string;
}

export interface DependencyCheckData {
  missingRequired: Array<{ sourceMod: ModItem; targetProjectId: string }>;
  conflicts: Array<{ sourceMod: ModItem; targetMod: ModItem | { title: string; id: string } }>;
  optionalAvailable: Array<{ sourceMod: ModItem; targetProjectId: string }>;
  verifiedOK: Array<{ sourceMod: ModItem; message: string }>;
  depProjectMap: Map<string, ModrinthProject>;
}

// Modrinth API レスポンスの型を明示 (any を削減する目的)
// .mrpack (Modrinth Index) のフォーマット v1
// https://docs.modrinth.com/docs/modpacks/format_definition/
export interface MrpackFile {
  path: string;
  hashes?: { sha1?: string; sha512?: string };
  env?: { client?: string; server?: string };
  downloads?: string[];
  fileSize?: number;
}

export interface MrpackDependencies {
  minecraft?: string;
  'fabric-loader'?: string;
  forge?: string;
  neoforge?: string;
  'quilt-loader'?: string;
}

export interface MrpackIndex {
  formatVersion: number;
  game: 'minecraft';
  versionId?: string;
  name?: string;
  summary?: string;
  files?: MrpackFile[];
  dependencies?: MrpackDependencies;
}