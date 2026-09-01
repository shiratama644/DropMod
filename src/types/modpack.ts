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
  /**
   * **P12-D2 / D-3 の先行構造 (2026-08-29 ユーザー確定)**:
   * 「導入時点で Modpack が指定していた収録物のバージョン」(projectId → version)。
   *
   * P12-D3 (Sync Preview の競合検出・適用) が「Profile の現在値」と
   * 「導入時の指定」を突き合わせて競合を判定するための基準。
   * Discover 追加 / .mrpack Import の両方で記録する。
   */
  lockedVersions?: Record<string, ModpackLockedVersion>;
}

/**
 * **P12-D3**: 導入時に Modpack が指定していた収録物 1 件のロック情報。
 *
 * `versionId` / `versionNumber` は競合判定に、`fileUrl` / `filename` /
 * `sha1` / `size` / `path` は「Modpack 版に置換」を選んだときに Profile の
 * `ProjectItem` を**導入時の実体情報込みで**復元するために使う
 * (Sync のダウンロード元・差分判定が正しく動くようにするため)。
 */
export interface ModpackLockedVersion {
  versionId?: string;
  versionNumber?: string;
  /** 導入時のダウンロード URL (Modrinth CDN) */
  fileUrl?: string;
  filename?: string;
  /** 導入時の fingerprint (.mrpack modrinth.index.json の hashes.sha1) */
  sha1?: string;
  size?: number;
  /** 導入時に Modpack が指定した環境ルート相対パス (例: 'mods/sodium.jar') */
  path?: string;
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
