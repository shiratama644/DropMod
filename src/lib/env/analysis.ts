/**
 * Import Analysis の検証エンジン (PHASE11_PLAN.md §10.4)。
 *
 * Import 完了時に表示する検査結果 (Analysis View 用) を pure function で
 * 生成する。Phase 11 は Read-only: 何も書き換えない。
 *
 * 検査項目 (計画書 §5 の表):
 *   - MC 互換性: 検出 MC バージョンに各 Mod の version が対応しているか
 *   - Loader 互換性: 検出 Loader と一致しているか (mods のみ。RP/Shader は
 *     loader 非依存のため除外)
 *   - 依存関係: version.dependencies の required が不足していないか
 *   - 競合検出: incompatible な依存が同時導入されていないか
 *   - 未識別 (Unknown Files): ハッシュ照合できなかったファイルの有無
 *   - Shader 前提: shaderpacks があるのに Iris / OptiFine が無い
 *
 * 依存チェックの完全版 (API による再解決含む) は既存
 * `hooks/useDependencyCheck.ts` を Profile 保存後に実行する方針 (§5)。
 */

import type { ImportAnalysis } from '@/features/env-import';

export type AnalysisIssueId =
  | 'mc-compatibility'
  | 'loader-compatibility'
  | 'missing-dependency'
  | 'conflict'
  | 'unknown-files'
  | 'shader-prerequisite'
  /** Phase 12-C (§10.6): Modpack / 収録 Mod の更新検知 */
  | 'modpack-update';

export interface AnalysisIssue {
  id: AnalysisIssueId;
  status: 'ok' | 'warning' | 'error';
  /** 一行サマリー (UI でそのまま表示) */
  message: string;
  /** 詳細 (対象 Mod 名等) */
  details: string[];
}

function ok(id: AnalysisIssueId, message: string): AnalysisIssue {
  return { id, status: 'ok', message, details: [] };
}

function issue(
  id: AnalysisIssueId,
  status: 'warning' | 'error',
  message: string,
  details: string[]
): AnalysisIssue {
  return { id, status, message, details };
}

/** Iris / OptiFine 相当の shader 前提 Mod か (slug / name の緩い一致) */
function isShaderEnabler(name: string | undefined, slug: string | undefined): boolean {
  const haystack = `${name ?? ''} ${slug ?? ''}`.toLowerCase();
  return haystack.includes('iris') || haystack.includes('optifine');
}

/**
 * ImportAnalysis を検証して AnalysisIssue[] を返す。
 * 項目ごとに 1 issue (ok の場合も含む。UI は全項目を ✓/⚠/✗ で表示)。
 */
export function analyzeImportHealth(analysis: ImportAnalysis): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const env = analysis.environment;

  // ---- MC 互換性 ----
  const mcMismatches: string[] = [];
  if (!env.mcVersion) {
    issues.push(
      ok('mc-compatibility', 'MC バージョンが未検出のため検証をスキップしました')
    );
  } else {
    for (const mod of analysis.mods) {
      const version = analysis.versionsByProject.get(mod.projectId);
      const gameVersions = version?.game_versions ?? [];
      if (gameVersions.length > 0 && !gameVersions.includes(env.mcVersion)) {
        mcMismatches.push(mod.name);
      }
    }
    issues.push(
      mcMismatches.length === 0
        ? ok('mc-compatibility', `Minecraft ${env.mcVersion} との互換性: 問題なし`)
        : issue(
            'mc-compatibility',
            'warning',
            `${mcMismatches.length} 個の Mod が MC ${env.mcVersion} 非対応の可能性`,
            mcMismatches
          )
    );
  }

  // ---- Loader 互換性 (mods のみ) ----
  if (!env.loader) {
    issues.push(ok('loader-compatibility', 'Loader が未検出のため検証をスキップしました'));
  } else {
    const loaderKey = env.loader.toLowerCase();
    const loaderMismatches: string[] = [];
    for (const mod of analysis.mods) {
      const version = analysis.versionsByProject.get(mod.projectId);
      const loaders = version?.loaders ?? [];
      if (loaders.length > 0 && !loaders.includes(loaderKey)) {
        loaderMismatches.push(mod.name);
      }
    }
    issues.push(
      loaderMismatches.length === 0
        ? ok('loader-compatibility', `Loader (${env.loader}) との互換性: 問題なし`)
        : issue(
            'loader-compatibility',
            'error',
            `${loaderMismatches.length} 個の Mod が ${env.loader} 非対応`,
            loaderMismatches
          )
    );
  }

  // ---- 依存関係 (required 不足) と競合 (incompatible 併存) ----
  const installedProjectIds = new Set([
    ...analysis.mods.map((m) => m.projectId),
    ...analysis.resourcepacks.map((m) => m.projectId),
    ...analysis.shaderpacks.map((m) => m.projectId)
  ]);
  const installedSlugs = new Set(
    [...analysis.mods, ...analysis.resourcepacks, ...analysis.shaderpacks]
      .map((m) => m.slug)
      .filter((slug): slug is string => typeof slug === 'string')
  );
  const has = (projectId: string): boolean =>
    installedProjectIds.has(projectId) || installedSlugs.has(projectId);

  const missing: string[] = [];
  const conflicts: string[] = [];
  for (const mod of analysis.mods) {
    const version = analysis.versionsByProject.get(mod.projectId);
    for (const dep of version?.dependencies ?? []) {
      if (!dep.project_id) continue;
      if (dep.dependency_type === 'required' && !has(dep.project_id)) {
        missing.push(`${mod.name} → ${dep.project_id}`);
      }
      if (dep.dependency_type === 'incompatible' && has(dep.project_id)) {
        conflicts.push(`${mod.name} × ${dep.project_id}`);
      }
    }
  }
  issues.push(
    missing.length === 0
      ? ok('missing-dependency', '必須依存関係: 不足なし')
      : issue(
          'missing-dependency',
          'error',
          `${missing.length} 個の必須依存 Mod が不足`,
          missing
        )
  );
  issues.push(
    conflicts.length === 0
      ? ok('conflict', '競合する Mod の組: なし')
      : issue('conflict', 'error', `${conflicts.length} 組の競合が検出されました`, conflicts)
  );

  // ---- Unknown Files ----
  issues.push(
    analysis.unknownFiles.length === 0
      ? ok('unknown-files', '未識別ファイル: なし')
      : issue(
          'unknown-files',
          'warning',
          `${analysis.unknownFiles.length} 個のファイルを Modrinth と照合できませんでした`,
          analysis.unknownFiles.map((f) => f.path)
        )
  );

  // ---- Shader 前提 (Iris / OptiFine) ----
  const hasShaderEnabler =
    analysis.mods.some((m) => isShaderEnabler(m.name, m.slug)) ||
    analysis.unknownFiles.some((f) => isShaderEnabler(stripExtensionSafe(f.filename), undefined));
  if (analysis.shaderpacks.length > 0 && !hasShaderEnabler) {
    issues.push(
      issue(
        'shader-prerequisite',
        'warning',
        'シェーダーパックがありますが Iris / OptiFine が見つかりません',
        ['シェーダーの適用には Iris または OptiFine の導入が必要です']
      )
    );
  } else if (analysis.shaderpacks.length > 0) {
    issues.push(ok('shader-prerequisite', 'シェーダー前提 Mod (Iris / OptiFine): 導入済み'));
  } else {
    issues.push(ok('shader-prerequisite', 'シェーダーパック: なし'));
  }

  return issues;
}

function stripExtensionSafe(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}
