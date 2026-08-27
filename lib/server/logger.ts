// ============================================================================
// サーバーロガー — APP_PROFILE 連動のログレベル制御
//
//   | level            | production | development |
//   |------------------|------------|-------------|
//   | logger.debug     | 抑制       | 出力        |
//   | logger.info      | 抑制       | 出力        |
//   | logger.warn      | 出力       | 出力        |
//   | logger.error     | 出力       | 出力        |
//
// - 既存の console.* 呼び出しと同じ見た目 ('[DropMod] メッセージ', ...付加情報) に
//   なるよう、先頭引数が文字列なら prefix を連結して 1 引数にまとめる
//   (既存テストの spy アサーション互換)。
// - クライアントバンドルに誤って import された場合も安全に動くよう
//   typeof window ガードを入れている (その場合は常に warn/error のみ)。
// ============================================================================

import { getAppProfile } from './profile';

const LOG_PREFIX = '[DropMod]';

/** development プロファイルでのみ verbose (debug/info) ログを出す。 */
function isVerboseLogging(): boolean {
  // ブラウザコンテキストでは APP_PROFILE (サーバー専用変数) を参照しない
  if (typeof window !== 'undefined') return false;
  return getAppProfile() === 'development';
}

function withPrefix(args: unknown[]): unknown[] {
  if (typeof args[0] === 'string') {
    return [`${LOG_PREFIX} ${args[0]}`, ...args.slice(1)];
  }
  return [LOG_PREFIX, ...args];
}

export const logger = {
  /** 開発時の詳細ログ (開発プロファイルでのみ出力) */
  debug(...args: unknown[]): void {
    if (isVerboseLogging()) console.debug(...withPrefix(args));
  },
  /** 開発時の情報ログ (開発プロファイルでのみ出力) */
  info(...args: unknown[]): void {
    if (isVerboseLogging()) console.info(...withPrefix(args));
  },
  /** 常時出力 (本番でも確認が必要な警告) */
  warn(...args: unknown[]): void {
    console.warn(...withPrefix(args));
  },
  /** 常時出力 (エラー) */
  error(...args: unknown[]): void {
    console.error(...withPrefix(args));
  }
};
