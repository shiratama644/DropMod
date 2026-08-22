/**
 * 検索関連の共通定数。
 *
 * M6-3 修正: 以前は `app/page.tsx` (SSR 初期取得) と
 * `components/HomeInteractive.tsx` (CSR 追加読み込み) に同じ値
 * (`SEARCH_LIMIT = 24`) が個別定義されており、片方だけ変更した際に
 * SSR/CSR で件数が不一致になる潜在バグがあった。両者から本ファイルを
 * import することで DRY を担保する。
 */
export const SEARCH_LIMIT = 24;
