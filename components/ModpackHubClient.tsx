'use client';

/**
 * Modpack 管理ハブ (Phase 12-C / PHASE12_PLAN.md §10.6)。
 *
 * ## Modpack はカテゴリではなく「Profile の Source」
 *
 * Modpack を導入すると中身は `mods/` `resourcepacks/` `shaderpacks/` に分散する。
 * したがってこのページは「Modpack 一覧」ではなく、**この Profile がどの Modpack
 * から作られたか**と、その更新状況を表示する場所。
 *
 * ## 3 つのアクション
 *
 * | アクション | 挙動 |
 * | --- | --- |
 * | 更新を確認 | `checkModpackUpdates()` で Modrinth と突き合わせ、差分を**報告**する |
 * | 紐付けを解除 | **D-6**: `source:'modpack'` → `'import'` に昇格。ファイルは残る |
 * | (導入) | 設定ページの ZIP インポートから `.mrpack` を読み込む |
 *
 * **「更新する」ボタンはここに無い**。§4 の方針どおり、書き込みは必ず
 * Sync Preview を通すので、更新の適用は「更新を確認」→ Sync の順で行う。
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { getManagedFiles, syncManagedFiles } from '@/lib/db/dexie';
import { promoteModpackRecords } from '@/lib/env/mrpack';
import {
  checkModpackUpdates,
  updateIssueFromReport,
  type ModpackUpdateReport
} from '@/lib/env/modpackUpdate';
import { useConfirmStore } from '@/lib/store/confirm';
import { useProfilesStore } from '@/lib/store/profiles';
import { useToastStore } from '@/lib/store/toast';

/** `importedAt` をローカル時刻の文字列にする */
function formatImportedAt(ms: number): string {
  return new Date(ms).toLocaleString('ja-JP', { hour12: false });
}

const PROVIDER_LABEL: Record<string, string> = {
  modrinth: 'Modrinth',
  curseforge: 'CurseForge'
};

