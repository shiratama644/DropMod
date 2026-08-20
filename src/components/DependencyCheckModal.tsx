import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Profile, DependencyCheckData, ModItem } from '../types';
import { fetchModrinth, fetchStableModVersion } from '../services/api';
import { useModalA11y } from '../hooks/useModalA11y';

interface DependencyCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  onToggleMod: (id: string, e: React.MouseEvent, silent?: boolean) => Promise<void>;
  onRefresh: () => void;
}

type CheckTabType = 'all' | 'conflicts' | 'missing' | 'optional' | 'ok';

interface TabConfig {
  id: CheckTabType;
  label: string;
  countKey: keyof typeof initialCounts;
  badgeColor?: string;
}

const initialCounts = {
  all: 0,
  conflicts: 0,
  missing: 0,
  optional: 0,
  ok: 0,
};

export const DependencyCheckModal: React.FC<DependencyCheckModalProps> = ({
  isOpen,
  onClose,
  profile,
  onToggleMod,
  onRefresh,
}) => {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('準備中...');
  const [checkTab, setCheckTab] = useState<CheckTabType>('all');
  const [data, setData] = useState<DependencyCheckData | null>(null);
  const [isFixing, setIsFixing] = useState(false);

  // ------------------------------------------------------------------
  // 追加/削除ボタンの同時押し防止 (バグ: 追加ボタンが反応しない現象の対策)
  //
  // 問題の連鎖:
  //   1. onToggleMod はトグル動作 (追加/削除の切替) のため、
  //      「追加ボタン → 既に installed → 削除される → runCheck → missing に
  //      戻る → ボタンまた表示」を繰り返して見た目上「無反応」になる
  //   2. 追加ボタン押下直後の runCheck が profile 更新の反映前に走り、
  //      同じ項目を missing 判定 → 一覧の同じ場所に別要素が並び、
  //      次のクリックが「別の項目」の click として処理される
  //   3. 上記中に data が再セット → 一覧全体が再描画 → ボタン DOM が差替
  //
  // 対策:
  //   - actionInFlight state で同一 targetProjectId のクリックをロック +
  //     ボタン UI 側で disabled 表示 (視覚フィードバック)
  //   - runCheck は Ref 経由で最新関数を呼び、profile 変化を待ってから走らせる
  // ------------------------------------------------------------------
  const [actionInFlight, setActionInFlight] = useState<Set<string>>(() => new Set());
  const actionInFlightRef = useRef<Set<string>>(actionInFlight);
  actionInFlightRef.current = actionInFlight;
  const lockAction = useCallback((id: string) => {
    setActionInFlight((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const unlockAction = useCallback((id: string) => {
    setActionInFlight((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const runCheck = useCallback(async (isCancelled?: () => boolean) => {
    const checkCancelled = () => (isCancelled ? isCancelled() : false);

    if (checkCancelled()) return;
    setProgress(15);
    setStatusText(`${profile.mods?.length || 0} 個のModデータを準備中...`);

    if (!profile.mods || profile.mods.length === 0) {
      if (checkCancelled()) return;
      setProgress(100);
      setStatusText('チェック対象のModがありません');
      setData({
        missingRequired: [],
        conflicts: [],
        optionalAvailable: [],
        verifiedOK: [],
        depProjectMap: new Map(),
      });
      return;
    }

    try {
      const versionIds = profile.mods
        .map((m) => m.selectedVersionId)
        .filter((id): id is string => Boolean(id && id !== 'latest'));
      const versionMap = new Map<string, unknown>();

      if (checkCancelled()) return;
      setProgress(40);
      setStatusText('詳細バージョン情報を取得中...');

      if (versionIds.length > 0) {
        try {
          const batchVersions = await fetchModrinth<Array<{ id: string }>>('/versions', {
            ids: JSON.stringify(versionIds),
          });
          batchVersions.forEach((v) => {
            if (v?.id) versionMap.set(v.id, v);
          });
        } catch {
          await Promise.all(
            profile.mods.map(async (mod) => {
              if (mod.selectedVersionId) {
                try {
                  const vData = await fetchModrinth(`/version/${mod.selectedVersionId}`);
                  if (vData) versionMap.set(mod.selectedVersionId, vData);
                } catch {
                  // Fallback strategy for individual version fetching
                }
              }
            })
          );
        }
      }

      if (checkCancelled()) return;
      setProgress(70);
      setStatusText('依存・競合マトリクスを解析中...');

      const installedProjectSet = new Set<string>();
      profile.mods.forEach((m) => {
        if (m.id) installedProjectSet.add(m.id);
        if (m.slug) installedProjectSet.add(m.slug);
      });

      const missingRequired: Array<{ sourceMod: ModItem; targetProjectId: string }> = [];
      const conflicts: Array<{ sourceMod: ModItem; targetMod: ModItem | { title: string; id: string } }> = [];
      const optionalAvailable: Array<{ sourceMod: ModItem; targetProjectId: string }> = [];
      const verifiedOK: Array<{ sourceMod: ModItem; message: string }> = [];
      const missingProjectIds = new Set<string>();

      for (const mod of profile.mods) {
        let vData = mod.selectedVersionId ? (versionMap.get(mod.selectedVersionId) as any) : null;

        if (!vData && mod.id) {
          try {
            const versionRes = await fetchStableModVersion(mod.id, profile);
            vData = versionRes ? versionRes.targetVersion : null;
          } catch {
            // Fallback strategy exhausted
          }
        }

        if (!vData || !Array.isArray(vData.dependencies) || vData.dependencies.length === 0) {
          verifiedOK.push({ sourceMod: mod, message: '独立Mod (依存指定なし)' });
          continue;
        }

        let validDepsCount = 0;

        for (const dep of vData.dependencies) {
          const type = dep?.dependency_type;
          const targetProjId = dep?.project_id;

          if (type === 'embedded' || !targetProjId) continue;

          if (type === 'required') {
            if (installedProjectSet.has(targetProjId)) {
              validDepsCount++;
            } else {
              missingRequired.push({ sourceMod: mod, targetProjectId: targetProjId });
              missingProjectIds.add(targetProjId);
            }
          } else if (type === 'incompatible') {
            if (installedProjectSet.has(targetProjId)) {
              const targetMod = profile.mods.find(
                (m) => m.id === targetProjId || m.slug === targetProjId
              );
              conflicts.push({
                sourceMod: mod,
                targetMod: targetMod || { title: targetProjId, id: targetProjId },
              });
            }
          } else if (type === 'optional') {
            if (installedProjectSet.has(targetProjId)) {
              validDepsCount++;
            } else {
              optionalAvailable.push({ sourceMod: mod, targetProjectId: targetProjId });
              missingProjectIds.add(targetProjId);
            }
          }
        }

        if (validDepsCount > 0) {
          verifiedOK.push({
            sourceMod: mod,
            message: `${validDepsCount} 個の必須/推奨依存関係が正常です`,
          });
        }
      }

      if (checkCancelled()) return;
      setProgress(90);
      setStatusText('不足モッド情報を補完中...');

      const depProjectMap = new Map<string, any>();
      if (missingProjectIds.size > 0) {
        try {
          const projectBatch = await fetchModrinth<Array<{ id: string }>>('/projects', {
            ids: JSON.stringify(Array.from(missingProjectIds)),
          });
          projectBatch.forEach((p) => {
            if (p?.id) depProjectMap.set(p.id, p);
          });
        } catch {
          await Promise.all(
            Array.from(missingProjectIds).map(async (pId) => {
              try {
                const pData = await fetchModrinth(`/project/${pId}`);
                if (pData) depProjectMap.set(pId, pData);
              } catch {
                // Ignore missing metadata
              }
            })
          );
        }
      }

      if (checkCancelled()) return;
      setProgress(100);
      setStatusText('検証完了');

      setData({
        missingRequired,
        conflicts,
        optionalAvailable,
        verifiedOK,
        depProjectMap,
      });
    } catch {
      if (checkCancelled()) return;
      setProgress(100);
      setStatusText('検証中にエラーが発生しました');
      setData(null);
    }
  }, [profile]);

  // runCheck を Ref に固定して、profile が変わっても useEffect が
  // 再発火しないようにする (isOpen トグルとプロファイル切替のみで走らせる)
  // render 中に同期セットで race を防ぐ
  const runCheckRef = useRef(runCheck);
  runCheckRef.current = runCheck;

  // ------------------------------------------------------------------
  // 再検証トリガ
  //
  // (1) isOpen 遷移 / プロファイル本体切替 (id) → 即時に走らせる
  // (2) プロファイル内 mods の構成が変化 (追加/削除/バージョン変更) →
  //     短いデバウンス後に自動再検証。ユーザーが「追加」を押した後、
  //     runCheck をボタン onClick 内で明示的に呼ぶと race condition
  //     ("反応しない" 現象) の原因になるため、profile 変化検知で
  //     まとめて更新する方式に統一。
  // ------------------------------------------------------------------
  const modsSignature = profile.mods
    .map((m) => `${m.id || m.slug || '?'}@${m.selectedVersionId || 'latest'}`)
    .join(',');

  // (1) 初回オープン / プロファイル本体切替 → 即時
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    runCheckRef.current(() => isCancelled);
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, profile.id]);

  // (2) mods 配列の変化 → 600ms デバウンスで再チェック
  //     デバウンスすることで連続追加/削除中に API を叩きすぎない
  const isFirstModsSignatureRun = useRef<boolean>(true);
  useEffect(() => {
    if (!isOpen) {
      isFirstModsSignatureRun.current = true;
      return;
    }
    // 初回オープン時は (1) のuseEffectで走らせるのでスキップ
    if (isFirstModsSignatureRun.current) {
      isFirstModsSignatureRun.current = false;
      return;
    }
    let isCancelled = false;
    const timer = setTimeout(() => {
      runCheckRef.current(() => isCancelled);
    }, 600);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, modsSignature]);

  // a11y: Escape + フォーカストラップ (共通フックに統一)
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, dialogRef);

  // ---------------------------------------------------------------------
  // ⚠️ Rules of Hooks 遵守:
  //   すべてのフック呼び出し (useCallback を含む) は、下の
  //   `if (!isOpen) return null;` 早期リターンよりも前に完了させる必要
  //   がある。以前 useCallback を return 後に置いていたため、isOpen が
  //   false→true になった瞬間に React が「フック呼び出し数の変化」を
  //   検知し、minified error #310 (Rendered more hooks than during
  //   the previous render) を throw してモーダルがクラッシュしていた。
  //   → useCallback は早期リターンより前に配置。
  // ---------------------------------------------------------------------

  // ------------------------------------------------------------------
  // 追加専用ハンドラ ("追加ボタンが反応しない" バグ修正)
  //
  // onToggleMod はトグル動作 (追加⇔削除) のため、既に追加済みの Mod に
  // 対して押すと逆に「削除」されてしまう。runCheck による自動再検証で
  // 「missing → 消えた → また missing」を繰り返し、見た目上「無反応」に。
  //
  // このヘルパーは:
  //   1. 現時点で本当に未追加かをチェック → 既にあれば削除ではなく "追加済み" を通知
  //   2. actionInFlight state で同一 targetProjectId の並列クリックをロック
  //   3. onClick 内での runCheck() を廃止し、profile 変化検知で自動再チェック
  //      (race condition の元凶を根絶)
  // ------------------------------------------------------------------
  const handleAddDependencyMod = useCallback(
    async (targetProjectId: string, e: React.MouseEvent) => {
      if (actionInFlightRef.current.has(targetProjectId)) return;
      // 既に installed なら onToggleMod を呼ばずに data 側から消すだけ
      const alreadyInstalled = profile.mods.some(
        (m) => m.id === targetProjectId || m.slug === targetProjectId
      );
      if (alreadyInstalled) {
        // すでに入っているのに missing 判定が残っているのは runCheck 未反映の可能性
        // → data を暫定的に修正して即座に UI から消す (トグル暴発を回避)
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            missingRequired: prev.missingRequired.filter(
              (m) => m.targetProjectId !== targetProjectId
            ),
            optionalAvailable: prev.optionalAvailable.filter(
              (o) => o.targetProjectId !== targetProjectId
            )
          };
        });
        return;
      }
      lockAction(targetProjectId);
      try {
        await onToggleMod(targetProjectId, e);
        // runCheck は modsSignature 変化検知の useEffect (600ms デバウンス)
        // で自動的に走るため、ここで明示的に呼ばない
      } finally {
        unlockAction(targetProjectId);
      }
    },
    [profile.mods, onToggleMod, lockAction, unlockAction]
  );

  // ------------------------------------------------------------------
  // 削除専用ハンドラ (競合 Mod の削除)
  // 同様に、既に削除済みなら何もしない (UI 側の即時反映)
  // ------------------------------------------------------------------
  const handleRemoveConflictingMod = useCallback(
    async (sourceModId: string, e: React.MouseEvent) => {
      if (actionInFlightRef.current.has(sourceModId)) return;
      const stillExists = profile.mods.some(
        (m) => m.id === sourceModId || m.slug === sourceModId
      );
      if (!stillExists) {
        // 既に消えていたら data からも消す
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            conflicts: prev.conflicts.filter(
              (c) => c.sourceMod.id !== sourceModId && c.sourceMod.slug !== sourceModId
            )
          };
        });
        return;
      }
      lockAction(sourceModId);
      try {
        await onToggleMod(sourceModId, e);
        // runCheck は自動 (modsSignature 検知) に任せる
      } finally {
        unlockAction(sourceModId);
      }
    },
    [profile.mods, onToggleMod, lockAction, unlockAction]
  );

  // すべてのフック呼び出しを終えてから早期リターン (Rules of Hooks 遵守)
  if (!isOpen) return null;

  const handleAutoFix = async () => {
    if (!data?.missingRequired || isFixing) return;
    setIsFixing(true);
    try {
      // 1. 重複する targetProjectId を除去 (複数のsourceModが同じライブラリに依存するケース対策)
      // 2. 既にプロファイルに存在するMod (id or slug で照合) はスキップ
      const installedIds = new Set<string>();
      profile.mods.forEach((m) => {
        if (m.id) installedIds.add(m.id);
        if (m.slug) installedIds.add(m.slug);
      });

      const uniqueTargets = Array.from(
        new Set(data.missingRequired.map((item) => item.targetProjectId))
      ).filter((targetId) => !installedIds.has(targetId));

      for (const targetProjectId of uniqueTargets) {
        await onToggleMod(
          targetProjectId,
          { stopPropagation: () => {} } as React.MouseEvent,
          true
        );
      }
      // AutoFix は明示的な一括操作なので、profile 変化検知の自動 runCheck
      // ではなく即時再検証を走らせる (progress UI を再表示するため)
      await runCheckRef.current();
      onRefresh();
    } catch {
      setStatusText('Auto-Fix処理中にエラーが発生しました');
    } finally {
      setIsFixing(false);
    }
  };

  const counts = {
    all:
      (data?.conflicts.length || 0) +
      (data?.missingRequired.length || 0) +
      (data?.optionalAvailable.length || 0) +
      (data?.verifiedOK.length || 0),
    conflicts: data?.conflicts.length || 0,
    missing: data?.missingRequired.length || 0,
    optional: data?.optionalAvailable.length || 0,
    ok: data?.verifiedOK.length || 0,
  };

  const tabList: TabConfig[] = [
    { id: 'all', label: 'すべて', countKey: 'all' },
    {
      id: 'conflicts',
      label: '競合',
      countKey: 'conflicts',
      badgeColor: counts.conflicts > 0 ? 'bg-red-500/20 theme-text-red' : '',
    },
    {
      id: 'missing',
      label: '必須欠落',
      countKey: 'missing',
      badgeColor: counts.missing > 0 ? 'bg-amber-500/20 theme-text-amber' : '',
    },
    { id: 'optional', label: '推奨提案', countKey: 'optional' },
    { id: 'ok', label: '正常', countKey: 'ok' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dependency-modal-title"
        className="modal-card glass-panel w-full max-w-2xl rounded-3xl p-4 sm:p-6 border shadow-2xl relative flex flex-col max-h-[88vh] sm:max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-500/20 pb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 font-extrabold text-base sm:text-lg shadow-md shrink-0">
              <i className="fa-solid fa-shield-halved" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="dependency-modal-title" className="font-extrabold text-sm sm:text-lg leading-tight truncate">
                依存関係・競合検証 Engine
              </h3>
              <p className="text-[11px] sm:text-xs theme-text-muted mt-0.5 truncate">
                Modrinth APIでプロファイル内全Modを検証
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            type="button"
            className="theme-text-muted hover:text-emerald-500 p-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg shrink-0 transition-colors"
          >
            <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 py-3 shrink-0 border-b border-slate-500/10">
          <div className="flex justify-between items-center text-xs font-semibold">
            <span className="theme-text-secondary flex items-center gap-1.5 truncate text-[11px] sm:text-xs">
              {progress < 100 && (
                <i className="fa-solid fa-spinner fa-spin theme-text-amber" aria-hidden="true" />
              )}
              {statusText}
            </span>
            <span className="font-mono theme-text-amber font-bold shrink-0 ml-2">{progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-700/50 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Filter Tabs & Auto-Fix Banner */}
        <div className="py-2.5 shrink-0 space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar touch-pan-x">
            {tabList.map((t) => {
              const count = counts[t.countKey];
              const isSelected = checkTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCheckTab(t.id)}
                  aria-pressed={isSelected}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'theme-sub-box theme-text-secondary hover:text-emerald-500'
                  }`}
                >
                  <span>{t.label}</span>
                  <span
                    className={`px-1.5 py-0.5 leading-none text-[10px] rounded-full ${
                      isSelected
                        ? 'bg-slate-950/20 text-slate-950 font-black'
                        : t.badgeColor || 'bg-slate-500/20 theme-text-muted'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {data && data.missingRequired.length > 0 && (
            <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <i className="fa-solid fa-wand-magic-sparkles theme-text-amber text-sm shrink-0" aria-hidden="true" />
                <span className="font-bold theme-text-amber truncate">
                  {data.missingRequired.length} 個の必須Modが一括追加可能です
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutoFix}
                disabled={isFixing}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs shadow shrink-0 active:scale-95 transition"
              >
                {isFixing ? '解決中...' : '一括解決 (Auto-Fix)'}
              </button>
            </div>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 my-1 hide-scrollbar min-h-[180px]">
          {data && (
            <>
              {(checkTab === 'all' || checkTab === 'conflicts') &&
                data.conflicts.map((c) => {
                  const key = `conflict-${c.sourceMod.id || c.sourceMod.slug}-${c.targetMod.id || ('title' in c.targetMod ? c.targetMod.title : '')}`;
                  return (
                    <div
                      key={key}
                      className="glass-card p-3 rounded-2xl border-l-4 border-l-red-500 border-red-500/30 bg-red-500/5"
                    >
                      {/*
                        アクションボタンは常に右端のコンパクトなアイコンボタンにして
                        「何が競合しているか」の情報部分の視認性を優先する。
                        (以前は sm 未満で全幅の派手なボタンだったため情報が埋もれていた)
                      */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-red-500/20 theme-text-red flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-xs theme-text-red flex items-center gap-1.5 flex-wrap">
                              <span>Mod競合を検出</span>
                              <span className="text-[9px] px-1.5 py-0.5 leading-none rounded bg-red-500/20 theme-text-red font-mono">
                                Incompatible
                              </span>
                            </div>
                            <p className="text-xs font-semibold theme-text-secondary mt-0.5 leading-tight break-words">
                              「<span className="font-bold theme-text-brand">{c.sourceMod.title}</span>」と「
                              <span className="font-bold theme-text-amber">{c.targetMod.title}</span>」は併用できません。
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            if (c.sourceMod.id) {
                              // 削除専用ハンドラ (トグル暴発回避 + 自動 runCheck に任せる)
                              void handleRemoveConflictingMod(c.sourceMod.id, e);
                            }
                          }}
                          disabled={
                            isFixing ||
                            (c.sourceMod.id ? actionInFlight.has(c.sourceMod.id) : false)
                          }
                          title={`${c.sourceMod.title} を削除`}
                          aria-label={`${c.sourceMod.title} を削除`}
                          className="shrink-0 self-center inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg theme-text-red hover:bg-red-500/15 active:bg-red-500/25 border border-red-500/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {c.sourceMod.id && actionInFlight.has(c.sourceMod.id) ? (
                            <i
                              className="fa-solid fa-spinner fa-spin text-[11px]"
                              aria-hidden="true"
                            />
                          ) : (
                            <i className="fa-solid fa-trash-can text-[11px]" aria-hidden="true" />
                          )}
                          <span className="hidden sm:inline">削除</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

              {(checkTab === 'all' || checkTab === 'missing') &&
                data.missingRequired.map((m) => {
                  const pInfo = data.depProjectMap.get(m.targetProjectId);
                  const title = pInfo ? pInfo.title : m.targetProjectId;
                  const key = `missing-${m.sourceMod.id || m.sourceMod.slug}-${m.targetProjectId}`;
                  return (
                    <div
                      key={key}
                      className="glass-card p-3 rounded-2xl border-l-4 border-l-amber-500 border-amber-500/30 bg-amber-500/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {pInfo?.icon_url ? (
                            <img
                              src={pInfo.icon_url}
                              alt={title}
                              className="w-7 h-7 rounded-lg object-contain bg-slate-800 p-0.5 shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-amber-500/20 theme-text-amber flex items-center justify-center font-bold text-xs shrink-0">
                              <i className="fa-solid fa-cube" aria-hidden="true" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-xs theme-text-amber flex items-center gap-1.5 flex-wrap">
                              <span>必須Mod不足</span>
                              <span className="text-[9px] px-1.5 py-0.5 leading-none rounded bg-amber-500/20 theme-text-amber font-mono">
                                Required
                              </span>
                            </div>
                            <div className="text-xs font-bold theme-text-primary truncate mt-0.5">{title}</div>
                            <div className="text-[11px] theme-text-muted truncate">
                              「{m.sourceMod.title}」の動作に必要
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            // 追加専用ハンドラ (トグル暴発回避 + 自動 runCheck に任せる)
                            void handleAddDependencyMod(m.targetProjectId, e);
                          }}
                          disabled={isFixing || actionInFlight.has(m.targetProjectId)}
                          title={`${title} を追加`}
                          aria-label={`${title} を追加`}
                          className="shrink-0 self-center inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg theme-text-amber hover:bg-amber-500/15 active:bg-amber-500/25 border border-amber-500/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionInFlight.has(m.targetProjectId) ? (
                            <i
                              className="fa-solid fa-spinner fa-spin text-[11px]"
                              aria-hidden="true"
                            />
                          ) : (
                            <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                          )}
                          <span className="hidden sm:inline">追加</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

              {(checkTab === 'all' || checkTab === 'optional') &&
                data.optionalAvailable.map((o) => {
                  const pInfo = data.depProjectMap.get(o.targetProjectId);
                  const title = pInfo ? pInfo.title : o.targetProjectId;
                  const key = `optional-${o.sourceMod.id || o.sourceMod.slug}-${o.targetProjectId}`;
                  return (
                    <div
                      key={key}
                      className="glass-card p-3 rounded-2xl border-l-4 border-l-blue-500 border-blue-500/30 bg-blue-500/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {pInfo?.icon_url ? (
                            <img
                              src={pInfo.icon_url}
                              alt={title}
                              className="w-7 h-7 rounded-lg object-contain bg-slate-800 p-0.5 shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-blue-500/20 theme-text-blue flex items-center justify-center font-bold text-xs shrink-0">
                              <i className="fa-solid fa-cube" aria-hidden="true" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-xs theme-text-blue flex items-center gap-1.5 flex-wrap">
                              <span>推奨オプション</span>
                              <span className="text-[9px] px-1.5 py-0.5 leading-none rounded bg-blue-500/20 theme-text-blue font-mono">
                                Optional
                              </span>
                            </div>
                            <div className="text-xs font-bold theme-text-primary truncate mt-0.5">{title}</div>
                            <div className="text-[11px] theme-text-muted truncate">
                              「{o.sourceMod.title}」と連携機能あり
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            // 追加専用ハンドラ (トグル暴発回避 + 自動 runCheck に任せる)
                            void handleAddDependencyMod(o.targetProjectId, e);
                          }}
                          disabled={isFixing || actionInFlight.has(o.targetProjectId)}
                          title={`${title} を追加`}
                          aria-label={`${title} を追加`}
                          className="shrink-0 self-center inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg theme-text-blue hover:bg-blue-500/15 active:bg-blue-500/25 border border-blue-500/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionInFlight.has(o.targetProjectId) ? (
                            <i
                              className="fa-solid fa-spinner fa-spin text-[11px]"
                              aria-hidden="true"
                            />
                          ) : (
                            <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                          )}
                          <span className="hidden sm:inline">追加</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

              {(checkTab === 'all' || checkTab === 'ok') &&
                data.verifiedOK.map((v) => {
                  const key = `ok-${v.sourceMod.id || v.sourceMod.slug}`;
                  return (
                    <div
                      key={key}
                      className="glass-card p-2.5 sm:p-3 rounded-xl border border-slate-500/10 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-emerald-500/20 theme-text-brand flex items-center justify-center text-xs shrink-0">
                          <i className="fa-solid fa-check" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs truncate">{v.sourceMod.title}</div>
                          <div className="text-[11px] theme-text-muted truncate">{v.message}</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 theme-text-brand border border-emerald-500/20 shrink-0">
                        正常
                      </span>
                    </div>
                  );
                })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-500/20 shrink-0 text-xs">
          <span className="theme-text-muted text-[11px] sm:text-xs truncate">
            {data
              ? `競合: ${data.conflicts.length} | 必須欠落: ${data.missingRequired.length} | 推奨提案: ${data.optionalAvailable.length} | 正常: ${data.verifiedOK.length}`
              : 'Modrinth Verifier PRO'}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => runCheckRef.current()}
              className="px-3 py-1.5 rounded-xl theme-sub-box hover:text-amber-500 text-xs font-semibold transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-rotate-right text-[11px]" aria-hidden="true" />
              <span className="hidden sm:inline">再検証</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              完了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};