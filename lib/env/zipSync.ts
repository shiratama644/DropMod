/**
 * ZIP への Sync (Phase 12-C / PHASE12_PLAN.md §10.1・DoD)。
 *
 * > Chromium: `FileSystemSink` による Direct Write
 * > **Firefox / Safari / モバイル: `ZipSink` (既存 useZipExport の拡張)**
 *
 * DoD: 「**Firefox / Safari で ZipSink 経由の Sync が動作**」。
 * File System Access API が無いブラウザでは `prepareSync()` が
 * `not-linked` / `folder-unavailable` で止まり、Sync に到達できない。
 * ここがその受け皿。
 *
 * ## Direct Write と同じ経路を通す
 *
 * `applySync()` は `prepared.sink` に書き込むだけの作りなので、
 * **sink を ZipSink に差し替えた `ReadySyncOutcome` を組めば
 * Journal / Backup / Rollback / 台帳更新をそのまま再利用できる**。
 * ZIP 専用の実行系は書かない。
 *
 * ## seed (既存の .minecraft ZIP) の有無で意味が変わる
 *
 * | seed | Local | 意味 |
 * | --- | --- | --- |
 * | あり | その ZIP をスキャン | 既存環境との差分を適用した ZIP が得られる |
 * | なし | 空 | Profile の全 Mod を新規追加した ZIP が得られる |
 *
 * seed ありのときは **3 カテゴリ以外のファイルも ZIP に残す**
 * (ZipSink は最後に全体を吐くので、落とすと環境が壊れる)。
 *
 * ## D-2: 自動では切り替えない
 *
 * この経路は**ユーザーが明示的にボタンを押したときだけ**動く。
 * Direct Write が使えるのに勝手に ZIP へ落とすことはしない。
 */

import JSZip from 'jszip';
import { computeSyncPlan, type SyncPlan } from './diff';
import { scanLocalEnvironment, type ScanProgress } from './scan';
import { analyzeEnvironmentSource } from './analyzer';
import { checkEnvironmentMatch, type EnvironmentCheckResult } from './environmentCheck';
import { ZipSource } from './zipSource';
import { ZipSink } from './sink/zip';
import { MemoryBackupStore } from './backup';
import { applySync, type ApplySyncDeps, type ApplySyncResult } from './applySync';
import type { ReadySyncOutcome } from './syncPrep';
import { getManagedFiles } from '@/lib/db/dexie';
import type { LinkedSource, Profile } from '@/types';

/** 既定のコンテンツディレクトリ名 (`.minecraft` 標準) */
export const DEFAULT_CONTENT_DIRS: NonNullable<LinkedSource['contentDirs']> = {
  mods: 'mods',
  resourcepacks: 'resourcepacks',
  shaderpacks: 'shaderpacks'
};

export interface PrepareZipSyncInput {
  profile: Profile;
  /** 既存の .minecraft ZIP (任意)。あれば Local として扱い、内容も保持する */
  seedBlob?: Blob;
  /** 表示用の名前 (既定 `minecraft`) */
  rootName?: string;
  onScanProgress?: (progress: ScanProgress) => void;
  deps?: {
    scan?: typeof scanLocalEnvironment;
    getManaged?: typeof getManagedFiles;
  };
}

export type PrepareZipSyncOutcome =
  | { status: 'ready'; prepared: ReadySyncOutcome; sink: ZipSink; rootName: string }
  | { status: 'blocked-environment'; rootName: string; check: EnvironmentCheckResult };

/**
 * ZIP への Sync を編成する。
 *
 * **例外を投げない** (`prepareSync()` と同じ方針)。
 */
