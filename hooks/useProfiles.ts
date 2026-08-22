'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Profile, ModItem, ThemeMode } from '@/types';
import { fetchModrinth, fetchStableModVersion } from '@/lib/modrinth/client';
import type { ConfirmDialogOptions } from '@/components/ConfirmDialog';
import { generateId } from '@/lib/utils/id';
import {
  syncProfiles as dexieSyncProfiles,
  getAllProfiles as dexieGetAllProfiles,
  getMeta as dexieGetMeta,
  setMeta as dexieSetMeta
} from '@/lib/db/dexie';
import {
  migrateFromLocalStorage,
  cleanupExpiredBackup,
  META_KEYS,
  LOCAL_STORAGE_KEYS
} from '@/lib/db/migrate';
import { useProfilesStore } from '@/lib/store/profiles';
import { queryKeys } from '@/lib/query/keys';
import { DEFAULT_STALE_TIME_MS } from '@/lib/query/client';

type ConfirmFn = (options: ConfirmDialogOptions) => Promise<boolean>;

// `sanitizeLoadedState` は lib/state/sanitize.ts に集約 (第7波 M7-2 修正)。
// 以前は互換のため useProfiles からも re-export していたが、参照 0 の dead code
// だったため削除。fallback 経路 (Dexie 失敗時) の LocalStorage 読み取り用に
// import のみ残す。
import { sanitizeLoadedState as sanitizeLoadedStateShim } from '@/lib/state/sanitize';

