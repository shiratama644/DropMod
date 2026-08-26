/**
 * EnvironmentSource の ZIP 実装 (Phase 11-C、PHASE11_PLAN.md §2.2 / §4.1)。
 *
 * Firefox / Safari / モバイル (File System Access API 非対応) 向けの
 * フォールバック。`.minecraft` を ZIP 化したファイルを JSZip で読み、
 * FileSystemSource と同じ interface で上位ロジックに供給する。
 *
 * - JSZip はディレクトリエントリを「末尾 '/' のパス」として持つ。
 *   一部の ZIP は暗黙ディレクトリ (エントリ無し) のため、
 *   listDirectories はパス接頭辞からディレクトリ名を推論する。
 * - exists はファイルまたは「そのパスを接頭辞に持つエントリ」で判定する。
 */

import type JSZip from 'jszip';
import type { EnvironmentSource } from './source';

function normalizeSubdir(subdir: string): string {
  const trimmed = subdir.replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

export class ZipSource implements EnvironmentSource {
  readonly kind = 'zip' as const;

  constructor(
    private readonly zip: JSZip,
    readonly rootName: string
  ) {}

  async readFile(path: string): Promise<Uint8Array> {
    const entry = this.zip.file(path);
    if (!entry) {
      throw new Error(`ZIP 内にファイル '${path}' が見つかりません`);
    }
    return entry.async('uint8array');
  }

  async listFiles(subdir: string): Promise<string[]> {
    const prefix = normalizeSubdir(subdir);
    const names = new Set<string>();
    for (const path of Object.keys(this.zip.files)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest === '' || rest.endsWith('/')) continue; // ディレクトリ
      if (rest.includes('/')) continue; // ネストしたファイル
      names.add(rest);
    }
    return [...names].sort();
  }

  async listDirectories(subdir: string): Promise<string[]> {
    const prefix = normalizeSubdir(subdir);
    const names = new Set<string>();
    for (const path of Object.keys(this.zip.files)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest === '') continue;
      const first = rest.split('/')[0];
      if (first && first.length > 0 && rest.includes('/')) {
        names.add(first);
      }
    }
    return [...names].sort();
  }

  async exists(path: string): Promise<boolean> {
    const normalized = path.replace(/^\/+|\/+$/g, '');
    if (!normalized) return true; // ルート自身
    if (this.zip.file(normalized)) return true;
    const prefix = `${normalized}/`;
    return Object.keys(this.zip.files).some((key) => key.startsWith(prefix));
  }
}

/**
 * ZIP が Minecraft 環境フォルダ (.minecraft / Prism インスタンス) を
 * 含むかどうかの軽量判定。useZipImport がインポート経路の分岐に使う。
 */
export function isMinecraftFolderZip(zip: JSZip): boolean {
  const paths = Object.keys(zip.files);
  const rootMarkers = ['mmc-pack.json'];
  const dirMarkers = ['mods', 'versions', 'resourcepacks', 'shaderpacks'];
  return paths.some((path) => {
    if (rootMarkers.includes(path)) return true;
    if (path.startsWith('.minecraft/')) return true;
    const segments = path.split('/');
    const first = segments[0] ?? '';
    return segments.length > 1 && dirMarkers.includes(first);
  });
}
