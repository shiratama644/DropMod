'use client';

/**
 * 設定ページ「環境との同期」セクション (Phase 12-B / **D-9**)。
 *
 * フォルダの紐付け・解除と、**D-1 環境一致チェック**の結果を表示する。
 * Sync 実行ボタンと Sync History / Undo は同じセクションに追加していく。
 *
 * ## D-1 (環境不一致はブロック)
 *
 * `Profile.environment` とフォルダから検出した環境が食い違う場合、
 * Sync は実行できない。ここでは**なぜ実行できないのか**を理由付きで出す。
 * 検出できなかった項目は「検証不能」として警告に含めない
 * (Generic フォルダ等で Sync が使えなくなるのを避ける)。
 */

import type React from 'react';
import { useMemo, useState } from 'react';
import { SyncButton } from './SyncButton';
import { useAppAction } from '@/components/layout/appActions';
import type { ReadySyncOutcome } from '../services/syncPrep';
import {
  checkEnvironmentMatch,
  ENVIRONMENT_FIELD_LABEL
} from '../utils/environmentCheck';
import { useEnvironmentLink } from '../hooks/useEnvironmentLink';
import { useZipSync } from '../hooks/useZipSync';
import { useProfilesStore } from '@/features/profiles';
import { useConfirmStore } from '@/components/feedback/confirmStore';

/** `linkedAt` をローカル時刻の文字列にする */
function formatLinkedAt(ms: number): string {
  return new Date(ms).toLocaleString('ja-JP', { hour12: false });
}

