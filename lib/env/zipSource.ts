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
 *
 * 2026-08-27 修正: pathPrefix を導入。
 *   JSZip の zip.folder() は file() に相対パスでアクセスできるが、
 *   files オブジェクトの key はフルパスのまま。exists / listFiles /
 *   listDirectories が files の key を走査するため、folder() から
 *   作ったサブ ZIP ではすべてのパス判定が壊れる。
 *   → 元の zip を直接参照し、pathPrefix を付けて走査する方式に変更。
 */

import type JSZip from 'jszip';
import type { EnvironmentSource } from './source';

function normalizeSubdir(subdir: string): string {
  const trimmed = subdir.replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

export class ZipSource implements EnvironmentSource {
  readonly kind = 'zip' as const;

  /**
   * @param zip 元の JSZip インスタンス (folder() のサブ ZIP ではなく元のもの)
   * @param rootName 表示名 (Profile 名自動生成用)
   * @param pathPrefix 内部パス接頭辞。`.minecraft/` re-root の場合は
   *   '.minecraft/' を渡す。通常は空文字。
   */
  constructor(
    private readonly zip: JSZip,
    readonly rootName: string,
    private readonly pathPrefix: string = ''
  ) {}

  /** 相対パス → zip 内フルパス (pathPrefix を付与) */
  private fullKey(relativePath: string): string {
    const clean = relativePath.replace(/^\/+/g, '');
    return this.pathPrefix + clean;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const key = this.fullKey(path);
    const entry = this.zip.file(key) ?? this.zip.file(path);
    if (!entry) {
      throw new Error(`ZIP 内にファイル '${path}' が見つかりません`);
    }
    return entry.async('uint8array');
  }

  async listFiles(subdir: string): Promise<string[]> {
    const prefix = this.fullKey(normalizeSubdir(subdir));
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
    const prefix = this.fullKey(normalizeSubdir(subdir));
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
    const full = this.fullKey(normalized);
    if (this.zip.file(full) ?? this.zip.file(normalized)) return true;
    const prefix = `${full}/`;
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
