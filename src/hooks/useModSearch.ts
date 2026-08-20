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
  // 初期値 true にして「マウント直後の1瞬に『見つかりません』が出る」現象を回避
  // (最初の絞り込みuseEffect が発火するまではスケルトンを見せる)
  const [isLoadingMods, setIsLoadingMods] = useState<boolean>(true);
  const [hasMoreMods, setHasMoreMods] = useState<boolean>(true);
  const [searchOffset, setSearchOffset] = useState<number>(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchLimit = 24;

  // sentinel は callback ref にして「マウント/アンマウント」を明確に検知
  // useRef だと HomeTab の切替再マウントで observer が再attach されない不具合を防ぐ
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelEl(node);
  }, []);

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

  // ------------------------------------------------------------------
  // stale closure 対策 (バグA):
  //   各 useEffect が古い executeSearch を掴んで古い state (sortBy 等)
  //   で検索を発射しないよう、常に最新の関数を Ref に保持し、useEffect
  //   側では ref 経由で呼び出す。
  //   → useEffect の deps に executeSearch を含めなくてよく、無限ループを
  //     避けつつ最新パラメータで確実に発火できる。
  // ------------------------------------------------------------------

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
      setSearchError(null);

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

        if (data && Array.isArray(data.hits)) {
          setHasMoreMods(data.hits.length >= searchLimit);
          setSearchOffset(offset + data.hits.length);
          if (append) {
            // 重複 project_id を除外して積み増し
            //   (万一 race で古いページと重複してもReact key 衝突を防ぐ)
            setHits((prev) => {
              const existingIds = new Set(prev.map((h) => h.project_id));
              const uniqueNew = data.hits.filter(
                (h) => h && h.project_id && !existingIds.has(h.project_id)
              );
              return [...prev, ...uniqueNew];
            });
          } else {
            // 初期取得側でも念のため重複を除去 (プロキシ経由が同じ結果を返す可能性)
            const seen = new Set<string>();
            const uniq = data.hits.filter((h) => {
              if (!h || !h.project_id) return false;
              if (seen.has(h.project_id)) return false;
              seen.add(h.project_id);
              return true;
            });
            setHits(uniq);
          }
        } else {
          if (!append) setHits([]);
          setHasMoreMods(false);
        }
      } catch (e: any) {
        // AbortError は意図的中断 → toast も loading フラグ解除も要らない
        if (e?.name === 'AbortError') return;

        if (mySeq !== requestSeqRef.current) return;
        isLoadingRef.current = false;
        setIsLoadingMods(false);
        // append=false 時は空リストにしてスケルトンを解除 + エラー状態を保持
        if (!append) {
          setHits([]);
          setHasMoreMods(false);
        }
        setSearchError(e?.message || 'Modrinthからのデータ取得に失敗しました');
        showToast('Modrinthからのデータ取得に失敗しました', 'warning');
      }
    },
    [
      sortBy,
      currentProfile.mcVersion,
      currentProfile.loader,
      selectedCategory,
      searchInput,
      showToast
    ]
  );

  // 常に最新の executeSearch を Ref に保持 (render中に同期セット)
  const executeSearchRef = useRef(executeSearch);
  executeSearchRef.current = executeSearch;

  // 絞り込み変更時: 即時に新規検索 (offset=0 / append=false)
  useEffect(() => {
    setSearchOffset(0);
    setHasMoreMods(true);
    executeSearchRef.current(false, 0);
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
      executeSearchRef.current(false, 0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 無限スクロール (sentinel は callback ref なのでマウント/切替を確実に検知)
  useEffect(() => {
    if (!sentinelEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMoreMods &&
          !isLoadingRef.current &&
          activeTab === 'home'
        ) {
          executeSearchRef.current(true, searchOffset);
        }
      },
      { rootMargin: '800px 0px', threshold: 0.01 }
    );

    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl, hasMoreMods, activeTab, searchOffset]);

  // アンマウント時: 未完了のリクエストを中断
  useEffect(() => {
    return () => {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
    };
  }, []);

  // 手動で検索を再試行するためのハンドラ
  const retrySearch = useCallback(() => {
    setSearchOffset(0);
    setHasMoreMods(true);
    executeSearchRef.current(false, 0);
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
    searchError,
    retrySearch,
    sentinelRef
  };
};
