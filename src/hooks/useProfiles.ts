import { useState, useEffect, useRef } from 'react';
import { Profile, ModItem, ThemeMode } from '../types';
import { fetchModrinth, fetchStableModVersion } from '../services/api';
import type { ConfirmDialogOptions } from '../components/ConfirmDialog';

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
  // handleToggleMod のような非同期処理の中では、レンダー時点の profiles
  // をキャプチャした値ではなく、常に最新の値を参照する必要がある。
  // AutoFix や連続操作で古い state を見て「未追加」判定してしまい、
  // 追加⇔削除トグルが暴発するのを防ぐ。
  // ------------------------------------------------------------------
  const profilesRef = useRef<Profile[]>(profiles);
  const currentProfileIdRef = useRef<string>(currentProfileId);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);
  useEffect(() => {
    currentProfileIdRef.current = currentProfileId;
  }, [currentProfileId]);

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
        id: 'default-profile-recovered-' + Date.now(),
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

  const handleSwitchProfile = (id: string) => {
    setCurrentProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (p) showToast(`「${p.name}」に切替`, 'info');
  };

  const handleCreateProfile = (
    name: string,
    mcVersion: string,
    loader: string,
    description: string,
    mods: ModItem[] = []
  ) => {
    const newId = 'profile-' + Date.now();
    const newProfile: Profile = { id: newId, name, mcVersion, loader, description, mods };
    setProfiles((prev) => [...prev, newProfile]);
    setCurrentProfileId(newId);
    showToast(`プロファイル「${name}」を作成しました${mods.length > 0 ? ` (${mods.length} 個のMod入り)` : ''}`, 'success');
  };

  const handleDuplicateProfile = () => {
    const newId = 'profile-' + Date.now();
    const duplicated: Profile = {
      ...currentProfile,
      id: newId,
      name: `${currentProfile.name} (コピー)`,
      mods: JSON.parse(JSON.stringify(currentProfile.mods))
    };
    setProfiles((prev) => [...prev, duplicated]);
    setCurrentProfileId(newId);
    showToast(`「${duplicated.name}」を作成しました`, 'success');
  };

  const handleSaveEditedProfile = (name: string, mcVersion: string, loader: string, description: string) => {
    // 最新の currentProfileId を参照 (stale closure対策)
    const targetId = currentProfileIdRef.current;
    setProfiles((prev) =>
      prev.map((p) => (p.id === targetId ? { ...p, name, mcVersion, loader, description } : p))
    );
    showToast('プロファイルを更新しました', 'success');
  };

  const handleDeleteProfile = async (id: string) => {
    if (profiles.length <= 1) {
      showToast('最低1つのプロファイルが必要です', 'warning');
      return;
    }
    const target = profiles.find((p) => p.id === id);
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
  };

  const handleToggleMod = async (projectId: string, e?: React.MouseEvent, silent = false) => {
    if (e && e.stopPropagation) e.stopPropagation();

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
  };

  const handleUpdateModVersion = async (projectId: string, versionId: string) => {
    // Ref 経由で最新state参照 (stale closure対策)
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
  };

  const handleRemoveAllMods = async () => {
    if (currentProfile.mods.length === 0) return;
    const ok = await confirmDialog({
      title: '全てのModを削除しますか？',
      message: `プロファイル「${currentProfile.name}」から ${currentProfile.mods.length} 個のModを全て削除します。\nこの操作は取り消せません。`,
      confirmLabel: 'すべて削除',
      cancelLabel: 'キャンセル',
      danger: true
    });
    if (!ok) return;
    setProfiles((prev) =>
      prev.map((p) => (p.id === currentProfileIdRef.current ? { ...p, mods: [] } : p))
    );
    showToast('すべてのModを削除しました', 'info');
  };

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