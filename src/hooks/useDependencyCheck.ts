import { useState, useCallback, useEffect, useRef } from 'react';
import { Profile } from '../types';
import { fetchModrinth } from '../services/api';

export const useDependencyCheck = (currentProfile: Profile) => {
  const [hasDepWarning, setHasDepWarning] = useState<boolean>(false);

  // Store currentProfile in a ref to always access the latest state inside the interval
  const profileRef = useRef<Profile>(currentProfile);
  useEffect(() => {
    profileRef.current = currentProfile;
  }, [currentProfile]);

  const runBackgroundDepCheck = useCallback(async () => {
    const profile = profileRef.current;
    if (!profile.mods || profile.mods.length === 0) {
      setHasDepWarning(false);
      return;
    }
    try {
      const versionIds = profile.mods
        .map((m) => m.selectedVersionId)
        .filter((id) => id && id !== 'latest') as string[];
      const versionMap = new Map<string, any>();

      if (versionIds.length > 0) {
        try {
          const batchVersions = await fetchModrinth<any[]>('/versions', { ids: JSON.stringify(versionIds) });
          batchVersions.forEach((v) => versionMap.set(v.id, v));
        } catch (e) {}
      }

      const installedProjectSet = new Set<string>();
      profile.mods.forEach((m) => {
        if (m.id) installedProjectSet.add(m.id);
        if (m.slug) installedProjectSet.add(m.slug);
      });

      let warning = false;
      for (const mod of profile.mods) {
        const vData = versionMap.get(mod.selectedVersionId!);
        if (vData && vData.dependencies) {
          for (const dep of vData.dependencies) {
            if (dep.dependency_type === 'required' && dep.project_id && !installedProjectSet.has(dep.project_id)) {
              warning = true;
              break;
            }
            if (dep.dependency_type === 'incompatible' && dep.project_id && installedProjectSet.has(dep.project_id)) {
              warning = true;
              break;
            }
          }
        }
        if (warning) break;
      }
      setHasDepWarning(warning);
    } catch (e) {}
  }, []);

  useEffect(() => {
    // Initial run
    runBackgroundDepCheck();

    // Check periodically every 5 seconds (5000ms)
    const interval = setInterval(() => {
      runBackgroundDepCheck();
    }, 5000);

    return () => clearInterval(interval);
  }, [runBackgroundDepCheck]);

  return {
    hasDepWarning,
    runBackgroundDepCheck
  };
};