export const ModpackHubClient: React.FC = () => {
  const profiles = useProfilesStore((s) => s.profiles);
  const currentProfileId = useProfilesStore((s) => s.currentProfileId);
  const setProfiles = useProfilesStore((s) => s.setProfiles);
  const confirm = useConfirmStore((s) => s.confirm);
  const showToast = useToastStore((s) => s.showToast);

  const currentProfile = profiles.find((p) => p.id === currentProfileId);
  const modpackSource = currentProfile?.modpackSource;

  const [checking, setChecking] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [report, setReport] = useState<ModpackUpdateReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = useCallback(async () => {
    if (!currentProfile) return;
    setChecking(true);
    setError(null);
    try {
      const result = await checkModpackUpdates({ profile: currentProfile });
      setReport(result);
      if (result.updatableCount > 0) {
        showToast(`${result.updatableCount} 件の更新があります`, 'info');
      } else if (result.checkedCount === 0) {
        showToast('更新の確認対象がありませんでした', 'info');
      } else {
        showToast('すべて最新です', 'success');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '更新の確認に失敗しました';
      setError(message);
      showToast(message, 'error');
    } finally {
      setChecking(false);
    }
  }, [currentProfile, showToast]);

  /** **D-6**: `modpack` → `import` に昇格する。ファイルは消さない */
  const handleUnbind = useCallback(async () => {
    if (!currentProfile) return;

    const records = await getManagedFiles(currentProfile.id);
    const modpackRecords = records.filter((r) => r.source === 'modpack');
    if (modpackRecords.length === 0) {
      showToast('この Profile に Modpack 由来のファイルはありません', 'info');
      return;
    }

    const ok = await confirm({
      title: 'Modpack の紐付けを解除しますか？',
      message:
        `Modpack「${modpackSource?.name ?? '不明'}」との紐付けを解除します。\n` +
        `${modpackRecords.length} 個のファイルは「インポート済み」として Profile に残ります。\n` +
        'ファイルは削除されません。削除は各 Mod の画面から個別に行ってください。',
      confirmLabel: '解除する'
    });
    if (!ok) return;

    setUnbinding(true);
    try {
      const promoted = promoteModpackRecords(records);
      await syncManagedFiles(currentProfile.id, promoted);

      // Profile からも由来情報を外す
      const profileId = currentProfile.id;
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== profileId) return p;
          const next = { ...p };
          delete next.modpackSource;
          return next;
        })
      );

      setReport(null);
      showToast(`${modpackRecords.length} 個のファイルを「インポート済み」に変更しました`, 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : '紐付けの解除に失敗しました';
      setError(message);
      showToast(message, 'error');
    } finally {
      setUnbinding(false);
    }
  }, [confirm, currentProfile, modpackSource?.name, setProfiles, showToast]);

  // ==========================================================================
  // Profile 未選択
  // ==========================================================================

  if (!currentProfile) {
    return (
      <section className="theme-card rounded-xl p-6 text-center">
        <i className="fa-solid fa-boxes-stacked theme-text-tertiary text-3xl mb-3" />
        <h2 className="theme-text-primary font-semibold mb-2">プロファイル未選択</h2>
        <p className="theme-text-secondary text-sm">
          Modpack の情報はプロファイルごとに管理されます。プロファイルを選択してください。
        </p>
      </section>
    );
  }

  // ==========================================================================
  // Modpack 未導入
  // ==========================================================================

  if (!modpackSource) {
    return (
      <section className="theme-card rounded-xl p-6 text-center">
        <i className="fa-solid fa-boxes-stacked theme-text-tertiary text-3xl mb-3" />
        <h2 className="theme-text-primary font-semibold mb-2">
          このプロファイルは Modpack 由来ではありません
        </h2>
        <p className="theme-text-secondary text-sm mb-4">
          Modrinth の <code className="theme-text-primary">.mrpack</code>{' '}
          をインポートすると、ここに導入元と更新情報が表示されます。
        </p>
        <div className="theme-surface rounded-lg p-3 text-left text-xs theme-text-secondary space-y-1.5">
          <p className="theme-text-primary font-semibold text-sm">導入方法</p>
          <p>
            <i className="fa-solid fa-arrow-right mr-1.5 theme-text-tertiary" />
            設定ページの「ZIP インポート」から <code>.mrpack</code> を選びます
          </p>
          <p>
            <i className="fa-solid fa-triangle-exclamation mr-1.5 theme-text-amber" />
            CurseForge 形式の <code>.zip</code> は未対応です (Phase 13 予定)
          </p>
        </div>
      </section>
    );
  }

  // ==========================================================================
  // Modpack 導入済み
  // ==========================================================================

  return (
    <div className="space-y-4">
      {/* 導入元 */}
      <section className="theme-card rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <i className="fa-solid fa-boxes-stacked theme-text-primary text-xl mt-1" />
            <div className="min-w-0">
              <h2 className="theme-text-primary font-semibold text-lg leading-tight">
                {modpackSource.name}
              </h2>
              <p className="theme-text-secondary text-sm mt-1">
                {PROVIDER_LABEL[modpackSource.provider] ?? modpackSource.provider}
                {modpackSource.versionNumber ? ` / ${modpackSource.versionNumber}` : ''}
                {' / '}導入 {formatImportedAt(modpackSource.importedAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking}
              className="theme-button-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <i
                className={`fa-solid ${checking ? 'fa-spinner fa-spin' : 'fa-rotate'} mr-1.5`}
              />
              {checking ? '確認中...' : '更新を確認'}
            </button>
            <button
              type="button"
              onClick={handleUnbind}
              disabled={unbinding}
              className="theme-button-ghost rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <i
                className={`fa-solid ${unbinding ? 'fa-spinner fa-spin' : 'fa-link-slash'} mr-1.5`}
              />
              紐付けを解除
            </button>
          </div>
        </div>

        {error ? (
          <p className="theme-text-red text-sm mt-3">
            <i className="fa-solid fa-circle-exclamation mr-1.5" />
            {error}
          </p>
        ) : null}
      </section>

      {/* 更新結果 */}
      {report ? <UpdateReport report={report} /> : null}
    </div>
  );
};

