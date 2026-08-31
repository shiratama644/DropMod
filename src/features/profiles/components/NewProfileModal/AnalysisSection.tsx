'use client';

import { rootTypeLabel } from '@/features/env-import';
import type { PendingImportData } from '@/features/zip';
import type { AnalysisIssue } from '@/lib/env/analysis';
import type { UnknownFile } from '@/types';

/**
 * ZIP 環境取り込み (pendingImportData) の表示件数。
 * フォルダ解析の scannedCounts (照合成功 + 未識別の合計) と同じ意味にするため、
 * 未識別ファイルは location からカテゴリ別に加算する。
 */
export function countImportedContents(data: PendingImportData | null | undefined): {
  mods: number;
  resourcepacks: number;
  shaderpacks: number;
} {
  const unknown = data?.unknownFiles ?? [];
  return {
    mods: (data?.mods.length ?? 0) + unknown.filter((f) => f.location === 'mods').length,
    resourcepacks:
      (data?.resourcepacks?.length ?? 0) +
      unknown.filter((f) => f.location === 'resourcepacks').length,
    shaderpacks:
      (data?.shaderpacks?.length ?? 0) +
      unknown.filter((f) => f.location === 'shaderpacks').length
  };
}

// ---------------------------------------------------------------------------
// Phase 11: 解析結果の表示 (Analysis View、計画書 §6.1 / §6.2 相当)
// フォルダ解析 (folderAnalysis) と ZIP 環境取り込み (initialImportData) の
// 両経路で使う。Phase 11 は Read-only。
// ---------------------------------------------------------------------------
export function AnalysisSection({
  issues,
  counts,
  environment,
  unknownFiles
}: {
  issues: AnalysisIssue[];
  counts: { mods: number; resourcepacks: number; shaderpacks: number };
  environment: {
    mcVersion?: string;
    loader?: string;
    loaderVersion?: string;
    rootType?: string;
  };
  unknownFiles: UnknownFile[];
}) {
  const envText =
    [
      environment.mcVersion ? `Minecraft ${environment.mcVersion}` : undefined,
      environment.loader,
      environment.loaderVersion
    ]
      .filter(Boolean)
      .join(' / ') || '未検出 (下で手動設定してください)';

  return (
    <div
      className="rounded-xl theme-sub-box border border-slate-500/20 p-3 space-y-2"
      role="status"
      aria-label="解析結果"
    >
      <div className="text-xs font-bold theme-text-secondary flex items-center gap-1.5">
        <i className="fa-solid fa-clipboard-check theme-text-brand" aria-hidden />
        解析結果 (Read-only)
      </div>
      <div className="text-[11px] theme-text-muted space-y-0.5">
        <div>
          <span className="font-semibold">環境: </span>
          {envText}
        </div>
        {environment.rootType && (
          <div>
            <span className="font-semibold">構造: </span>
            {rootTypeLabel(environment.rootType)}
          </div>
        )}
        <div>
          <span className="font-semibold">内容: </span>
          {counts.mods} 個のMod / {counts.resourcepacks} 個のリソースパック /{' '}
          {counts.shaderpacks} 個のシェーダー
          {unknownFiles.length > 0 && ` / 未識別 ${unknownFiles.length} 個`}
        </div>
      </div>
      <ul className="space-y-1">
        {issues.map((issue) => (
          <li key={issue.id} className="text-[11px] flex gap-1.5 items-start">
            <span
              aria-hidden
              className={
                issue.status === 'ok'
                  ? 'text-emerald-500 shrink-0'
                  : issue.status === 'warning'
                    ? 'text-amber-500 shrink-0'
                    : 'text-red-500 shrink-0'
              }
            >
              {issue.status === 'ok' ? '✓' : issue.status === 'warning' ? '⚠' : '✗'}
            </span>
            <span className="min-w-0">
              <span className="theme-text-secondary">{issue.message}</span>
              {issue.details.length > 0 && (
                <details className="theme-text-muted mt-0.5">
                  <summary className="cursor-pointer list-none underline decoration-dotted">
                    詳細 ({issue.details.length})
                  </summary>
                  <ul className="list-disc pl-4 mt-0.5 space-y-0.5 break-all">
                    {issue.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </details>
              )}
            </span>
          </li>
        ))}
      </ul>
      {unknownFiles.length > 0 && (
        <details className="text-[11px] theme-text-muted">
          <summary className="cursor-pointer list-none underline decoration-dotted">
            未識別ファイル一覧 ({unknownFiles.length})
          </summary>
          <ul className="list-disc pl-4 mt-0.5 space-y-0.5 break-all">
            {unknownFiles.map((file) => (
              <li key={file.id}>{file.path}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[10px] theme-text-muted leading-relaxed">
        ⓘ Phase 11 は読み取り専用です。ローカル環境への書き込み (同期) は Phase 12
        で実装予定です。
      </p>
    </div>
  );
}
