import type { ProjectItem } from './profile';
import type { ModrinthProject } from './modrinth';

export type ThemeMode = 'dark' | 'light';
// Phase 9-F: URL 再設計に伴い 'profile' タブを追加
//   - 'home'     → /          (簡易ランディング)
//   - 'mods'     → /mods      (Modrinth 検索一覧、旧 Home のコンテンツ)
//   - 'profile'  → /profile   (選択中プロファイルの Mod 一覧、旧 /mods のコンテンツ)
//   - 'settings' → /settings  (変わらず)
export type TabName = 'home' | 'mods' | 'profile' | 'settings';

export interface Toast {
  id: string;
  message: string;
  // 'error' 種別は削除失敗・致命的エラー時の赤系表示用。
  // 'warning' との視覚的区別のため独立した種別として持たせる。
  type: 'info' | 'success' | 'warning' | 'error';
}

export type VersionChannel = 'stable' | 'beta' | 'alpha';

export interface DropdownOption {
  label: string;
  value: string;
  /** Font Awesome solid 名 (`fa-circle-check` 等)。未指定ならアイコンなし */
  icon?: string;
  /** バージョンチャネル色。未指定なら通常色 */
  tone?: VersionChannel;
}

export interface DependencyCheckData {
  missingRequired: Array<{ sourceMod: ProjectItem; targetProjectId: string }>;
  conflicts: Array<{
    sourceMod: ProjectItem;
    targetMod: ProjectItem | { name: string; projectId: string };
  }>;
  optionalAvailable: Array<{ sourceMod: ProjectItem; targetProjectId: string }>;
  verifiedOK: Array<{ sourceMod: ProjectItem; message: string }>;
  depProjectMap: Map<string, ModrinthProject>;
}
