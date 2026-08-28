/**
 * Diff Engine — `computeSyncPlan()` (Phase 12-A)。
 *
 * PHASE12_PLAN.md §10.2 を実装する。**Profile (SSOT) と ローカル環境と 台帳の
 * 3 つを突き合わせ**、書き込む前に SyncPlan を生成する。この関数は pure で、
 * 一切の書き込み・削除を行わない (§4 禁止事項: Preview なしの書き込み禁止)。
 *
 * ## 5 分類 (§10.2)
 *
 * | 分類 | 条件 |
 * |---|---|
 * | 🟢 addition  | Profile にあるが Local に実体が無い |
 * | 🟡 update    | 同一 project で sha1 が Profile と Local で異なる |
 * | 🔴 deletion  | **3 条件すべて**を満たす場合のみ (下記) |
 * | 🔵 unchanged | Profile / Local / 台帳で sha1 が一致 |
 * | ⚪ unmanaged | Local にあるが台帳に無い → **削除対象外 (表示のみ)** |
 *
 * ## 削除の 3 条件 (§10.2 — ここが Phase 12 の心臓部)
 *
 * ```
 * ManagedFileRecord が存在する
 *   AND 現在の Local fingerprint == ManagedFileRecord.sha1   ← unchanged 必須
 *   AND Profile の該当カテゴリが該当 projectId を持たない
 * ```
 *
 * **fingerprint が一致しなければ削除せず**、`unchanged` に
 * `externallyModified: true` を付けて保持する (ユーザーが手で差し替えた
 * ファイルを守る)。UI はこれを独立セクションで警告表示する (§10.3)。
 */

import type {
  ContentCategory,
  LinkedSource,
  ManagedFileRecord,
  ManagedFileSource,
  Profile,
  ProjectItem
} from '@/types';
import { itemsOfCategory, MANAGED_CATEGORIES } from './managed';

/** ローカル環境のスキャン結果 1 件 (呼び出し側が SHA-1 計算して渡す) */
export interface LocalFileEntry {
  category: ContentCategory;
  /** 環境ルートからの相対パス (`ManagedFileRecord.path` と同じ基準) */
  path: string;
  sha1: string;
  size: number;
}

export type SyncEntryKind = 'addition' | 'update' | 'deletion' | 'unchanged' | 'unmanaged';

export interface SyncPlanEntry {
  kind: SyncEntryKind;
  category: ContentCategory;
  /**
   * 対象パス。
   * addition で `artifact` が無く filename も不明な場合は空文字 =
   * 「ダウンロード後に確定」(`needsDownload` と併せて参照)。
   */
  path: string;
  /** 表示名 */
  name: string;
  /** 対応する Modrinth project (unmanaged には無い) */
  projectId?: string;
  /** Preview の source バッジ (§10.3)。unmanaged には付けない */
  source?: ManagedFileSource;
  /** 書き込むべき fingerprint (addition / update) */
  targetSha1?: string;
  /** 現在の Local fingerprint (update / deletion / unchanged) */
  localSha1?: string;
  /** 台帳の fingerprint (deletion / unchanged) */
  managedSha1?: string;
  /** 対象サイズ。addition/update は書き込み先、deletion は削除される実体のサイズ */
  size: number;
  /** Modrinth からのダウンロードが必要 (ローカルに実体が無い addition) */
  needsDownload?: boolean;
  /**
   * §10.2: fingerprint 不一致により **deletion を取りやめて保持した**印。
   * `kind === 'unchanged'` のエントリーにのみ付く。
   */
  externallyModified?: boolean;
}

export interface SyncPlanTotals {
  counts: Record<SyncEntryKind, number>;
  /** 追加・更新で書き込むバイト数 */
  writeBytes: number;
  /** 削除で失われるバイト数 */
  removeBytes: number;
  /**
   * Backup (OPFS) に必要なバイト数。
   * update = 上書き前の現ファイル、deletion = 削除する現ファイル。
   * §10.3 で Preview に表示し、D-5 の quota 判定に使う。
   */
  backupBytes: number;
}

export interface SyncPlan {
  profileId: string;
  generatedAt: number;
  additions: SyncPlanEntry[];
  updates: SyncPlanEntry[];
  deletions: SyncPlanEntry[];
  unchanged: SyncPlanEntry[];
  unmanaged: SyncPlanEntry[];
  totals: SyncPlanTotals;
}

export interface ComputeSyncPlanInput {
  /** SSOT */
  profile: Profile;
  /** この Profile の台帳 (`getManagedFiles(profile.id)` の結果) */
  managed: readonly ManagedFileRecord[];
  /** ローカル環境のスキャン結果 */
  local: readonly LocalFileEntry[];
  /**
   * 検出したコンテンツディレクトリ (`LinkedSource.contentDirs`)。
   *
   * **artifact を持たない addition の書き込み先を確定するために必要。**
   * これが無いと path がファイル名だけ (`sodium.jar`) になり、Executor が
   * 環境ルート直下に書き込んでしまう (2026-08-29 修正)。
   * 未指定 / 当該カテゴリのディレクトリ未検出の場合は path を空のまま残し、
   * ダウンロード後に確定させる。
   */
  contentDirs?: LinkedSource['contentDirs'];
  /** テスト用の時刻固定 */
  now?: number;
}

