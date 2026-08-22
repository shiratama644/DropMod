'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Profile, ModItem, ThemeMode } from '@/types';
import { fetchModrinth, fetchStableModVersion } from '@/lib/modrinth/client';
import type { ConfirmDialogOptions } from '@/components/ConfirmDialog';
import { generateId } from '@/lib/utils/id';

type ConfirmFn = (options: ConfirmDialogOptions) => Promise<boolean>;

export const useProfiles = (
  theme: ThemeMode,
  setThemeState: (theme: ThemeMode) => void,
  showToast: (message: string, type?: 'info' | 'success' | 'warning') => void,
  confirmDialog: ConfirmFn
) => {
  const [currentProfileId, setCurrentProfileId] = useState<string>('default-profile');
  const [profiles, setProfiles] = useState<Profile[]>([
    {
      id: 'default-profile',
      name: '1.20.1 Fabric 軽量化・ユーティリティ',
      mcVersion: '1.20.1',
      loader: 'Fabric',
      description: 'Modrinthから直接Modを取得・ダウンロードする標準構成',
      mods: []
    }
  ]);

  // ------------------------------------------------------------------
  // 最新state参照用 Ref (stale closure 対策)
  //
  // handleToggleMod のような非同期処理の中では、レンダー時点の profiles
  // をキャプチャした値ではなく、常に最新の値を参照する必要がある。
  // AutoFix や連続操作で古い state を見て「未追加」判定してしまい、
  // 追加⇔削除トグルが暴発するのを防ぐ。
  //
  // ⚠️ ref の更新は useEffect ではなく render 中に同期で行う
  //    (useEffect は render 後に非同期で走るため、同じレンダーサイクル内で
  //     発火した非同期処理が古い ref を掴む race を防ぐ)。
  // ------------------------------------------------------------------
  const profilesRef = useRef<Profile[]>(profiles);
  const currentProfileIdRef = useRef<string>(currentProfileId);
  profilesRef.current = profiles;
  currentProfileIdRef.current = currentProfileId;

  // handleToggleMod の並列呼び出し防止用 (同一 projectId への連打で
  // 重複トグルが起きないようにする)
  const toggleInFlightRef = useRef<Set<string>>(new Set());

  // ------------------------------------------------------------------
  // Hydration ゲート (M-6)
  //
  // 復元 useEffect と保存 useEffect が同時にマウントで走ると、復元完了前
  // に「初期state (デフォルトプロファイル1個)」を localStorage へ書き
  // 戻してしまうレースが発生し得る。hasHydrated が true になるまで
  // 保存側は動作させない。
  // ------------------------------------------------------------------
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  // -------------------------------------------------------------------
  // 破損 LocalStorage への防御
  //
  // - profiles が配列でない / 空配列 の場合はデフォルトへフォールバック
  // - 各 profile が必要フィールドを欠く場合は補完
  // - currentProfileId が存在しないプロファイルを指す場合は先頭に戻す
  // これにより、外部要因で壊れたデータでもアプリ全体クラッシュしない。
  // -------------------------------------------------------------------
  const sanitizeLoadedState = (raw: any): {
    theme?: ThemeMode;
    currentProfileId?: string;
    profiles?: Profile[];
  } | null => {
    if (!raw || typeof raw !== 'object') return null;

    let normalizedProfiles: Profile[] | undefined;
    if (Array.isArray(raw.profiles)) {
      normalizedProfiles = raw.profiles
        .filter((p: any) => p && typeof p === 'object' && typeof p.id === 'string')
        .map((p: any) => ({
          id: String(p.id),
          name: typeof p.name === 'string' ? p.name : '(名称未設定)',
          mcVersion: typeof p.mcVersion === 'string' ? p.mcVersion : '1.20.1',
          loader: typeof p.loader === 'string' ? p.loader : 'Fabric',
          description: typeof p.description === 'string' ? p.description : '',
          mods: Array.isArray(p.mods)
            ? p.mods.filter((m: any) => m && typeof m === 'object' && typeof m.id === 'string')
            : []
        }));
      if (normalizedProfiles && normalizedProfiles.length === 0) {
        normalizedProfiles = undefined;
      }
    }

    let normalizedTheme: ThemeMode | undefined;
    if (raw.theme === 'dark' || raw.theme === 'light') normalizedTheme = raw.theme;

    let normalizedCurrentId: string | undefined;
    if (typeof raw.currentProfileId === 'string') {
      if (normalizedProfiles && normalizedProfiles.some((p) => p.id === raw.currentProfileId)) {
        normalizedCurrentId = raw.currentProfileId;
      } else if (normalizedProfiles && normalizedProfiles[0]) {
        normalizedCurrentId = normalizedProfiles[0].id;
      }
    }

    return {
      theme: normalizedTheme,
      currentProfileId: normalizedCurrentId,
      profiles: normalizedProfiles
    };
  };

  // LocalStorage から復元 (旧キー `craftforge_state_v2` からの自動移行を含む)
  useEffect(() => {
    const STORAGE_KEY = 'dropmod_state_v2';
    const LEGACY_KEY = 'craftforge_state_v2';

    let saved = localStorage.getItem(STORAGE_KEY);

    // 新キーが無ければ旧キーから読み取り、成功したら新キーへコピーして旧キーを削除
    if (!saved) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        try {
          localStorage.setItem(STORAGE_KEY, legacy);
          localStorage.removeItem(LEGACY_KEY);
          saved = legacy;
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const sanitized = sanitizeLoadedState(parsed);
        if (sanitized) {
          if (sanitized.theme) setThemeState(sanitized.theme);
          if (sanitized.profiles && sanitized.profiles.length > 0) {
            setProfiles(sanitized.profiles);
          }
          if (sanitized.currentProfileId) {
            setCurrentProfileId(sanitized.currentProfileId);
          }
        }
      } catch (e) {
        console.error('[DropMod] LocalStorage の復元に失敗、デフォルトで続行:', e);
      }
    }
    // 復元完了 → 以降は保存 useEffect が動く
    setHasHydrated(true);
  }, [setThemeState]);

  // LocalStorage へ保存 (hydration完了後のみ)
  useEffect(() => {
    if (!hasHydrated) return;
    try {
      localStorage.setItem(
        'dropmod_state_v2',
        JSON.stringify({ theme, currentProfileId, profiles })
      );
    } catch (e) {
      // QuotaExceededError 等: 保存できなくてもアプリはクラッシュさせない
      console.warn('[DropMod] LocalStorage への保存に失敗:', e);
    }
  }, [hasHydrated, theme, currentProfileId, profiles]);

  // ---------------------------------------------------------------------
  // H4-5 修正: SSR プロファイル固定によるちらつき解消のため cookie に書き込み
  //
  // Home ページの SSR (Server Component) は cookies() でこの値を読み取り、
  // 実際のユーザープロファイル (LocalStorage 由来) に合わせた初期 24 件を返す。
  // これで hydration 後の再検索によるちらつきが起きなくなる。
  //
  // 書き込むのは mcVersion / loader のみ (SSR 検索に必要な最小情報)。
  // 個人情報や大きなデータは含めない (cookie サイズ制限のため)。
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!hasHydrated) return;
    const currentProfileForCookie =
      profilesRef.current.find((p) => p.id === currentProfileIdRef.current) ||
      profilesRef.current[0];
    if (!currentProfileForCookie) return;
    try {
      const value = encodeURIComponent(
        JSON.stringify({
          mcVersion: currentProfileForCookie.mcVersion,
          loader: currentProfileForCookie.loader
        })
      );
      // 1 年間有効、path=/ でサイト全体、SameSite=Lax (通常アクセスで送信)
      document.cookie = `dropmod_active_profile=${value}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (e) {
      console.warn('[DropMod] cookie 書き込みに失敗:', e);
    }
  }, [hasHydrated, currentProfileId, profiles]);

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
  }, [profiles.length, hasHydrated, showToast]);

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
  // H4-4 修正: 全 handle* 関数を useCallback でラップ
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
    [showToast]
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
    [showToast]
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
  }, [showToast]);

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
    [showToast]
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
    [showToast, confirmDialog]
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
      const removed = latestProfile.mods[existsIndex];
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === latestProfileId
            ? { ...p, mods: p.mods.filter((m) => m.id !== projectId && m.slug !== projectId) }
            : p
        )
      );
      if (!silent) showToast(`「${removed.title || 'Mod'}」を削除しました`, 'info');
    } else {
      // --- 追加 ---
      if (!silent) showToast('ModrinthからMod情報を取得中...', 'info');
      try {
        // Modrinth /project の取得は先に開始 (project ID は不変)
        const projectPromise = fetchModrinth<any>(`/project/${projectId}`);

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
  }, [showToast]);

  const handleUpdateModVersion = useCallback(
    async (projectId: string, versionId: string) => {
      const latestProfileId = currentProfileIdRef.current;
      const latestProfile =
        profilesRef.current.find((p) => p.id === latestProfileId) || profilesRef.current[0];
      const mod = latestProfile?.mods.find((m) => m.id === projectId || m.slug === projectId);
      if (!mod) return;

      try {
        const versionData = await fetchModrinth<any>(`/version/${versionId}`);
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
    [showToast]
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
  }, [showToast, confirmDialog]);

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