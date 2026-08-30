import type { ContentCategory, ProfileLoader } from './profile';

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
