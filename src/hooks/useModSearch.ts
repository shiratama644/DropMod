import { useState, useEffect, useRef, useCallback } from 'react';
import { ModrinthHit, Profile, TabName } from '../types';
import { fetchModrinth, fetchLatestMinecraftVersions } from '../services/api';

export const useModSearch = (
  currentProfile: Profile,
  activeTab: TabName,
  showToast: (message: string, type?: 'info' | 'success' | 'warning') => void
) => {
  const [mcVersions, setMcVersions] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('popular');
  const [searchInput, setSearchInput] = useState<string>('');
  const [hits, setHits] = useState<ModrinthHit[]>([]);
  const [isLoadingMods, setIsLoadingMods] = useState<boolean>(false);
  const [hasMoreMods, setHasMoreMods] = useState<boolean>(true);
  const [searchOffset, setSearchOffset] = useState<number>(0);
  const searchLimit = 24;

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLatestMinecraftVersions().then((versions) => {
      setMcVersions(versions);
    });
  }, []);

  const executeSearch = useCallback(
    async (append = false, offset = 0) => {
      if (isLoadingMods) return;
      setIsLoadingMods(true);

      let indexParam = 'downloads';
      if (sortBy === 'relevance') indexParam = 'relevance';
      if (sortBy === 'updated') indexParam = 'updated';
      if (sortBy === 'newest') indexParam = 'newest';

      const facets = [['project_type:mod']];
      if (currentProfile.mcVersion) facets.push([`versions:${currentProfile.mcVersion}`]);
      if (currentProfile.loader) facets.push([`categories:${currentProfile.loader.toLowerCase()}`]);
      if (selectedCategory && selectedCategory !== 'All') facets.push([`categories:${selectedCategory}`]);

      try {
        const data = await fetchModrinth<{ hits: ModrinthHit[] }>('/search', {
          query: searchInput.trim(),
          facets: JSON.stringify(facets),
          index: indexParam,
          limit: searchLimit,
          offset: offset
        });

        setIsLoadingMods(false);
        if (data.hits) {
          if (data.hits.length < searchLimit) setHasMoreMods(false);
          else setHasMoreMods(true);

          setSearchOffset(offset + data.hits.length);
          if (append) {
            setHits((prev) => [...prev, ...data.hits]);
          } else {
            setHits(data.hits);
          }
        } else {
          setHasMoreMods(false);
        }
      } catch (e) {
        setIsLoadingMods(false);
        showToast('Modrinthからのデータ取得に失敗しました', 'warning');
      }
    },
    [isLoadingMods, sortBy, currentProfile.mcVersion, currentProfile.loader, selectedCategory, searchInput, showToast]
  );

  useEffect(() => {
    setSearchOffset(0);
    setHasMoreMods(true);
    executeSearch(false, 0);
  }, [currentProfile.mcVersion, currentProfile.loader, selectedCategory, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchOffset(0);
      setHasMoreMods(true);
      executeSearch(false, 0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreMods && !isLoadingMods && activeTab === 'home') {
          executeSearch(true, searchOffset);
        }
      },
      { rootMargin: '800px 0px', threshold: 0.01 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreMods, isLoadingMods, activeTab, searchOffset, executeSearch]);

  return {
    mcVersions,
    selectedCategory,
    setSelectedCategory,
    sortBy,
    setSortBy,
    searchInput,
    setSearchInput,
    hits,
    isLoadingMods,
    hasMoreMods,
    sentinelRef
  };
};