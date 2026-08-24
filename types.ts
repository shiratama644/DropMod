export type ThemeMode = 'dark' | 'light';
// Phase 9-F: URL 再設計に伴い 'profile' タブを追加
//   - 'home'     → /          (簡易ランディング)
//   - 'mods'     → /mods      (Modrinth 検索一覧、旧 Home のコンテンツ)
//   - 'profile'  → /profile   (選択中プロファイルの Mod 一覧、旧 /mods のコンテンツ)
//   - 'settings' → /settings  (変わらず)
export type TabName = 'home' | 'mods' | 'profile' | 'settings';

/** Profile 内コンテンツの種別 (Phase 11 の 3 カテゴリ) */
export type ContentCategory = 'mod' | 'resourcepack' | 'shader';

export interface ModItem {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  icon_url?: string;
  author?: string;
  category?: string;
  /** 未指定は 'mod'。Resource Pack / Shader 追加時に埋める */
  projectType?: ContentCategory;
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
  /** Fabric / Quilt / Forge / NeoForge のローダーバージョン (任意) */
  loaderVersion?: string;
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
  /** 検索ヒットのヘッダー画像 (表示形式「最大」で使用) */
  featured_gallery?: string | null;
}

export interface ModrinthGalleryImage {
  url: string;
  /**
   * オリジナル（フル解像度）画像 URL (PNG 等)。
   *
   * `url` は `_350.webp` (350px 幅) のサムネイル。ギャラリーの全画面閲覧
   * (ScreenshotGalleryModal のメインビュー) 等では本フィールド (`raw_url`)
   * を優先して高画質で表示する。API 応答に含まれない場合は undefined。
   */
  raw_url?: string;
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
  // Phase 10-P1 修正: Modrinth API では稀に categories / display_categories が
  // 欠落した状態で返る (aggregator project / モデレーション中の project など)。
  // 従来 required としていたがプレンダー失敗の原因となったため optional に変更。
  // 参照側は `?? []` で defensive に扱うこと。
  categories?: string[];
  display_categories?: string[];
  downloads: number;
  icon_url?: string;
  /**
   * オリジナル（フル解像度）アイコン URL (PNG 等)。
   *
   * Modrinth API が返す `icon_url` は `_96.webp` の低解像度サムネイル (96px) であり、
   * これを 112px〜128px 等のやや大きい表示サイズで使うとぼやける。
   * 詳細ページのヒーローアイコン等では本フィールド (`raw_icon_url`) を優先して
   * 使用することで高画質を維持する。API 応答に含まれない場合は undefined。
   */
  raw_icon_url?: string;
  published: string;
  updated: string;
  author?: string;
  // ---- Phase 10-P1: 詳細ページ用の追加メタデータ (Modrinth API 応答準拠) ----
  // これらは Modrinth /project レスポンスに含まれる公式フィールド。
  // 全て optional (msw のモックや古い project レスポンスで欠落する可能性がある)。
  source_url?: string | null;
  issues_url?: string | null;
  wiki_url?: string | null;
  discord_url?: string | null;
  donation_urls?: Array<{
    id: string;
    platform: string;
    url: string;
  }> | null;
  license?: {
    id: string;
    name?: string;
    url?: string | null;
  } | null;
  client_side?: 'required' | 'optional' | 'unsupported' | 'unknown';
  server_side?: 'required' | 'optional' | 'unsupported' | 'unknown';
  loaders?: string[];
  game_versions?: string[];
  followers?: number;
  color?: number | null;
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

export type VersionChannel = 'stable' | 'beta' | 'alpha';

export interface DropdownOption {
  label: string;
  value: string;
  /** Font Awesome solid 名 (`fa-circle-check` 等)。未指定ならアイコンなし */
  icon?: string;
  /** バージョンチャネル色。未指定なら通常色 */
  tone?: VersionChannel;
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