'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchLoaderVersions } from '../api/fetchLoaderVersions';
import { getLoaderVersions, withPreferredVersion } from '../utils/loaderVersions';

export function useLoaderVersionOptions(
  loader: string,
  mcVersion: string,
  isOpen: boolean,
  preferred?: string
): {
  versions: string[];
  options: Array<{ label: string; value: string }>;
  isLoading: boolean;
} {
  const [live, setLive] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    void fetchLoaderVersions(loader, mcVersion, preferred)
      .then((list) => {
        if (!cancelled) setLive(list);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, loader, mcVersion, preferred]);

  const versions = useMemo(() => {
    const base = live && live.length > 0 ? live : getLoaderVersions(loader);
    return withPreferredVersion(base, preferred);
  }, [live, loader, preferred]);

  const options = useMemo(() => {
    if (versions.length === 0) return [{ label: '未指定', value: '' }];
    return versions.map((v, i) => ({
      label: i === 0 ? `${v} (最新)` : v,
      value: v
    }));
  }, [versions]);

  return { versions, options, isLoading };
}
