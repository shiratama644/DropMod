import { useState, useEffect, useRef } from 'react';
import { Profile, ModItem, ThemeMode } from '../types';
import { fetchModrinth, fetchStableModVersion } from '../services/api';

export const useProfiles = (
  theme: ThemeMode,
  setThemeState: (theme: ThemeMode) => void,
  showToast: (message: string, type?: 'info' | 'success' | 'warning') => void
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
        if (parsed.theme) setThemeState(parsed.theme);
        if (parsed.currentProfileId) setCurrentProfileId(parsed.currentProfileId);
        if (parsed.profiles) setProfiles(parsed.profiles);
      } catch (e) {
        console.error(e);
      }
    }
    // 復元完了 → 以降は保存 useEffect が動く
    setHasHydrated(true);
  }, [setThemeState]);

  // LocalStorage へ保存 (hydration完了後のみ)
  useEffect(() => {
    if (!hasHydrated) return;
    localStorage.setItem(
      'dropmod_state_v2',
      JSON.stringify({ theme, currentProfileId, profiles })
    );
  }, [hasHydrated, theme, currentProfileId, profiles]);

  const currentProfile = profiles.find((p) => p.id === currentProfileId) || profiles[0];

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
    setProfiles((prev) =>
      prev.map((p) => (p.id === currentProfileId ? { ...p, name, mcVersion, loader, description } : p))
    );
    showToast('プロファイルを更新しました', 'success');
  };

  const handleDeleteProfile = (id: string) => {
    if (profiles.length <= 1) {
      showToast('最低1つのプロファイルが必要です', 'warning');
      return;
    }
    const target = profiles.find((p) => p.id === id);
    if (confirm(`プロファイル「${target?.name}」を削除しますか？`)) {
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (currentProfileId === id) {
        const remaining = profiles.filter((p) => p.id !== id);
        setCurrentProfileId(remaining[0].id);
      }
      showToast('プロファイルを削除しました', 'info');
    }
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
        const project = await fetchModrinth<any>(`/project/${projectId}`);
        const versionRes = await fetchStableModVersion(projectId, latestProfile);

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
        // またプロファイルが切り替わっていた場合は現在プロファイルに追加する
        // (currentProfileIdRef を再度参照)。
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

  const handleRemoveAllMods = () => {
    if (currentProfile.mods.length === 0) return;
    if (confirm(`プロファイル「${currentProfile.name}」のModをすべて削除しますか？`)) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === currentProfileId ? { ...p, mods: [] } : p))
      );
      showToast('すべてのModを削除しました', 'info');
    }
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