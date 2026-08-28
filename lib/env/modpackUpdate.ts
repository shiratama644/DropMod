/**
 * Modpack の更新検知 (Phase 12-C / PHASE12_PLAN.md §10.6)。
 *
 * §10.6: 「更新検知: 現状より新しい version が Modrinth に存在するか (Analysis に追加)」
 *
 * 2 段階で見る:
 * 1. **Modpack 自体** — `Profile.modpackSource` の project に新しい version があるか
 * 2. **収録 Mod ごと** — Profile の各 `ProjectItem` に新しい version があるか
 *
 * ## 更新検知は「通知」であって「自動適用」ではない
 *
 * §2 の方針 (安全性) に従い、ここは**差分を数えて報告するだけ**。
 * 実際の書き込みは必ず Sync Preview を通す (§4 禁止事項)。
 *
 * ## API 失敗の扱い
 *
 * Modrinth はレート制限がある。1 件でも失敗したら全体の検知を失敗にせず、
 * その 1 件を `unresolved` として記録する (**部分的な結果でも出す**)。
 */

import type { Profile, ProjectItem } from '@/types';
import { getProvider, type ContentProvider, type ProviderUpdateInfo } from '@/lib/providers';
import type { AnalysisIssue } from './analysis';

export interface ModpackUpdateEntry {
  projectId: string;
  name: string;
  category: 'modpack' | 'mod' | 'resourcepack' | 'shader';
  currentVersionNumber?: string;
  latestVersionNumber?: string;
  hasUpdate: boolean;
  /** API で確認できなかった理由 (レート制限 / 404 など) */
  unresolved?: string;
}

export interface ModpackUpdateReport {
  entries: ModpackUpdateEntry[];
  /** 更新がある件数 */
  updatableCount: number;
  /** 正常に確認できた件数 */
  checkedCount: number;
  /** 確認できなかった件数 */
  unresolvedCount: number;
  /**
   * **Modpack 本体を確認できなかった理由**。
   *
   * `.mrpack` の `modrinth.index.json` には `name` と `versionId` (パック独自の
   * バージョン文字列) は入っているが、**Modrinth の project id は入っていない**。
   * そのため Import 直後の Profile では本体の更新を確認しようがない。
   *
   * 黙って「更新なし」にするとユーザーは「確認した结果 最新だった」と誤解するので、
   * **確認していない事実を理由付きで返す**。
   */
  modpackUncheckedReason?: string;
}

export interface CheckModpackUpdatesInput {
  profile: Profile;
  /** 既定は Modrinth (`getProvider()`) */
  provider?: ContentProvider | null;
  /** 収録 Mod の検査上限 (レート制限対策。既定 20) */
  limit?: number;
  /** 収録 Mod ごとに検査するか。false なら Modpack 本体だけ */
  includeMods?: boolean;
}

const DEFAULT_MOD_LIMIT = 20;

function categoryOf(item: ProjectItem): 'mod' | 'resourcepack' | 'shader' {
  return item.type === 'resourcepack' || item.type === 'shader' ? item.type : 'mod';
}

/**
 * `ProjectItem` から現在指している version id を取り出す。
 * 未設定 = 「最新安定版」を選んだ状態なので、更新検知では**更新なし**になる。
 */
function currentVersionIdOf(item: ProjectItem): string | undefined {
  return item.versionId;
}

/** `generateId('mrpack')` が生成する DropMod 内部 id の prefix */
const INTERNAL_ID_PREFIX = 'mrpack-';

function entryFromInfo(
  info: ProviderUpdateInfo,
  base: { projectId: string; name: string; category: ModpackUpdateEntry['category'] }
): ModpackUpdateEntry {
  return {
    ...base,
    ...(info.current?.versionNumber ? { currentVersionNumber: info.current.versionNumber } : {}),
    ...(info.latest?.versionNumber ? { latestVersionNumber: info.latest.versionNumber } : {}),
    hasUpdate: info.hasUpdate
  };
}

/**
 * Modpack と収録 Mod の更新を検知する。
 *
 * `modpackSource` が無い Profile でも収録 Mod の更新は検知できる
 * (手動 Profile でも「新しい版があります」は有用な情報)。
 */
