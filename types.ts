export type ThemeMode = 'dark' | 'light';
// Phase 9-F: URL 再設計に伴い 'profile' タブを追加
//   - 'home'     → /          (簡易ランディング)
//   - 'mods'     → /mods      (Modrinth 検索一覧、旧 Home のコンテンツ)
//   - 'profile'  → /profile   (選択中プロファイルの Mod 一覧、旧 /mods のコンテンツ)
//   - 'settings' → /settings  (変わらず)
export type TabName = 'home' | 'mods' | 'profile' | 'settings';

/** Profile 内コンテンツの種別 (Phase 11 の 3 カテゴリ)
 *
 * ※ Modrinth API / 検索ドメインの ProjectType (4値: mod/modpack/resourcepack/shader、
 *   lib/constants/search.ts) とは**意図的に分離**している。modpack は Profile を
 *   構成する上位概念 (Phase 12 の modpackSource) であり、Profile 内の実体ファイル
 *   カテゴリではないため。
 */
export type ContentCategory = 'mod' | 'resourcepack' | 'shader';

/** Profile 環境のローダー (Phase 11: environment.loader)。不正値は 'Fabric' に正規化 */
export type ProfileLoader = 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt' | 'Vanilla';

/**
 * ProjectItem (Phase 11-A: 旧 ModItem を改名・整理した 3 カテゴリ共通の flat 型)。
 *
 * 旧フィールドからのリネーム (Dexie v2 migration で既存データを一括変換):
 *   id → projectId / title → name / projectType? → type (必須化) /
 *   selectedVersionId → versionId / selectedVersionNumber → versionNumber
 */
export interface ProjectItem {
  /** Modrinth project ID (旧: id) */
  projectId: string;
  /** 選択中の Modrinth version ID。未設定 = 最新安定版扱い (旧: selectedVersionId) */
  versionId?: string;
  versionNumber?: string; // (旧: selectedVersionNumber)
  /** 表示名 (旧: title) */
  name: string;
  /** コンテンツ分類 (旧: projectType? を必須化。取りこぼしを型で検出) */
  type: ContentCategory;

  // ---- 既存フィールドは維持 ----
  slug?: string;
  description?: string;
  icon_url?: string;
  author?: string;
  category?: string;
  versionType?: string;
  fileUrl?: string;
  filename?: string;

  // ---- Phase 11 追加 ----
  /** Import 由来の provider。未設定 = 従来の手動追加 ('modrinth' 扱い) */
  provider?: 'modrinth' | 'curseforge' | 'unknown';
  /** ローカルファイルの実体情報 (Import 由来のみ設定。Phase 12 の Sync/Backup で再利用) */
  artifact?: {
    sha1: string;
    /** ルートからの相対パス (例: 'mods/sodium-fabric-0.6.0.jar') */
    path: string;
    size: number;
  };
}

/**
 * Unknown File (Phase 11): Modrinth 照合できなかったローカルファイル。
 * category は確定できないため location で記録する。
 */
export interface UnknownFile {
  id: string;
  /** どのディレクトリで見つかったか */
  location: 'mods' | 'resourcepacks' | 'shaderpacks';
  filename: string;
  /** ルートからの相対パス (例: 'mods/some-custom.jar') */
  path: string;
  sha1: string;
  size: number;
  discoveredAt: number;
}

/**
 * Import 解析結果のうち、Profile 作成時に mods 以外で渡すコンテンツ
 * (Phase 11: フォルダ/ZIP 取り込み)。全て optional・空なら設定しない。
 */
export interface ProfileContentExtras {
  resourcepacks?: ProjectItem[];
  shaderpacks?: ProjectItem[];
  unknownFiles?: UnknownFile[];
}

/**
 * Managed File の由来 (Phase 12-A)。
 *
 * Sync Preview の source バッジ表示と「削除時の追加確認が必要か」の判定に使う
 * (PHASE12_PLAN.md §10.3 / §10.5)。
 *
 * - `'dropmod'` : ユーザーが DropMod の検索 UI から追加した (ローカル実体は未取得)
 * - `'import'`  : ローカルフォルダ / ZIP の Import 由来
 * - `'modpack'` : `.mrpack` の overrides 由来 (Phase 12-C で追加)
 *
 * ※ D-6 (2026-08-27 確定): Modpack の紐付けを解除した場合は `'modpack'` →
 *   `'import'` へ昇格させ、ファイルは Profile に残す。
 */
export type ManagedFileSource = 'dropmod' | 'import' | 'modpack';

/**
 * ManagedFileRecord (Phase 12-A): DropMod が「管理下にある」と認識している
 * ローカルファイル 1 件の台帳。
 *
 * Sync の削除可否判定 (PHASE12_PLAN.md §10.2 の 3 条件) のうち
 * 「台帳に存在するか」「fingerprint が unchanged か」を担う。
 * **この台帳に無いファイルは絶対に削除しない** (§4 禁止事項)。
 */
