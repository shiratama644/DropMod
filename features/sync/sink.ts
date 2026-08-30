/**
 * EnvironmentSink 抽象レイヤー (Phase 12-B / PHASE12_PLAN.md §10.1)。
 *
 * Phase 11 の `EnvironmentSource` (読み取り) と**対になる書き込み側**。
 * 上位ロジック (Executor) はブラウザ差を意識せず動作する。
 *
 * - Chromium: `FileSystemSink` (`lib/env/sink/filesystem.ts`) — Direct Write
 * - Firefox / Safari / モバイル: `ZipSink` (Phase 12-C)
 *
 * ## D-2 (2026-08-27 確定): 書き込み権限の昇格失敗
 *
 * `ensureWritable()` は**失敗しても throw せず `false` を返す**。
 * 呼び出し側 (UI) は Read-only 解析を継続しつつ Sync ボタンを無効化し、
 * 「ZIP で書き出す」を代替手段として提示する。**自動で ZipSink へは切り替えない**
 * (「書き込んだ」と誤解させないため)。
 */

/** パスは常にルート相対・'/' 区切り (例: 'mods/sodium.jar') */
export interface EnvironmentSink {
  /** シンク種別 (UI 分岐・ログ用) */
  kind: 'filesystem' | 'zip';
  /** ルートの表示名 (フォルダ名 / ZIP ファイル名) */
  rootName: string;

  /** 直近の `ensureWritable()` の結果。未確認なら false */
  readonly writable: boolean;

  /**
   * 書き込み権限を確保する。
   * @returns 書き込み可能なら true。**拒否・非対応でも throw せず false** (D-2)
   */
  ensureWritable(): Promise<boolean>;

  /** 現在の内容を読む。**存在しなければ null** (throw しない。Backup 用) */
  readFile(path: string): Promise<Uint8Array | null>;

  /**
   * ファイルを書き込む。親ディレクトリが無ければ自動生成する。
   * 既存ファイルは上書き。
   */
  writeFile(path: string, data: Uint8Array): Promise<void>;

  /**
   * ファイルを削除する。**存在しなければ何もしない** (冪等。Rollback の再実行に必要)。
   */
  removeFile(path: string): Promise<void>;

  /** ファイルが存在するか */
  exists(path: string): Promise<boolean>;
}
