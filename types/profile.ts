import type { LinkedSource } from './sync';
import type { ModpackSource } from './modpack';

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
