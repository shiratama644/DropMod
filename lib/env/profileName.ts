/**
 * プロファイル名の自動生成 (PHASE11_PLAN.md §10.1、2026-08-26 確定ルール)。
 *
 * | 条件 | デフォルト値 |
 * |---|---|
 * | フォルダ名が妥当 (特定名でない・一定長以下) | フォルダ名 |
 * | フォルダ名が不適切 (.minecraft 等の特定名・一定以上長い) | 検出環境から生成 |
 * | 環境検出に失敗 | 空欄 |
 *
 * すべてユーザーが編集可能 (自動生成はあくまでデフォルト値)。
 */

/** 自動生成に使えない特定名 (ランチャー・インスタンスの定番名) */
const RESERVED_FOLDER_NAMES = new Set([
  '.minecraft',
  'minecraft',
  'instance',
  'instances',
  'mods',
  'resourcepacks',
  'shaderpacks',
  'prism',
  'multimc',
  'polymc',
  'modrinth-app',
  'gdlauncher',
  'atlauncher',
  'minecraft launcher'
]);

/** フォルダ名として採用する最大長 */
const MAX_FOLDER_NAME_LENGTH = 40;

export function isUsableFolderName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > MAX_FOLDER_NAME_LENGTH) return false;
  return !RESERVED_FOLDER_NAMES.has(trimmed.toLowerCase());
}

/**
 * フォルダ名 (or ZIP 名) と検出環境からプロファイル名のデフォルト値を生成。
 *
 * - フォルダ名が妥当 → そのまま (trim 済み)
 * - 不適切 → 検出環境から 'Fabric 1.21.1' 形式で生成
 * - 環境も検出失敗 → '' (空欄。UI で入力を促す)
 */
export function generateProfileName(
  folderName: string | null | undefined,
  environment: {
    mcVersion?: string;
    loader?: string;
  }
): string {
  if (folderName) {
    const trimmed = folderName.trim();
    if (isUsableFolderName(folderName)) {
      return trimmed;
    }
  }
  const parts = [environment.loader, environment.mcVersion].filter(
    (part): part is string => typeof part === 'string' && part.length > 0
  );
  return parts.join(' ');
}