/** カテゴリ → `LinkedSource.contentDirs` のキー (`lib/env/resolve.ts` と共有) */
export const CATEGORY_DIR_KEY: Record<
  ContentCategory,
  keyof NonNullable<LinkedSource['contentDirs']>
> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks'
};

/**
 * 検出ディレクトリとファイル名から相対パスを組み立てる。
 * どちらかが欠けていれば空文字 (= ダウンロード後に確定)。
 * `lib/env/resolve.ts` (ダウンロード後のパス確定) と共有する。
 */
export function buildTargetPath(dir: string | undefined, filename: string | undefined): string {
  if (!dir || !filename) return '';
  return `${dir}/${filename}`;
}

const EMPTY_COUNTS: SyncPlanTotals['counts'] = {
  addition: 0,
  update: 0,
  deletion: 0,
  unchanged: 0,
  unmanaged: 0
};

/**
 * Profile / Local / 台帳を突き合わせて SyncPlan を生成する。
 * カテゴリ (mod / resourcepack / shader) ごとに独立して判定する (§10.2)。
 */
export function computeSyncPlan(input: ComputeSyncPlanInput): SyncPlan {
  const { profile, managed, local, contentDirs, now = Date.now() } = input;

  const additions: SyncPlanEntry[] = [];
  const updates: SyncPlanEntry[] = [];
  const deletions: SyncPlanEntry[] = [];
  const unchanged: SyncPlanEntry[] = [];
  const unmanaged: SyncPlanEntry[] = [];

  for (const category of MANAGED_CATEGORIES) {
    const items = itemsOfCategory(profile, category);
    const localInCategory = local.filter((f) => f.category === category);
    const managedInCategory = managed.filter((r) => r.category === category);

    const localByPath = new Map(localInCategory.map((f) => [f.path, f]));
    const managedByPath = new Map(managedInCategory.map((r) => [r.path, r]));
    /** Profile ループで処理済みの local path (ローカルループでの再分類を防ぐ) */
    const handledPaths = new Set<string>();

    // ------------------------------------------------------------------
    // 1) Profile 側を走査 → addition / update / unchanged
    // ------------------------------------------------------------------
    for (const item of items) {
      const entry = classifyProfileItem({
        item,
        category,
        localByPath,
        managedByPath,
        handledPaths,
        contentDir: contentDirs?.[CATEGORY_DIR_KEY[category]]
      });
      if (!entry) continue;
      pushByKind(entry, { additions, updates, unchanged });
    }

    // ------------------------------------------------------------------
    // 2) Local 側を走査 → deletion / unmanaged / (取りやめた deletion)
    // ------------------------------------------------------------------
    for (const file of localInCategory) {
      if (handledPaths.has(file.path)) continue;

      const record = managedByPath.get(file.path);

      // 台帳に無い = 管理外。表示のみで削除対象外 (§10.2 の 5 / §4 禁止事項)
      if (!record) {
        unmanaged.push({
          kind: 'unmanaged',
          category,
          path: file.path,
          name: baseName(file.path),
          size: file.size,
          localSha1: file.sha1
        });
        continue;
      }

      // ここからは削除候補:
      //   - Profile が該当 project を持たない            (3 条件目)
      //   - Profile は持つが別のパスを要求している (移動) → 旧パスは不要
      //
      // §10.2: fingerprint が台帳と一致する (unchanged) 場合のみ削除する。
      const fingerprintUnchanged = file.sha1 === record.sha1;
      if (fingerprintUnchanged) {
        deletions.push({
          kind: 'deletion',
          category,
          path: file.path,
          name: baseName(file.path),
          projectId: record.projectId,
          source: record.source,
          localSha1: file.sha1,
          managedSha1: record.sha1,
          size: file.size
        });
      } else {
        // 外部変更を検知 → 削除しない。保持して UI で警告 (§10.2 / §10.3)
        unchanged.push({
          kind: 'unchanged',
          category,
          path: file.path,
          name: baseName(file.path),
          projectId: record.projectId,
          source: record.source,
          localSha1: file.sha1,
          managedSha1: record.sha1,
          size: file.size,
          externallyModified: true
        });
      }
    }
  }

  const plan: SyncPlan = {
    profileId: profile.id,
    generatedAt: now,
    additions,
    updates,
    deletions,
    unchanged,
    unmanaged,
    totals: {
      counts: { ...EMPTY_COUNTS },
      writeBytes: 0,
      removeBytes: 0,
      backupBytes: 0
    }
  };

  plan.totals.counts.addition = additions.length;
  plan.totals.counts.update = updates.length;
  plan.totals.counts.deletion = deletions.length;
  plan.totals.counts.unchanged = unchanged.length;
  plan.totals.counts.unmanaged = unmanaged.length;

  for (const e of additions) plan.totals.writeBytes += e.size;
  for (const e of updates) {
    plan.totals.writeBytes += e.size;
    // 上書き前に現ファイルを Backup する
    const localEntry = local.find((f) => f.category === e.category && f.path === e.path);
    plan.totals.backupBytes += localEntry?.size ?? 0;
  }
  for (const e of deletions) {
    plan.totals.removeBytes += e.size;
    plan.totals.backupBytes += e.size;
  }

  return plan;
}