export interface ManagedFileRecord {
  /** `${profileId}::${path}` (path は環境ルートからの相対。一意) */
  id: string;
  profileId: string;
  category: ContentCategory;
  /** 対応する Modrinth project */
  projectId: string;
  /** ルートからの相対パス (例: 'mods/sodium-fabric-0.6.0.jar') */
  path: string;
  /**
   * 管理開始時点の fingerprint。
   * Sync 直前に Local の現値と再比較し、一致していれば「外部変更なし」とみなす。
   */
  sha1: string;
  size: number;
  source: ManagedFileSource;
  /** 台帳に登録した時刻 (Date.now) */
  managedAt: number;
  /** 直近 Sync で書き込んだ時刻 (未 Sync なら未設定) */
  syncedAt?: number;
}

/**
 * LinkedSource (Phase 12-A): Profile とローカル環境の紐付け情報。
 *
 * Phase 11 は「毎回フォルダ選択 → 使い捨て」だったが、Phase 12 では Profile に
 * 保存して Sync 先を固定する。実体の `FileSystemDirectoryHandle` は
 * Dexie の `dirHandles` テーブルに分離して持つ (Profile 自体は JSON 直列化可能に保つ)。
 */
export interface LinkedSource {
  /** 紐付け種別。'zip' は ZIP フォールバック (Direct Write 不可) */
  kind: 'filesystem' | 'zip';
  /** フォルダ名 / ZIP ファイル名 (表示用) */
  rootName: string;
  /** `dirHandles` テーブルのキー (kind === 'filesystem' のときのみ設定) */
  handleId?: string;
  /**
   * 紐付け時に検出した環境。Sync 実行前の **D-1 環境一致チェック**
   * (`Profile.environment` とローカル検出値の比較) に使う。
   */
  environment: {
    mcVersion?: string;
    loader?: ProfileLoader;
    loaderVersion?: string;
  };
  /** 検出したコンテンツディレクトリ (環境ルートからの相対パス) */
  contentDirs: {
    mods?: string;
    resourcepacks?: string;
    shaderpacks?: string;
  };
  linkedAt: number;
}

export interface Profile {
  id: string;
  name: string;
  description?: string;

  /** 環境情報 (Phase 11: 旧 flat な mcVersion / loader / loaderVersion を集約) */
  environment: {
    mcVersion: string;
    loader: ProfileLoader;
    loaderVersion?: string;
  };

  /** 3 カテゴリ (modpack はカテゴリではない)。resourcepacks/shaderpacks は既存 Profile は未設定で OK */
  mods: ProjectItem[];
  resourcepacks?: ProjectItem[];
  shaderpacks?: ProjectItem[];
  unknownFiles?: UnknownFile[];

  /**
   * ローカル環境との紐付け (Phase 12-A)。未設定 = まだ紐付けられていない Profile。
   * Sync は linkedSource が設定された Profile に対してのみ実行できる。
   */
  linkedSource?: LinkedSource;

  /**
   * この Profile の**入手元 Modpack** (Phase 12-C / §10.6)。
   *
   * §10.6: 「Modpack は Profile の **Source** (カテゴリではない)」。
   * `mods` / `resourcepacks` / `shaderpacks` と並ぶ配列ではなく、
   * Profile 1 件につき高々 1 つの由来情報として持つ。
   *
   * 未設定 = Modpack 由来ではない Profile (手動作成 / ZIP Import / フォルダ Import)。
   */
  modpackSource?: ModpackSource;
}

/**
 * Profile の入手元 Modpack (Phase 12-C / §10.6)。
 *
 * `.mrpack` Import 時に設定する。**更新検知** (§10.6「現状より新しい version が
 * Modrinth に存在するか」) と **D-6** (紐付け解除) がこれを読む。
 */
export interface ModpackSource {
  /** 入手元プロバイダ。Phase 12 は `'modrinth'` のみ (CurseForge は Phase 13) */
  provider: 'modrinth' | 'curseforge';
  /** Modpack の project id (更新検知に使う) */
  projectId?: string;
  slug?: string;
  name: string;
  /** Import した時点の Modpack version id */
  versionId?: string;
  versionNumber?: string;
  /** Import した時刻 (Date.now) */
  importedAt: number;
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
  missingRequired: Array<{ sourceMod: ProjectItem; targetProjectId: string }>;
  conflicts: Array<{
    sourceMod: ProjectItem;
    targetMod: ProjectItem | { name: string; projectId: string };
  }>;
  optionalAvailable: Array<{ sourceMod: ProjectItem; targetProjectId: string }>;
  verifiedOK: Array<{ sourceMod: ProjectItem; message: string }>;
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