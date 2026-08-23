import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCachePaths,
  isPRootDistro,
  linkNextCache,
  resolveBundler
} from '@/scripts/build-env';

const PROOT_UNAME =
  'Linux localhost 6.17.0-PRoot-Distro #1 SMP PREEMPT_DYNAMIC Fri, 10 Oct 2025 00:00:00 +0000 aarch64 GNU/Linux';

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

describe('resolveBundler', () => {
  it('PRoot-Distro は webpack', () => {
    expect(resolveBundler({ uname: PROOT_UNAME, argv: [], env: {} })).toBe('webpack');
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
});

describe('build caches', () => {
  it('既定の persist 先は .cache/dropmod-build', () => {
    const paths = buildCachePaths('/repo', {});
    expect(paths.root).toBe(join('/repo', '.cache', 'dropmod-build'));
    expect(paths.nextCache).toContain('next-cache');
    expect(paths.pnpmStore).toContain('pnpm-store');
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
