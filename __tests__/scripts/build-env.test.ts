import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCachePaths,
  defaultCacheRoot,
  isPRootDistro,
  isTermux,
  linkNextCache,
  resolveBundler
} from '@/scripts/build-env';

const PROOT_UNAME =
  'Linux localhost 6.17.0-PRoot-Distro #1 SMP PREEMPT_DYNAMIC Fri, 10 Oct 2025 00:00:00 +0000 aarch64 GNU/Linux';

// Termux は uname -a に固有の文字列を含まないことがあるため env で判定する
const TERMUX_ENV = {
  PREFIX: '/data/data/com.termux/files/usr',
  TERMUX_VERSION: '0.118.1'
};

const ANDROID_UNAME = 'Linux localhost 4.19.0-perf+ #1 SMP PREEMPT aarch64 Android';

describe('isPRootDistro', () => {
  it('uname -a に PRoot-Distro があれば true', () => {
    expect(isPRootDistro(PROOT_UNAME)).toBe(true);
  });

  it('通常の Linux は false', () => {
    expect(isPRootDistro('Linux host 6.8.0-40-generic #40-Ubuntu SMP x86_64 GNU/Linux')).toBe(
      false
    );
  });
});

describe('isTermux', () => {
  it('TERMUX_VERSION があれば true', () => {
    expect(isTermux({ TERMUX_VERSION: '0.118.1' })).toBe(true);
  });

  it('PREFIX が com.termux を含めば true', () => {
    expect(isTermux({ PREFIX: '/data/data/com.termux/files/usr' })).toBe(true);
  });

  it('どちらも無ければ false', () => {
    expect(isTermux({})).toBe(false);
    expect(isTermux({ PREFIX: '/usr' })).toBe(false);
  });
});

describe('resolveBundler', () => {
  it('PRoot-Distro は webpack', () => {
    expect(resolveBundler({ uname: PROOT_UNAME, argv: [], env: {} })).toBe('webpack');
  });

  it('Termux は webpack', () => {
    expect(resolveBundler({ uname: ANDROID_UNAME, argv: [], env: TERMUX_ENV })).toBe('webpack');
  });

  it('それ以外は turbopack', () => {
    expect(resolveBundler({ uname: 'Linux desktop 6.8.0', argv: [], env: {} })).toBe('turbopack');
  });

  it('--webpack と DROP_MOD_BUNDLER で上書きできる', () => {
    expect(resolveBundler({ uname: 'Linux desktop', argv: ['--webpack'], env: {} })).toBe(
      'webpack'
    );
    expect(
      resolveBundler({ uname: PROOT_UNAME, argv: [], env: { DROP_MOD_BUNDLER: 'turbopack' } })
    ).toBe('turbopack');
  });

  it('Termux でも --turbo / DROP_MOD_BUNDLER で上書きできる', () => {
    expect(resolveBundler({ uname: ANDROID_UNAME, argv: ['--turbo'], env: TERMUX_ENV })).toBe(
      'turbopack'
    );
    expect(
      resolveBundler({
        uname: ANDROID_UNAME,
        argv: [],
        env: { ...TERMUX_ENV, DROP_MOD_BUNDLER: 'turbopack' }
      })
    ).toBe('turbopack');
  });
});

describe('build caches (env を明示すれば実行環境の process.env に依存しない)', () => {
  it('既定の persist 先は .cache/dropmod-build', () => {
    const paths = buildCachePaths('/repo', {});
    expect(paths.root).toBe(join('/repo', '.cache', 'dropmod-build'));
    expect(paths.nextCache).toBe(join('/repo', '.cache', 'dropmod-build', 'next-cache'));
    expect(paths.webpackCache).toBe(
      join('/repo', '.cache', 'dropmod-build', 'next-cache', 'webpack')
    );
    expect(paths.turbopackCache).toBe(
      join('/repo', '.cache', 'dropmod-build', 'next-cache', 'turbopack')
    );
    expect(paths.pnpmStore).toBe(join('/repo', '.cache', 'dropmod-build', 'pnpm-store'));
  });

  it('DROP_MOD_CACHE_ROOT / PNPM_STORE_DIR に渡した値だけが反映される（実際の process.env の値の影響を受けない）', () => {
    const paths = buildCachePaths('/repo', {
      DROP_MOD_CACHE_ROOT: '/custom/cache',
      PNPM_STORE_DIR: '/custom/pnpm-store'
    });
    expect(paths.root).toBe('/custom/cache');
    expect(paths.pnpmStore).toBe('/custom/pnpm-store');
  });

  it('defaultCacheRoot も明示的な env のみを見る', () => {
    expect(defaultCacheRoot('/repo', {})).toBe(join('/repo', '.cache', 'dropmod-build'));
    expect(defaultCacheRoot('/repo', { DROP_MOD_CACHE_ROOT: '/x' })).toBe('/x');
  });

  it('.next/cache を永続ディレクトリへ symlink する', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dropmod-build-'));
    const persist = join(cwd, '.cache', 'dropmod-build', 'next-cache');
    mkdirSync(persist, { recursive: true });
    writeFileSync(join(persist, 'keep'), '1');
    const linked = linkNextCache(cwd, persist);
    expect(existsSync(linked)).toBe(true);
    expect(lstatSync(linked).isSymbolicLink()).toBe(true);
    expect(existsSync(join(cwd, '.next', 'cache', 'keep'))).toBe(true);
  });
});