export async function prepareZipSync(
  input: PrepareZipSyncInput
): Promise<PrepareZipSyncOutcome> {
  const { profile, seedBlob, onScanProgress, deps = {} } = input;
  const scan = deps.scan ?? scanLocalEnvironment;
  const getManaged = deps.getManaged ?? getManagedFiles;

  const baseName = input.rootName ?? 'minecraft';
  // `categoryDirs()` は **dir が明示されたカテゴリだけ**を走査する。
  // 空オブジェクトを渡すと 1 件も走査されないので、必ず既定名を敷く。
  // (FileSystem 経路では `linkedSource.contentDirs` が常に埋まるため問題にならない)
  let contentDirs: NonNullable<LinkedSource['contentDirs']> = {
    ...DEFAULT_CONTENT_DIRS,
    ...profile.linkedSource?.contentDirs
  };

  let sink: ZipSink;
  let entries: Awaited<ReturnType<typeof scanLocalEnvironment>>['entries'];
  let check: EnvironmentCheckResult;

  if (seedBlob) {
    // 既存 ZIP を Local とみなす。**中身も sink に seed する**ので
    // unchanged / 3 カテゴリ外のファイルがそのまま残る。
    sink = await ZipSink.fromZipBlob(seedBlob, `${baseName}.zip`);
    // ZipSource は JSZip インスタンスを受け取る (Blob ではない)
    const source = new ZipSource(await JSZip.loadAsync(seedBlob), baseName);

    // D-1: 環境が食い違うなら Direct Write と同じくブロックする
    const analysis = await analyzeEnvironmentSource(source);
    check = checkEnvironmentMatch(profile.environment, analysis.environment);
    if (!check.ok) {
      return { status: 'blocked-environment', rootName: sink.rootName, check };
    }
    // ZIP から実際に検出したディレクトリ名を優先する
    contentDirs = { ...contentDirs, ...analysis.environment.contentDirs };

    const scanned = await scan(source, contentDirs, onScanProgress);
    entries = scanned.entries;
  } else {
    // seed なし = Local は空。Profile の全 Mod が addition になる。
    sink = new ZipSink(`${baseName}.zip`);
    entries = [];
    // 比較対象が無いので不一致は起こりようがない
    check = { ok: true, mismatches: [], unverified: [] };
  }

  const managed = await getManaged(profile.id);
  const plan: SyncPlan = computeSyncPlan({ profile, managed, local: entries, contentDirs });

  await sink.ensureWritable();

  return {
    status: 'ready',
    rootName: sink.rootName,
    sink,
    // applySync にそのまま渡せる形に組む (Direct Write と同じ実行経路)
    prepared: {
      status: 'ready',
      rootName: sink.rootName,
      check,
      plan,
      sink,
      writable: true,
      writableReason: null,
      scanSkipped: []
    }
  };
}

export interface ApplyZipSyncInput {
  profile: Profile;
  prepared: ReadySyncOutcome;
  sink: ZipSink;
  /** Preview でユーザーが「保持」を選んだ削除予定のパス (§10.3) */
  excludedDeletionPaths?: readonly string[];
  onProgress?: (progress: { done: number; total: number; path: string }) => void;
  deps?: ApplySyncDeps;
}

export interface ApplyZipSyncResult extends ApplySyncResult {
  /** 書き出し用の ZIP。適用が完了したときだけ設定される */
  blob: Blob | null;
  /** ZIP のバイト数 */
  bytes: number;
}

/**
 * ZIP への Sync を適用し、結果の ZIP を返す。
 *
 * **適用が完了しなかった場合は blob を返さない** — 中途半端な ZIP を
 * ユーザーに渡すと、それを展開して環境が壊れる。
 */
export async function applyZipSync(input: ApplyZipSyncInput): Promise<ApplyZipSyncResult> {
  const { profile, prepared, sink, excludedDeletionPaths, onProgress, deps } = input;

  const applied = await applySync({
    profile,
    prepared,
    excludedDeletionPaths,
    onProgress,
    // **Backup もメモリ**。ZIP 経路は書き込み先がメモリなので退避先もメモリでよく、
    // それ以上に「ZIP 経路を使う環境こそ OPFS が無い可能性がある」。
    // 呼び出し側が deps で上書きしないときだけ既定を差し替える。
    deps: deps?.backup ? deps : { ...deps, backup: new MemoryBackupStore() }
  });

  if (applied.result.outcome !== 'completed') {
    return { ...applied, blob: null, bytes: 0 };
  }

  const blob = await sink.toBlob();
  return { ...applied, blob, bytes: blob.size };
}