export const useProfiles = (
  theme: ThemeMode,
  setThemeState: (theme: ThemeMode) => void,
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
  confirmDialog: ConfirmFn
) => {
  // ------------------------------------------------------------------
  // Sub-Phase 8-C: state を Zustand (useProfilesStore) に委譲。
  //
  // hook は以下の役割:
  //   - store の状態を購読
  //   - Modrinth API 呼び出し・cookie 書き込み・showToast 連携を担う
  //     (副作用を含む action を store から追い出して pure に保つ)
  //   - store の setter に一元アクセス
  //
  // 注意: props 経由の setThemeState (旧 API) と store.setTheme の
  //   両方に書き込むことで、既存の theme 管理 (AppShell useState) との
  //   互換を保ちつつ store を並走させる。次段の Sub-Phase 8-C Step 4 で
  //   props 経由を廃止し、store.setTheme に一本化する。
  // ------------------------------------------------------------------

  // C7-2 修正: TanStack Query client を取得して Modrinth /project/{id} 呼び出しを
  // キャッシュ経由に。同じ project ID の 2 回目以降は fetch を発生させない。
  // Dexie apiCache persister 経由でオフライン時も既読プロジェクト情報を取得可能。
  const queryClient = useQueryClient();

  // 個別 selector で購読することで、他 field 変更時の再レンダーを抑制。
  const profiles = useProfilesStore((s) => s.profiles);
  const currentProfileId = useProfilesStore((s) => s.currentProfileId);
  const hasHydrated = useProfilesStore((s) => s.hasHydrated);

  // action は Zustand 内で stable なので参照が変わらない。
  const setProfiles = useProfilesStore((s) => s.setProfiles);
  const setCurrentProfileId = useProfilesStore((s) => s.setCurrentProfileId);
  const setHasHydrated = useProfilesStore((s) => s.setHasHydrated);

  // ------------------------------------------------------------------
  // 最新 state 参照用 Ref (stale closure 対策)
  //
  // handleToggleMod のような非同期処理の中では、レンダー時点の profiles
  // をキャプチャした値ではなく、常に最新の値を参照する必要がある。
  // AutoFix や連続操作で古い state を見て「未追加」判定してしまい、
  // 追加⇔削除トグルが暴発するのを防ぐ。
  //
  // ⚠️ ref の更新は useEffect ではなく render 中に同期で行う
  //    (useEffect は render 後に非同期で走るため、同じレンダーサイクル内で
  //     発火した非同期処理が古い ref を掴む race を防ぐ)。
  //
  // 補足: Zustand には useProfilesStore.getState() があるが、Ref 更新なしで
  //   直接 getState() を呼ぶと、subscribeWithSelector 経由の購読と挙動が微妙に
  //   ずれる恐れがあるため、既存の Ref パターンを維持する。
  // ------------------------------------------------------------------
  const profilesRef = useRef<Profile[]>(profiles);
  const currentProfileIdRef = useRef<string>(currentProfileId);
  profilesRef.current = profiles;
  currentProfileIdRef.current = currentProfileId;

  // handleToggleMod の並列呼び出し防止用 (同一 projectId への連打で
  // 重複トグルが起きないようにする)
  const toggleInFlightRef = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------------
  // Sub-Phase 8-A: Dexie (IndexedDB) からの hydration
  //
  //   1. migrateFromLocalStorage()  — 初回起動時のみ LocalStorage → Dexie コピー
  //   2. cleanupExpiredBackup()     — 移行から 7 日経過後は LocalStorage を掃除
  //   3. Dexie の profiles テーブル + meta (theme/currentProfileId) を読む
  //   4. hasHydrated = true にして以降の保存 useEffect を有効化
  //
  // 失敗時 (IndexedDB 利用不可な Safari プライベートブラウズ等) は
  // LocalStorage をフォールバックとして読む。
  // ---------------------------------------------------------------------
  useEffect(() => {
    // M7-3 修正: React Strict Mode の double-effect / 別インスタンスからの
    //   重複 hydrate を避ける。Zustand store は module-global なので、
    //   一度 hasHydrated=true になっていたら Dexie 読み取りは不要。
    //   migrateFromLocalStorage は冪等だが、getAllProfiles + getMeta の
    //   I/O を無駄に 2 回実行してしまうため事前チェック。
    if (useProfilesStore.getState().hasHydrated) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Step 1-2: 移行 + 掃除
        await migrateFromLocalStorage();
        await cleanupExpiredBackup();

        // Step 3: Dexie 読み取り
        const [dbProfiles, savedTheme, savedCurrentId] = await Promise.all([
          dexieGetAllProfiles(),
          dexieGetMeta(META_KEYS.THEME),
          dexieGetMeta(META_KEYS.CURRENT_PROFILE_ID)
        ]);

        if (cancelled) return;

        // Dexie に profiles があれば ProfileRow を Profile へ (updatedAt を除く)
        if (dbProfiles.length > 0) {
          const restored: Profile[] = dbProfiles.map(({ updatedAt: _, ...p }) => p);
          setProfiles(restored);
        }

        if (savedTheme === 'dark' || savedTheme === 'light') {
          setThemeState(savedTheme);
        }

        if (savedCurrentId) {
          setCurrentProfileId(savedCurrentId);
        }
      } catch (e) {
        // Dexie が使えない環境 (Safari プライベート等) では LocalStorage を直接読む
        console.warn('[DropMod] Dexie 読み取り失敗、LocalStorage にフォールバック:', e);
        try {
          const saved =
            localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT) ??
            localStorage.getItem(LOCAL_STORAGE_KEYS.LEGACY);
          if (saved) {
            const parsed = JSON.parse(saved);
            const sanitized = sanitizeLoadedStateShim(parsed);
            if (sanitized && !cancelled) {
              if (sanitized.theme) setThemeState(sanitized.theme);
              if (sanitized.profiles && sanitized.profiles.length > 0) {
                setProfiles(sanitized.profiles);
              }
              if (sanitized.currentProfileId) {
                setCurrentProfileId(sanitized.currentProfileId);
              }
            }
          }
        } catch (innerErr) {
          console.error('[DropMod] LocalStorage フォールバックも失敗:', innerErr);
        }
      } finally {
        if (!cancelled) setHasHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setThemeState, setProfiles, setCurrentProfileId, setHasHydrated]);

  // ---------------------------------------------------------------------
  // Sub-Phase 8-A: Dexie への保存 (hydration 完了後のみ)
  //
  //   - syncProfiles で追加・更新・削除を差分同期
  //   - meta (theme / currentProfileId) は個別 put
  //   - LocalStorage への並行書き込みも「バックアップ期限内」の間だけ継続
  //     → 7 日以内なら Dexie が壊れても LocalStorage からロールバック可能
  //     → 期限切れ後は cleanupExpiredBackup が消すので、二重書きは自動で止まる
  //
  // 失敗時 (QuotaExceededError 等) は console.warn のみでアプリはクラッシュさせない。
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!hasHydrated) return;

    // Dexie 保存 (非同期、失敗時はログのみ)
    void (async () => {
      try {
        await dexieSyncProfiles(profiles);
        await Promise.all([
          dexieSetMeta(META_KEYS.THEME, theme),
          dexieSetMeta(META_KEYS.CURRENT_PROFILE_ID, currentProfileId)
        ]);
      } catch (e) {
        console.warn('[DropMod] Dexie への保存に失敗:', e);
      }
    })();

    // LocalStorage への並行バックアップ (バックアップ期限内 or 期限未設定なら)
    // 期限切れ後は cleanupExpiredBackup が meta と LocalStorage を消すので
    // ここでの再作成を避けるため getMeta で確認してから書く。
    void (async () => {
      try {
        const backupExpiry = await dexieGetMeta(META_KEYS.BACKUP_EXPIRES_AT);
        // バックアップ期限が未来 or (レア: hydrate と同時実行で meta 未設定) の場合のみ書く
        if (backupExpiry && Date.now() < Number(backupExpiry)) {
          localStorage.setItem(
            LOCAL_STORAGE_KEYS.CURRENT,
            JSON.stringify({ theme, currentProfileId, profiles })
          );
        }
      } catch (e) {
        // QuotaExceededError 等: 保存できなくてもアプリはクラッシュさせない
        console.warn('[DropMod] LocalStorage バックアップ書き込みに失敗:', e);
      }
    })();
  }, [hasHydrated, theme, currentProfileId, profiles]);

  // ---------------------------------------------------------------------
  // SSR プロファイル固定によるちらつき解消のため cookie に書き込み
  //
  // Home ページの SSR (Server Component) は cookies() でこの値を読み取り、
  // 実際のユーザープロファイル (LocalStorage 由来) に合わせた初期 24 件を返す。
  // これで hydration 後の再検索によるちらつきが起きなくなる。
  //
  // 書き込むのは mcVersion / loader のみ (SSR 検索に必要な最小情報)。
  // 個人情報や大きなデータは含めない (cookie サイズ制限のため)。
  // ---------------------------------------------------------------------
  // 以前は deps に `profiles` 全体を入れていたため、Mod 追加/削除の
  // たびに cookie 書き込みが発火していた (cookie 内容は mcVersion/loader のみ
  // で変化ないのに)。必要な mcVersion/loader をローカル変数に取り出し、
  // deps を [hasHydrated, mcVersion, loader] のみに限定して過剰実行を防止。
  const currentProfileForCookie = profiles.find((p) => p.id === currentProfileId) || profiles[0];
  const cookieMcVersion = currentProfileForCookie?.mcVersion;
  const cookieLoader = currentProfileForCookie?.loader;
  useEffect(() => {
    if (!hasHydrated) return;
    if (!cookieMcVersion || !cookieLoader) return;
    try {
      const value = encodeURIComponent(
        JSON.stringify({
          mcVersion: cookieMcVersion,
          loader: cookieLoader
        })
      );
      // 1 年間有効、path=/ でサイト全体、SameSite=Lax (通常アクセスで送信)
      // Secure フラグを常時付与。
      //   - 本番 (Vercel) では HTTPS 強制なので必須ではないが、明示することで
      //     セキュリティ姿勢を強化 & 万一 HTTPS でない代替ホスティングにも耐性
      //   - localhost dev はブラウザ仕様上 Secure 要件から除外されるので副作用なし
      document.cookie = `dropmod_active_profile=${value}; path=/; max-age=31536000; SameSite=Lax; Secure`;
    } catch (e) {
      console.warn('[DropMod] cookie 書き込みに失敗:', e);
    }
  }, [hasHydrated, cookieMcVersion, cookieLoader]);

  // ---------------------------------------------------------------------
  // profiles が空配列になった場合の安全弁
  //
  // 通常は handleDeleteProfile で「最低1件」を保証しているが、
  // 破損 LocalStorage や外部要因で 0 件になった場合、下の
  //   currentProfile = profiles.find(...) || profiles[0]
  // が undefined になり、その後 currentProfile.mods.length などで
  // アプリ全体が TypeError → 真っ暗になる。
  // ここでフォールバックのデフォルトプロファイルを自動生成して復旧する。
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!hasHydrated) return;
    if (profiles.length === 0) {
      const fallbackProfile: Profile = {
        id: generateId('default-profile-recovered'),
        name: '既定プロファイル',
        mcVersion: '1.20.1',
        loader: 'Fabric',
        description: 'データ復旧により自動生成されたプロファイル',
        mods: []
      };
      setProfiles([fallbackProfile]);
      setCurrentProfileId(fallbackProfile.id);
      showToast('プロファイルが失われたため既定を復旧しました', 'warning');
    }
  }, [profiles.length, hasHydrated, showToast, setProfiles, setCurrentProfileId]);

  // 常に非 undefined を保証: find が失敗しても最低限のフォールバックを返す
  const currentProfile: Profile =
    profiles.find((p) => p.id === currentProfileId) ||
    profiles[0] || {
      id: 'transient-fallback',
      name: '既定プロファイル',
      mcVersion: '1.20.1',
      loader: 'Fabric',
      description: '',
      mods: []
    };

  // ------------------------------------------------------------------
  // 全 handle* 関数を useCallback でラップ
  //
  // これらは AppShell の contextValue useMemo の deps に入るため、
  // useCallback しないと毎レンダー新参照 → contextValue も毎レンダー新規
  // → 全 consumer (HomeInteractive / ModsPageClient / SettingsPageClient
  //   / ModDetailModalShell) が毎レンダー再レンダー。
  //
  // 依存性最小化のため、profilesRef.current / currentProfileIdRef.current を
  // 使って最新値を参照する (deps から profiles / currentProfileId を除外可)。
  // showToast / confirmDialog は上位で useCallback 済 (useToasts / useConfirm)。
  // ------------------------------------------------------------------
  const handleSwitchProfile = useCallback(
    (id: string) => {
      setCurrentProfileId(id);
      const p = profilesRef.current.find((x) => x.id === id);
      if (p) showToast(`「${p.name}」に切替`, 'info');
    },
    [showToast, setCurrentProfileId]
  );

  const handleCreateProfile = useCallback(
    (
      name: string,
      mcVersion: string,
      loader: string,
      description: string,
      mods: ModItem[] = []
    ) => {
      const newId = generateId('profile');
      const newProfile: Profile = { id: newId, name, mcVersion, loader, description, mods };
      setProfiles((prev) => [...prev, newProfile]);
      setCurrentProfileId(newId);
      showToast(
        `プロファイル「${name}」を作成しました${mods.length > 0 ? ` (${mods.length} 個のMod入り)` : ''}`,
        'success'
      );
    },
    [showToast, setProfiles, setCurrentProfileId]
  );

  const handleDuplicateProfile = useCallback(() => {
    // Ref 経由で最新の currentProfile を取得 (stale closure 回避)
    const latestId = currentProfileIdRef.current;
    const latest =
      profilesRef.current.find((p) => p.id === latestId) || profilesRef.current[0];
    if (!latest) return;
    const newId = generateId('profile');
    const duplicated: Profile = {
      ...latest,
      id: newId,
      name: `${latest.name} (コピー)`,
      mods: JSON.parse(JSON.stringify(latest.mods))
    };
    setProfiles((prev) => [...prev, duplicated]);
    setCurrentProfileId(newId);
    showToast(`「${duplicated.name}」を作成しました`, 'success');
  }, [showToast, setProfiles, setCurrentProfileId]);

  const handleSaveEditedProfile = useCallback(
    (name: string, mcVersion: string, loader: string, description: string) => {
      const targetId = currentProfileIdRef.current;
      const before = profilesRef.current.find((p) => p.id === targetId);
      const compatChanged =
        before && (before.mcVersion !== mcVersion || before.loader !== loader) && before.mods.length > 0;

      setProfiles((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, name, mcVersion, loader, description } : p))
      );
      showToast('プロファイルを更新しました', 'success');
      if (compatChanged) {
        showToast(
          'MC/ローダーを変更しました。「選択中のMod」タブでバージョン再選択を推奨',
          'warning'
        );
      }
    },
    [showToast, setProfiles]
  );

  const handleDeleteProfile = useCallback(
    async (id: string) => {
      if (profilesRef.current.length <= 1) {
        showToast('最低1つのプロファイルが必要です', 'warning');
        return;
      }
      const target = profilesRef.current.find((p) => p.id === id);
      const ok = await confirmDialog({
        title: 'プロファイルを削除しますか？',
        message: `「${target?.name || '(名称未設定)'}」を削除します。\nこの操作は取り消せません。`,
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
        danger: true
      });
      if (!ok) return;
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (currentProfileIdRef.current === id) {
        const remaining = profilesRef.current.filter((p) => p.id !== id);
        if (remaining[0]) setCurrentProfileId(remaining[0].id);
      }
      showToast('プロファイルを削除しました', 'info');
    },
    [showToast, confirmDialog, setProfiles, setCurrentProfileId]
  );

  const handleToggleMod = useCallback(async (projectId: string, e?: React.MouseEvent, silent = false) => {
    if (e && e.stopPropagation) e.stopPropagation();

    // 同一 projectId への並列トグル呼び出しを防止 (連打・重複クリック対策)
    if (toggleInFlightRef.current.has(projectId)) return;
    toggleInFlightRef.current.add(projectId);

    try {
      // --- Ref 経由で常に最新の profiles / currentProfileId を読む (stale closure 対策) ---
      const latestProfileId = currentProfileIdRef.current;
      const latestProfile =
        profilesRef.current.find((p) => p.id === latestProfileId) || profilesRef.current[0];
      if (!latestProfile) return;

      const existsIndex = latestProfile.mods.findIndex(
        (m) => m.id === projectId || m.slug === projectId
      );

    if (existsIndex >= 0) {
      // --- 削除 ---
      // 配列アクセスの結果を optional chaining で扱う
      const removed = latestProfile.mods[existsIndex];
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === latestProfileId
            ? { ...p, mods: p.mods.filter((m) => m.id !== projectId && m.slug !== projectId) }
            : p
        )
      );
      if (!silent) showToast(`「${removed?.title || 'Mod'}」を削除しました`, 'info');
    } else {
      // --- 追加 ---
      if (!silent) showToast('ModrinthからMod情報を取得中...', 'info');
      try {
        // C7-2 修正: fetchModrinth 直呼びから queryClient.fetchQuery に置換。
        //   - 同じ project ID の 2 回目以降はキャッシュヒットで即返却
        //   - Dexie apiCache persister 経由でオフラインでも取得可能
        //   - staleTime 15 分 (useProjectQuery と同じ)
        const projectPromise = queryClient.fetchQuery({
          queryKey: queryKeys.project(projectId),
          queryFn: ({ signal }) =>
            fetchModrinth<any>(`/project/${projectId}`, undefined, { signal }),
          staleTime: 15 * 60 * 1000
        });

        // 「追加時点で見えているプロファイル」ではなく、
        // fetch 完了時点で最新のプロファイルを基準に version を選ぶ
        // (fetch中にユーザーが mcVersion/loader を変えたケースを吸収)
        const project = await projectPromise;

        const profileAtVersionFetch =
          profilesRef.current.find((p) => p.id === currentProfileIdRef.current) ||
          latestProfile;

        const versionRes = await fetchStableModVersion(projectId, profileAtVersionFetch);

        if (
          !versionRes ||
          !versionRes.targetVersion ||
          !versionRes.targetVersion.files ||
          versionRes.targetVersion.files.length === 0
        ) {
          if (!silent) showToast('利用可能な.jarファイルが見つかりませんでした', 'warning');
          return;
        }

        const targetVersion = versionRes.targetVersion;
        const primaryFile =
          targetVersion.files.find((f: any) => f.primary) || targetVersion.files[0];

        // 上で files.length===0 は既に return しているが
        // 配列アクセスの戻り値は T | undefined 型なので明示ガード。
        if (!primaryFile) {
          if (!silent) showToast('利用可能な.jarファイルが見つかりませんでした', 'warning');
          return;
        }

        const modObj: ModItem = {
          id: project.id,
          slug: project.slug,
          title: project.title,
          description: project.description,
          icon_url: project.icon_url,
          author: project.author || 'Modrinth',
          category:
            (project.display_categories && project.display_categories[0]) ||
            (project.categories && project.categories[0]) ||
            'mod',
          selectedVersionId: targetVersion.id,
          selectedVersionNumber: targetVersion.version_number,
          versionType: targetVersion.version_type || 'release',
          fileUrl: primaryFile.url,
          filename: primaryFile.filename
        };

        // --- functional updater 内で「まだ追加されていないか」を再チェック ---
        // API 呼び出し中に別経路で追加されていた場合は二重追加しない。
        let alreadyAdded = false;
        setProfiles((prev) =>
          prev.map((p) => {
            if (p.id !== currentProfileIdRef.current) return p;
            const dup = p.mods.some(
              (m) => m.id === project.id || (project.slug && m.slug === project.slug)
            );
            if (dup) {
              alreadyAdded = true;
              return p;
            }
            return { ...p, mods: [...p.mods, modObj] };
          })
        );

        if (!silent) {
          if (alreadyAdded) {
            showToast(`「${project.title}」は既に追加されています`, 'info');
          } else {
            showToast(`「${project.title}」を追加しました！`, 'success');
          }
        }
      } catch (err) {
        if (!silent) showToast('Modの追加に失敗しました', 'warning');
      }
    }
    } finally {
      toggleInFlightRef.current.delete(projectId);
    }
  }, [showToast, setProfiles, queryClient]);

  const handleUpdateModVersion = useCallback(
    async (projectId: string, versionId: string) => {
      const latestProfileId = currentProfileIdRef.current;
      const latestProfile =
        profilesRef.current.find((p) => p.id === latestProfileId) || profilesRef.current[0];
      const mod = latestProfile?.mods.find((m) => m.id === projectId || m.slug === projectId);
      if (!mod) return;

      try {
        // C7-2 修正: fetchModrinth 直呼び → queryClient.fetchQuery で
        //   同じ versionId は 24h キャッシュヒット (Dexie apiCache 永続化)
        const versionData = await queryClient.fetchQuery({
          queryKey: queryKeys.version(versionId),
          queryFn: ({ signal }) =>
            fetchModrinth<any>(`/version/${versionId}`, undefined, { signal }),
          staleTime: 60 * 60 * 1000 // 1h (version は project より変わりにくい)
        });
        if (versionData && versionData.files && versionData.files.length > 0) {
          const primaryFile = versionData.files.find((f: any) => f.primary) || versionData.files[0];

          setProfiles((prev) =>
            prev.map((p) =>
              p.id === currentProfileIdRef.current
                ? {
                    ...p,
                    mods: p.mods.map((m) =>
                      m.id === projectId || m.slug === projectId
                        ? {
                            ...m,
                            selectedVersionId: versionData.id,
                            selectedVersionNumber: versionData.version_number,
                            versionType: versionData.version_type || 'release',
                            fileUrl: primaryFile.url,
                            filename: primaryFile.filename
                          }
                        : m
                    )
                  }
                : p
            )
          );
          showToast(`「${mod.title}」を Ver ${versionData.version_number} に更新`, 'success');
        }
      } catch (e) {
        showToast('バージョンの更新に失敗しました', 'warning');
      }
    },
    [showToast, setProfiles, queryClient]
  );

  const handleRemoveAllMods = useCallback(async () => {
    const latestId = currentProfileIdRef.current;
    const latest =
      profilesRef.current.find((p) => p.id === latestId) || profilesRef.current[0];
    if (!latest || latest.mods.length === 0) return;
    const ok = await confirmDialog({
      title: '全てのModを削除しますか？',
      message: `プロファイル「${latest.name}」から ${latest.mods.length} 個のModを全て削除します。\nこの操作は取り消せません。`,
      confirmLabel: 'すべて削除',
      cancelLabel: 'キャンセル',
      danger: true
    });
    if (!ok) return;
    setProfiles((prev) =>
      prev.map((p) => (p.id === currentProfileIdRef.current ? { ...p, mods: [] } : p))
    );
    showToast('すべてのModを削除しました', 'info');
  }, [showToast, confirmDialog, setProfiles]);

  return {
    profiles,
    setProfiles,
    currentProfileId,
    setCurrentProfileId,
    currentProfile,
    handleSwitchProfile,
    handleCreateProfile,
    handleDuplicateProfile,
    handleSaveEditedProfile,
    handleDeleteProfile,
    handleToggleMod,
    handleUpdateModVersion,
    handleRemoveAllMods
  };
};