/** 更新チェックの結果表示 */
const UpdateReport: React.FC<{ report: ModpackUpdateReport }> = ({ report }) => {
  const { updatable, current, unresolved } = splitEntries(report);
  /**
   * §10.6「更新検知: ... (**Analysis に追加**)」。
   * Analysis の 1 件として概要を出し、明細はその下に並べる。
   * **更新があることはエラーではない**ので status は warning (ok / warning のみ)。
   */
  const issue = updateIssueFromReport(report);

  return (
    <section className="theme-card rounded-xl p-5" data-testid="modpack-update-report">
      <h3 className="theme-text-primary font-semibold mb-3">
        <i className="fa-solid fa-list-check mr-2 theme-text-tertiary" />
        更新の確認結果
        <span className="theme-text-secondary font-normal text-sm ml-2">
          {report.checkedCount} 件を確認 / {report.updatableCount} 件の更新
        </span>
      </h3>

      <p
        className={`text-sm mb-3 ${
          issue.status === 'ok' ? 'theme-text-emerald' : 'theme-text-amber'
        }`}
        data-testid="modpack-update-summary"
      >
        <i
          className={`fa-solid ${
            issue.status === 'ok' ? 'fa-circle-check' : 'fa-triangle-exclamation'
          } mr-1.5`}
        />
        {issue.message}
      </p>

      {report.updatableCount === 0 ? (
        <p className="theme-text-secondary text-sm">
          <i className="fa-solid fa-circle-check mr-1.5 theme-text-emerald" />
          更新可能な項目はありません。
        </p>
      ) : (
        <ul className="space-y-2">
          {updatable.map((entry) => (
            <li
              key={`${entry.category}:${entry.projectId}`}
              className="theme-surface rounded-lg px-3 py-2 flex flex-wrap items-baseline justify-between gap-2"
            >
              <span className="theme-text-primary text-sm font-medium min-w-0">
                {entry.name}
              </span>
              <span className="theme-text-secondary text-xs">
                {entry.currentVersionNumber ?? '不明'}
                <i className="fa-solid fa-arrow-right mx-1.5 theme-text-tertiary" />
                <span className="theme-text-emerald font-medium">
                  {entry.latestVersionNumber ?? '不明'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {unresolved.length > 0 ? (
        <p className="theme-text-amber text-xs mt-3">
          <i className="fa-solid fa-triangle-exclamation mr-1.5" />
          {unresolved.length} 件は情報を取得できませんでした
          {unresolved.slice(0, 3).map((e) => e.name).join('、')}
          {unresolved.length > 3 ? ' ほか' : ''}
        </p>
      ) : null}

      {/* 最新だった項目の件数だけ出す (全件並べると長い) */}
      {current.length > 0 ? (
        <p className="theme-text-tertiary text-xs mt-3">
          そのほか {current.length} 件は最新です。
        </p>
      ) : null}

      {report.updatableCount > 0 ? (
        <p className="theme-text-secondary text-xs mt-3 theme-surface rounded-lg p-3">
          <i className="fa-solid fa-circle-info mr-1.5 theme-text-primary" />
          更新の適用は
          <span className="theme-text-primary font-medium"> 環境との同期 (Sync) </span>
          から行ってください。変更内容は適用前に一覧で確認できます。
        </p>
      ) : null}
    </section>
  );
};

/** レポートを「更新あり / 最新 / 未取得」に分ける */
function splitEntries(report: ModpackUpdateReport) {
  const updatable = report.entries.filter((e) => e.hasUpdate);
  const unresolved = report.entries.filter((e) => e.unresolved);
  const current = report.entries.filter((e) => !e.hasUpdate && !e.unresolved);
  return { updatable, current, unresolved };
}
