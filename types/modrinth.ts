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
  /** Modrinth search の date_modified (ISO)。sitemap lastmod 用 */
  date_modified?: string;
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
  /**
   * **P12-D3**: Modrinth API はファイルごとの hash を返す。
   * 既存呼び出しでは不要だったが、ロック情報 (lockedVersions) の sha1 として
   * 導入時に記録するために追加 (optional なので既存データ・テストに影響なし)。
   */
  hashes?: { sha1?: string; sha512?: string };
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
