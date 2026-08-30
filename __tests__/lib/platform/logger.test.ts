// @vitest-environment node
// ↑ logger の development 判定は「window が無い (サーバー)」前提のため
//    jsdom ではなく node 環境でテストする。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/platform/logger';
import { _resetAppProfileCacheForTesting } from '@/lib/platform/profile';

describe('lib/platform/logger — APP_PROFILE 連動ログレベル', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetAppProfileCacheForTesting();
    vi.restoreAllMocks();
  });

  describe('production プロファイル', () => {
    it('debug / info は抑制される', () => {
      vi.stubEnv('APP_PROFILE', 'production');
      _resetAppProfileCacheForTesting();

      logger.debug('debug message');
      logger.info('info message');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('warn / error は常に出力される', () => {
      vi.stubEnv('APP_PROFILE', 'production');
      _resetAppProfileCacheForTesting();

      logger.warn('warn message', { code: 1 });
      logger.error('error message');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith('[DropMod] warn message', { code: 1 });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('[DropMod] error message');
    });
  });

  describe('development プロファイル', () => {
    it('debug / info も出力される', () => {
      vi.stubEnv('APP_PROFILE', 'development');
      _resetAppProfileCacheForTesting();

      logger.debug('debug message');
      logger.info('info message');

      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('プレフィックス付与 (既存 console 出力との互換)', () => {
    it('先頭引数が文字列なら [DropMod] を連結して 1 引数にまとめる', () => {
      vi.stubEnv('APP_PROFILE', 'development');
      _resetAppProfileCacheForTesting();

      logger.warn('fetch failed:', 'sodium', new Error('boom'));

      expect(warnSpy).toHaveBeenCalledWith(
        '[DropMod] fetch failed:',
        'sodium',
        expect.any(Error)
      );
    });

    it('先頭引数が文字列でなければ [DropMod] を独立した先頭引数にする', () => {
      vi.stubEnv('APP_PROFILE', 'development');
      _resetAppProfileCacheForTesting();

      logger.warn(42, 'detail');

      expect(warnSpy).toHaveBeenCalledWith('[DropMod]', 42, 'detail');
    });
  });

  describe('フォールバック解決 (APP_PROFILE 未設定)', () => {
    it('NODE_ENV=development なら verbose ログが出る', () => {
      vi.stubEnv('NODE_ENV', 'development');
      _resetAppProfileCacheForTesting();

      logger.debug('dev message');

      expect(debugSpy).toHaveBeenCalledTimes(1);
    });
  });
});
