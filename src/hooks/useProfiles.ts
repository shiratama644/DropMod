import { useState, useEffect } from 'react';
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

  // LocalStorage から復元
  useEffect(() => {
    const saved = localStorage.getItem('craftforge_state_v2');
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
  }, [setThemeState]);

  // LocalStorage へ保存
  useEffect(() => {
    localStorage.setItem(
      'craftforge_state_v2',
      JSON.stringify({ theme, currentProfileId, profiles })
    );
  }, [theme, currentProfileId, profiles]);

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

    const existsIndex = currentProfile.mods.findIndex((m) => m.id === projectId || m.slug === projectId);

    if (existsIndex >= 0) {
      const removed = currentProfile.mods[existsIndex];
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === currentProfileId
            ? { ...p, mods: p.mods.filter((m) => m.id !== projectId && m.slug !== projectId) }
            : p
        )
      );
      if (!silent) showToast(`「${removed.title || 'Mod'}」を削除しました`, 'info');
    } else {
      if (!silent) showToast('ModrinthからMod情報を取得中...', 'info');
      try {
        const project = await fetchModrinth<any>(`/project/${projectId}`);
        const versionRes = await fetchStableModVersion(projectId, currentProfile);

        if (!versionRes || !versionRes.targetVersion || !versionRes.targetVersion.files || versionRes.targetVersion.files.length === 0) {
          if (!silent) showToast('利用可能な.jarファイルが見つかりませんでした', 'warning');
          return;
        }

        const targetVersion = versionRes.targetVersion;
        const primaryFile = targetVersion.files.find((f: any) => f.primary) || targetVersion.files[0];

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

        setProfiles((prev) =>
          prev.map((p) => (p.id === currentProfileId ? { ...p, mods: [...p.mods, modObj] } : p))
        );
        if (!silent) showToast(`「${project.title}」を追加しました！`, 'success');
      } catch (err) {
        if (!silent) showToast('Modの追加に失敗しました', 'warning');
      }
    }
  };

  const handleUpdateModVersion = async (projectId: string, versionId: string) => {
    const mod = currentProfile.mods.find((m) => m.id === projectId || m.slug === projectId);
    if (!mod) return;

    try {
      const versionData = await fetchModrinth<any>(`/version/${versionId}`);
      if (versionData && versionData.files && versionData.files.length > 0) {
        const primaryFile = versionData.files.find((f: any) => f.primary) || versionData.files[0];

        setProfiles((prev) =>
          prev.map((p) =>
            p.id === currentProfileId
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