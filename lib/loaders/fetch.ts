import {
  getLoaderVersions,
  isLoaderId,
  mergeVersionLists,
  withPreferredVersion
} from '@/lib/loaders/versions';

export async function fetchLoaderVersions(
  loader: string,
  mcVersion?: string,
  preferred?: string
): Promise<string[]> {
  const fallback = getLoaderVersions(loader);
  if (!isLoaderId(loader)) return withPreferredVersion(fallback, preferred);

  try {
    const params = new URLSearchParams({ loader });
    if (mcVersion) params.set('mc', mcVersion);
    const res = await fetch(`/api/loaders/versions?${params.toString()}`, {
      signal: AbortSignal.timeout(12_000)
    });
    if (!res.ok) return withPreferredVersion(fallback, preferred);
    const data: unknown = await res.json();
    const raw =
      data && typeof data === 'object' && Array.isArray((data as { versions?: unknown }).versions)
        ? ((data as { versions: unknown[] }).versions)
        : [];
    const versions = raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return withPreferredVersion(mergeVersionLists(versions, fallback), preferred);
  } catch {
    return withPreferredVersion(fallback, preferred);
  }
}