// ============================================================================
// 内部ヘルパ
// ============================================================================

interface ClassifyArgs {
  item: ProjectItem;
  category: ContentCategory;
  localByPath: Map<string, LocalFileEntry>;
  managedByPath: Map<string, ManagedFileRecord>;
  handledPaths: Set<string>;
  /** このカテゴリの検出ディレクトリ (未検出なら undefined) */
  contentDir?: string;
}

/**
 * Profile の 1 アイテムを addition / update / unchanged に分類する。
 * 何も生成しない場合は null (通常は起こらない)。
 */
function classifyProfileItem(args: ClassifyArgs): SyncPlanEntry | null {
  const { item, category, localByPath, managedByPath, handledPaths, contentDir } = args;
  const artifact = item.artifact;

  // ---- artifact 無し: DropMod から追加しただけでローカル実体が無い ----
  if (!artifact) {
    // 台帳に同じ project の記録があれば、そのパスに実体があるかを確認する
    // (例: 過去に Import 済みで、その後 Profile 側の artifact 情報が落ちた場合)
    const known = findManagedByProject(managedByPath, item.projectId);
    const local = known ? localByPath.get(known.path) : undefined;

    if (known && local) {
      handledPaths.add(known.path);
      return {
        kind: 'unchanged',
        category,
        path: known.path,
        name: item.name,
        projectId: item.projectId,
        source: known.source,
        localSha1: local.sha1,
        managedSha1: known.sha1,
        size: local.size
      };
    }

    return {
      kind: 'addition',
      category,
      // 検出ディレクトリ + filename で書き込み先を確定する。
      // どちらかが欠ければ空 = ダウンロード後に確定 (Executor が appliedPath に記録)
      path: buildTargetPath(contentDir, item.filename),
      name: item.name,
      projectId: item.projectId,
      source: 'dropmod',
      size: 0,
      needsDownload: true
    };
  }

  // ---- artifact あり: 期待パスにローカル実体があるか ----
  const local = localByPath.get(artifact.path);
  const record = managedByPath.get(artifact.path);
  handledPaths.add(artifact.path);

  if (!local) {
    // Profile は要求しているがローカルに無い → 追加 (要ダウンロード)
    return {
      kind: 'addition',
      category,
      path: artifact.path,
      name: item.name,
      projectId: item.projectId,
      source: record?.source ?? 'import',
      targetSha1: artifact.sha1,
      size: artifact.size,
      needsDownload: true
    };
  }

  if (local.sha1 === artifact.sha1) {
    return {
      kind: 'unchanged',
      category,
      path: artifact.path,
      name: item.name,
      projectId: item.projectId,
      source: record?.source ?? 'import',
      localSha1: local.sha1,
      managedSha1: record?.sha1,
      size: local.size
    };
  }

  // 同一 project だが中身が違う → 更新 (§10.2 の 2)
  return {
    kind: 'update',
    category,
    path: artifact.path,
    name: item.name,
    projectId: item.projectId,
    source: record?.source ?? 'import',
    targetSha1: artifact.sha1,
    localSha1: local.sha1,
    managedSha1: record?.sha1,
    size: artifact.size
  };
}

function findManagedByProject(
  managedByPath: Map<string, ManagedFileRecord>,
  projectId: string
): ManagedFileRecord | undefined {
  for (const record of managedByPath.values()) {
    if (record.projectId === projectId) return record;
  }
  return undefined;
}

function pushByKind(
  entry: SyncPlanEntry,
  buckets: Pick<SyncPlan, 'additions' | 'updates' | 'unchanged'>
): void {
  if (entry.kind === 'addition') buckets.additions.push(entry);
  else if (entry.kind === 'update') buckets.updates.push(entry);
  else buckets.unchanged.push(entry);
}

/** パスからファイル名を取り出す (区切りは '/' 固定。環境ルート相対パスのため) */
function baseName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

// ============================================================================
// UI 用セレクタ
// ============================================================================

/**
 * 外部変更を検知したエントリー (§10.3 の独立警告セクション用)。
 * §10.2 の規定どおり実体は `unchanged` に含まれるため、ここで抽出する。
 */
export function selectExternallyModified(plan: SyncPlan): SyncPlanEntry[] {
  return plan.unchanged.filter((e) => e.externallyModified === true);
}

/**
 * 削除予定のうち **Import 由来**のもの (§10.3: ユーザー選択を要求する対象)。
 * `'dropmod'` 由来はユーザー自身が DropMod で追加したものなので追加確認は不要。
 */
export function selectDeletionsRequiringConfirm(plan: SyncPlan): SyncPlanEntry[] {
  return plan.deletions.filter((e) => e.source !== 'dropmod');
}