export async function checkModpackUpdates(
  input: CheckModpackUpdatesInput
): Promise<ModpackUpdateReport> {
  const { profile, limit = DEFAULT_MOD_LIMIT, includeMods = true } = input;
  const provider = input.provider ?? getProvider();

  if (!provider) {
    return { entries: [], updatableCount: 0, checkedCount: 0, unresolvedCount: 0 };
  }

  const context = {
    ...(profile.environment.loader ? { loader: profile.environment.loader } : {}),
    ...(profile.environment.mcVersion ? { mcVersion: profile.environment.mcVersion } : {})
  };

  const entries: ModpackUpdateEntry[] = [];

  // ---- 1. Modpack 本体 ----
  const modpack = profile.modpackSource;
  let modpackUncheckedReason: string | undefined;
  if (modpack && !modpack.projectId) {
    // `.mrpack` には project id が入っていないので確認できない
    modpackUncheckedReason =
      'Modpack 本体は確認していません (.mrpack に Modrinth のプロジェクト ID が含まれていないため)';
  }
  if (modpack?.projectId) {
    try {
      const info = await provider.checkForUpdate(modpack.projectId, modpack.versionId, context);
      entries.push(
        entryFromInfo(info, {
          projectId: modpack.projectId,
          name: modpack.name,
          category: 'modpack'
        })
      );
    } catch (e) {
      entries.push({
        projectId: modpack.projectId,
        name: modpack.name,
        category: 'modpack',
        hasUpdate: false,
        unresolved: e instanceof Error ? e.message : String(e)
      });
    }
  }

  // ---- 2. 収録 Mod (レート制限対策で上限あり) ----
  if (includeMods) {
    const items: Array<{ item: ProjectItem; category: ModpackUpdateEntry['category'] }> = [
      ...profile.mods,
      ...(profile.resourcepacks ?? []),
      ...(profile.shaderpacks ?? [])
    ]
      .map((item) => ({ item, category: categoryOf(item) }))
      // CurseForge 由来は Phase 13 まで未対応なので問い合わせない
      .filter(({ item }) => item.provider !== 'curseforge');

    // 問い合わせる意味の無い projectId を**先に**除く。
    //
    // - 空: Import 由来で Modrinth project に紐付かなかったもの
    // - `mrpack-…`: `generateId('mrpack')` が作った **DropMod 内部の id**。
    //   Modrinth に存在しないので問い合わせると必ず 404 になる
    //
    // **`slice(0, limit)` より前で除く**こと。後にすると無効な項目が
    // limit の枠を食い、確認できるはずの Mod が確認されない。
    const queryable = items.filter(
      ({ item }) => item.projectId && !item.projectId.startsWith(INTERNAL_ID_PREFIX)
    );

    for (const { item, category } of queryable.slice(0, limit)) {

      const base = { projectId: item.projectId, name: item.name, category };
      try {
        const info = await provider.checkForUpdate(
          item.projectId,
          currentVersionIdOf(item),
          // Resource Pack / Shader は loader 非依存
          category === 'mod' ? context : { mcVersion: context.mcVersion }
        );
        entries.push(entryFromInfo(info, base));
      } catch (e) {
        entries.push({
          ...base,
          hasUpdate: false,
          unresolved: e instanceof Error ? e.message : String(e)
        });
      }
    }
  }

  return {
    entries,
    updatableCount: entries.filter((e) => e.hasUpdate).length,
    checkedCount: entries.filter((e) => !e.unresolved).length,
    unresolvedCount: entries.filter((e) => e.unresolved).length,
    ...(modpackUncheckedReason ? { modpackUncheckedReason } : {})
  };
}

/**
 * 検知結果を Analysis View の 1 項目に変換する (**pure function**)。
 *
 * 更新があること自体は**エラーではない**ので `warning`。
 * 1 件も確認できなかった場合だけ `error` にしない — Modpack 未紐付けの
 * Profile では「対象なし」が正常なので `ok`。
 */
export function updateIssueFromReport(report: ModpackUpdateReport): AnalysisIssue {
  if (report.entries.length === 0) {
    return {
      id: 'modpack-update',
      status: 'ok',
      message: '更新の対象がありません',
      details: []
    };
  }

  if (report.updatableCount === 0) {
    return {
      id: 'modpack-update',
      status: 'ok',
      message:
        report.unresolvedCount > 0
          ? `すべて最新です (${report.checkedCount} 件確認 / ${report.unresolvedCount} 件は確認できず)`
          : `すべて最新です (${report.checkedCount} 件確認)`,
      details: []
    };
  }

  const details = report.entries
    .filter((e) => e.hasUpdate)
    .map((e) => `${e.name}: ${e.currentVersionNumber ?? '?'} → ${e.latestVersionNumber ?? '?'}`);

  return {
    id: 'modpack-update',
    status: 'warning',
    message: `${report.updatableCount} 件の更新があります`,
    details
  };
}
