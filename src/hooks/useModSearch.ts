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

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ------------------------------------------------------------------
  // レースコンディション対策 (H-7)
  //   - activeAbortRef: 現在 in-flight のリクエストを abort するための controller
  //   - requestSeqRef: リクエスト毎にインクリメントする sequence 番号。
  //                    レスポンス到着時に latestSeq と一致しなければ破棄。
  //   - isLoadingRef: setState は非同期 → 直近の loading 状態を Ref で確実に見る
  // ------------------------------------------------------------------
  const activeAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);
  const isLoadingRef = useRef<boolean>(false);

  useEffect(() => {
    fetchLatestMinecraftVersions().then((versions) => {
      setMcVersions(versions);
    });
  }, []);

  const executeSearch = useCallback(
    async (append = false, offset = 0) => {
      // append=false (絞り込み変更 / 検索クエリ変更) の場合は前のリクエストを強制中断
      // append=true (無限スクロール) の場合は既存フェッチ中ならスキップ (二重発射防止)
      if (append) {
        if (isLoadingRef.current) return;
      } else {
        if (activeAbortRef.current) {
          activeAbortRef.current.abort();
        }
      }

      const mySeq = ++requestSeqRef.current;
      const controller = new AbortController();
      activeAbortRef.current = controller;

      isLoadingRef.current = true;
      setIsLoadingMods(true);

      let indexParam = 'downloads';
      if (sortBy === 'relevance') indexParam = 'relevance';
      if (sortBy === 'updated') indexParam = 'updated';
      if (sortBy === 'newest') indexParam = 'newest';

      const facets: string[][] = [['project_type:mod']];
      if (currentProfile.mcVersion) facets.push([`versions:${currentProfile.mcVersion}`]);
      if (currentProfile.loader)
        facets.push([`categories:${currentProfile.loader.toLowerCase()}`]);
      if (selectedCategory && selectedCategory !== 'All')
        facets.push([`categories:${selectedCategory}`]);

      try {
        const data = await fetchModrinth<{ hits: ModrinthHit[] }>(
          '/search',
          {
            query: searchInput.trim(),
            facets: JSON.stringify(facets),
            index: indexParam,
            limit: searchLimit,
            offset: offset
          },
          { signal: controller.signal }
        );

        // 古いレスポンスは破棄
        if (mySeq !== requestSeqRef.current) return;

        isLoadingRef.current = false;
        setIsLoadingMods(false);

        if (data.hits) {
          setHasMoreMods(data.hits.length >= searchLimit);
          setSearchOffset(offset + data.hits.length);
          if (append) {
            setHits((prev) => [...prev, ...data.hits]);
          } else {
            setHits(data.hits);
          }
        } else {
          setHasMoreMods(false);
        }
      } catch (e: any) {
        // AbortError は意図的中断 → toast も loading フラグ解除も要らない
        if (e?.name === 'AbortError') return;

        if (mySeq !== requestSeqRef.current) return;
        isLoadingRef.current = false;
        setIsLoadingMods(false);
        showToast('Modrinthからのデータ取得に失敗しました', 'warning');
      }
    },
    // isLoadingMods は Ref で見るので deps から外して useCallback を安定化
    [
      sortBy,
      currentProfile.mcVersion,
      currentProfile.loader,
      selectedCategory,
      searchInput,
      showToast
    ]
  );

  // 絞り込み変更時: 即時に新規検索 (offset=0 / append=false)
  useEffect(() => {
    setSearchOffset(0);
    setHasMoreMods(true);
    executeSearch(false, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile.mcVersion, currentProfile.loader, selectedCategory, sortBy]);

  // 検索文字列変更: 350ms debounce
  // M-7 対応: マウント直後は絞り込み用の useEffect が既に初回発火するので
  // 初回はスキップして二重発射を防ぐ。
  const isFirstSearchInputRun = useRef<boolean>(true);
  useEffect(() => {
    if (isFirstSearchInputRun.current) {
      isFirstSearchInputRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setSearchOffset(0);
      setHasMoreMods(true);
      executeSearch(false, 0);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // 無限スクロール
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMoreMods &&
          !isLoadingRef.current &&
          activeTab === 'home'
        ) {
          executeSearch(true, searchOffset);
        }
      },
      { rootMargin: '800px 0px', threshold: 0.01 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreMods, activeTab, searchOffset, executeSearch]);

  // アンマウント時: 未完了のリクエストを中断
  useEffect(() => {
    return () => {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
    };
  }, []);

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