export const EnvironmentSyncSection: React.FC = () => {
  const currentProfile = useProfilesStore((s) =>
    s.profiles.find((p) => p.id === s.currentProfileId)
  );
  const confirm = useConfirmStore((s) => s.confirm);
  const { supported, linking, unlinking, error, link, unlink } = useEnvironmentLink();
  /** **§10.1**: 非対応ブラウザ向けの ZipSink 経由 Sync */
  const zipSync = useZipSync();
  const { exportSyncAsZip } = zipSync;
  const handleDownloadZip = useAppAction('handleDownloadZip');
  /** **D-10**: 直近の prepare で「解析はできたが書き込み権限が無い」結果 */
  const [readOnly, setReadOnly] = useState<ReadySyncOutcome | null>(null);

  const linkedSource = currentProfile?.linkedSource;

  // D-1: Profile の環境と、フォルダから検出した環境を突き合わせる
  const check = useMemo(() => {
    if (!currentProfile || !linkedSource) return null;
    return checkEnvironmentMatch(currentProfile.environment, linkedSource.environment);
  }, [currentProfile, linkedSource]);

  const handleUnlink = async () => {
    if (!linkedSource) return;
    const ok = await confirm({
      title: 'フォルダの紐付けを解除しますか？',
      message:
        `フォルダ「${linkedSource.rootName}」との紐付けを解除します。\n` +
        'プロファイルに登録されているModの情報は削除されません。\n' +
        'フォルダ内のファイルにも一切触れません。',
      confirmLabel: '解除する',
      cancelLabel: 'キャンセル',
      danger: true
    });
    if (ok) await unlink();
  };

  return (
    <section className="space-y-3" aria-labelledby="env-sync-heading">
      <div className="flex items-center justify-between">
        <h3 id="env-sync-heading" className="text-sm sm:text-base font-bold">
          環境との同期
        </h3>
        {linkedSource && (
          <span className="text-[10px] theme-text-muted font-mono">
            紐付け中: {linkedSource.rootName}
          </span>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-4 sm:p-5 space-y-3">
        {/* ---------------------------------------------------------- */}
        {/* 非対応ブラウザ (Firefox / Safari)                            */}
        {/* ---------------------------------------------------------- */}
        {!supported ? (
          <>
            <p className="text-xs theme-text-muted leading-relaxed">
              <i className="fa-solid fa-circle-info theme-text-brand mr-1.5" aria-hidden />
              このブラウザはフォルダへの直接書き込み (File System Access API) に
              対応していません。Chrome / Edge では、選択したフォルダへ直接 Mod を
              書き込む Sync が使えます。
            </p>

            {/*
              §10.1: Firefox / Safari / モバイルは **ZipSink 経由の Sync**。
              Direct Write の代替として、同じ Plan / Journal / Rollback を通した
              結果を ZIP で書き出す。
              **D-2: 自動では切り替えない** — 非対応ブラウザのときだけこの導線を出す。
            */}
            <div className="theme-sub-box rounded-xl p-3 space-y-2.5">
              <p className="text-xs theme-text-muted leading-relaxed">
                <i className="fa-solid fa-file-zipper theme-text-brand mr-1.5" aria-hidden />
                代わりに、<span className="theme-text-primary font-semibold">
                同期内容を ZIP として書き出す</span>ことができます。
                既存の .minecraft を ZIP にしたものを選ぶと、それとの差分だけが
                反映された ZIP が得られます (選ばなければ Profile の全 Mod を書き出します)。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void exportSyncAsZip()}
                  disabled={zipSync.running || !currentProfile}
                  className="btn-hover-effect px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <i
                    className={`fa-solid ${zipSync.running ? 'fa-spinner fa-spin' : 'fa-file-export'}`}
                    aria-hidden
                  />
                  {zipSync.running ? '書き出し中...' : 'ZIP に書き出す (Sync)'}
                </button>

                <label className="btn-hover-effect px-3.5 py-2 theme-sub-box text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500">
                  <i className="fa-solid fa-folder-open theme-text-brand" aria-hidden />
                  既存の .minecraft ZIP を選ぶ
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    className="sr-only"
                    disabled={zipSync.running}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // 同じファイルを続けて選べるように value を空に戻す
                      e.target.value = '';
                      if (file) void exportSyncAsZip(file);
                    }}
                  />
                </label>
              </div>

              {zipSync.error ? (
                <p className="text-xs theme-text-red leading-relaxed">
                  <i className="fa-solid fa-circle-exclamation mr-1.5" aria-hidden />
                  {zipSync.error}
                </p>
              ) : null}

              {zipSync.result ? (
                <p className="text-xs theme-text-muted leading-relaxed">
                  <i className="fa-solid fa-circle-check theme-text-emerald mr-1.5" aria-hidden />
                  {zipSync.result.fileName} ({zipSync.result.applied} 件 /{' '}
                  {Math.round(zipSync.result.bytes / 1024)} KB) を書き出しました。
                  {zipSync.result.skipped > 0
                    ? ` ${zipSync.result.skipped} 件はスキップされました。`
                    : ''}
                </p>
              ) : null}
            </div>
          </>
        ) : !linkedSource ? (
          /* -------------------------------------------------------- */
          /* 未紐付け                                                   */
          /* -------------------------------------------------------- */
          <>
            <p className="text-xs theme-text-muted leading-relaxed">
              Minecraft フォルダ (.minecraft や Prism インスタンス) をこのプロファイルに
              紐付けると、Profile の内容とフォルダの中身を突き合わせて差分を書き込む
              Sync が使えるようになります。
            </p>
            <button
              type="button"
              onClick={() => void link()}
              disabled={linking || !currentProfile}
              className="btn-hover-effect w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-folder-open" aria-hidden />
              {linking ? 'フォルダを選択中...' : 'フォルダを選択して紐付ける'}
            </button>
          </>
        ) : (
          /* -------------------------------------------------------- */
          /* 紐付け済み                                                 */
          /* -------------------------------------------------------- */
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="theme-text-muted">フォルダ</dt>
              <dd className="font-mono break-all">{linkedSource.rootName}</dd>

              <dt className="theme-text-muted">検出した環境</dt>
              <dd className="font-mono">
                {linkedSource.environment.mcVersion ?? '—'}
                {' / '}
                {linkedSource.environment.loader ?? '—'}
                {linkedSource.environment.loaderVersion
                  ? ` / ${linkedSource.environment.loaderVersion}`
                  : ''}
              </dd>

              <dt className="theme-text-muted">検出したフォルダ</dt>
              <dd className="font-mono text-[11px] theme-text-secondary">
                {linkedSource.contentDirs.mods ?? '—'}
                {linkedSource.contentDirs.resourcepacks
                  ? `, ${linkedSource.contentDirs.resourcepacks}`
                  : ''}
                {linkedSource.contentDirs.shaderpacks
                  ? `, ${linkedSource.contentDirs.shaderpacks}`
                  : ''}
              </dd>

              <dt className="theme-text-muted">紐付けた日時</dt>
              <dd className="font-mono text-[11px]">
                {formatLinkedAt(linkedSource.linkedAt)}
              </dd>
            </dl>

            {/* ------------------------------------------------------ */}
            {/* D-1: 環境一致チェックの結果                              */}
            {/* ------------------------------------------------------ */}
            {check && !check.ok && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-1.5"
              >
                <p className="text-xs font-bold theme-text-red flex items-center gap-1.5">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                  環境が一致しないため Sync できません
                </p>
                <ul className="text-[11px] theme-text-secondary space-y-0.5">
                  {check.mismatches.map((m) => (
                    <li key={m.field} className="font-mono">
                      {m.label}: Profile「{m.profile}」/ 検出「{m.detected}」
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] theme-text-muted leading-relaxed">
                  プロファイルの環境を実際の環境に合わせるか、別のプロファイルを
                  選択してください。
                </p>
              </div>
            )}

            {check?.ok === true && check.unverified.length > 0 && (
              <p className="text-[11px] theme-text-muted leading-relaxed">
                <i className="fa-solid fa-circle-info theme-text-brand mr-1.5" aria-hidden />
                {check.unverified.map((u) => ENVIRONMENT_FIELD_LABEL[u.field]).join('・')}
                はフォルダから検出できなかったため、確認できていません。
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <SyncButton
                variant="primary"
                disabled={linking || unlinking}
                onPrepared={(outcome) => {
                  // 解析は成功したが書き込めない = D-2。ZIP 代替導線を出す
                  setReadOnly(
                    outcome?.status === 'ready' && !outcome.writable ? outcome : null
                  );
                }}
              />
              <button
                type="button"
                onClick={() => void link()}
                disabled={linking || unlinking}
                className="btn-hover-effect px-3.5 py-2 theme-sub-box text-xs font-semibold rounded-xl border border-transparent hover:border-emerald-500/50 transition flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-folder-open theme-text-brand" aria-hidden />
                {linking ? '選択中...' : 'フォルダを選び直す'}
              </button>
              <button
                type="button"
                onClick={() => void handleUnlink()}
                disabled={linking || unlinking}
                className="btn-hover-effect px-3.5 py-2 text-xs font-semibold rounded-xl bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 theme-text-red border border-red-500/30 transition flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-link-slash" aria-hidden />
                {unlinking ? '解除中...' : '紐付けを解除'}
              </button>
            </div>
          </>
        )}

        {/* **D-10**: 書き込み権限が取れないときの ZIP 代替導線 */}
        {readOnly && (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2"
          >
            <p className="text-xs font-bold theme-text-amber flex items-center gap-1.5">
              <i className="fa-solid fa-lock" aria-hidden />
              読み取り専用で同期できません
            </p>
            <p className="text-[11px] theme-text-secondary leading-relaxed">
              {readOnly.writableReason}
            </p>
            <button
              type="button"
              onClick={() => handleDownloadZip()}
              className="btn-hover-effect px-3.5 py-2 theme-sub-box text-xs font-semibold rounded-xl transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-file-zipper theme-text-brand" aria-hidden />
              ZIP で書き出す
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[11px] theme-text-red leading-relaxed">
            <i className="fa-solid fa-circle-exclamation mr-1.5" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </section>
  );
};
