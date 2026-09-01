/**
 * ローダーバージョンのパース / マージ / フォールバック。
 * ライブ取得は `features/profiles/api/fetchLoaderVersions.ts` と `/api/loaders/versions`。
 */

import {
  FALLBACK_LOADER_VERSIONS,
  LOADER_IDS,
  type LoaderId
} from '../constants/loaderVersionTables';

export type { LoaderId };

export function isLoaderId(value: string): value is LoaderId {
  return (LOADER_IDS as readonly string[]).includes(value);
}

export function getLoaderVersions(loader: string): string[] {
  if (!isLoaderId(loader)) return [];
  return [...FALLBACK_LOADER_VERSIONS[loader]];
}

export function compareVersionsDesc(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return b.localeCompare(a);
}

function versionParts(raw: string): number[] {
  const core = raw.includes('-') ? (raw.split('-').pop() ?? raw) : raw;
  return core.split('.').map((p) => {
    const n = Number.parseInt(p.replace(/[^\d].*$/, ''), 10);
    return Number.isFinite(n) ? n : 0;
  });
}

export function mergeVersionLists(...lists: Array<readonly string[]>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const v = raw.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out.sort(compareVersionsDesc);
}

export function withPreferredVersion(list: readonly string[], preferred?: string): string[] {
  const base = [...list];
  const extra = preferred?.trim();
  if (!extra || base.includes(extra)) return base;
  return [extra, ...base];
}

export function parseFabricOrQuiltLoaders(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const out: string[] = [];
  for (const item of data) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim());
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.version === 'string' && rec.version.trim()) {
      out.push(rec.version.trim());
      continue;
    }
    const nested = rec.loader;
    if (nested && typeof nested === 'object') {
      const ver = (nested as { version?: unknown }).version;
      if (typeof ver === 'string' && ver.trim()) out.push(ver.trim());
    }
  }
  return out;
}

export function parseMavenVersions(xml: string): string[] {
  const block = xml.match(/<versions>([\s\S]*?)<\/versions>/i);
  if (!block?.[1]) return [];
  const found = [...block[1].matchAll(/<version>\s*([^<]+?)\s*<\/version>/gi)];
  return found.map((m) => m[1]?.trim() ?? '').filter(Boolean);
}

/** Maven 座標 `1.20.1-47.4.0` からローダー側 `47.4.0` を取る */
export function forgeBuildFromMaven(raw: string): string {
  const i = raw.lastIndexOf('-');
  return i >= 0 ? raw.slice(i + 1) : raw;
}

export function forgeVersionsForMc(allMaven: readonly string[], mcVersion: string): string[] {
  const mc = mcVersion.trim();
  if (!mc) {
    return mergeVersionLists(allMaven.map(forgeBuildFromMaven));
  }
  const prefix = `${mc}-`;
  const matched = allMaven.filter((v) => v.startsWith(prefix)).map(forgeBuildFromMaven);
  if (matched.length > 0) return mergeVersionLists(matched);
  return mergeVersionLists(allMaven.map(forgeBuildFromMaven));
}

/** NeoForge `21.1.133` ↔ MC `1.21.1` */
export function neoforgeMatchesMc(neoVersion: string, mcVersion: string): boolean {
  const parts = neoVersion.split('.');
  if (parts.length < 2) return false;
  const major = parts[0];
  const minor = parts[1];
  if (!major || !minor) return false;
  if (minor === '0') return mcVersion === `1.${major}`;
  return mcVersion === `1.${major}.${minor}`;
}

export function neoforgeVersionsForMc(all: readonly string[], mcVersion: string): string[] {
  const mc = mcVersion.trim();
  if (!mc) return mergeVersionLists(all);
  const matched = all.filter((v) => neoforgeMatchesMc(v, mc));
  return mergeVersionLists(matched.length > 0 ? matched : all);
}
