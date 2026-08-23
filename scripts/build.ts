#!/usr/bin/env node
/**
 * DropMod production build
 *
 * PRoot-Distro (`uname -a` に "PRoot-Distro") → `next build --webpack`
 *   + Webpack filesystem cache + .next/cache 永続化 + pnpm store ディレクトリ確保
 * それ以外 → Turbopack + turbopackFileSystemCacheForBuild
 *
 * 上書き:
 *   DROP_MOD_BUNDLER=webpack|turbopack
 *   pnpm build -- --webpack
 *   pnpm build -- --turbo
 *   DROP_MOD_CACHE_ROOT=/path/to/cache
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCachePaths,
  ensureDir,
  linkNextCache,
  readUnameA,
  resolveBundler
} from './build-env.ts';

const cwd = process.cwd();
const argv = process.argv.slice(2).filter((a) => a !== '--webpack' && a !== '--turbo' && a !== '--turbopack');
const uname = readUnameA();
const bundler = resolveBundler({ uname, argv: process.argv.slice(2), env: process.env });
const caches = buildCachePaths(cwd, process.env);

ensureDir(caches.root);
ensureDir(caches.nextCache);
ensureDir(caches.webpackCache);
ensureDir(caches.turbopackCache);
ensureDir(caches.pnpmStore);
const nextCache = linkNextCache(cwd, caches.nextCache);

const env: NodeJS.ProcessEnv = {
  ...process.env,
  PNPM_STORE_DIR: process.env.PNPM_STORE_DIR?.trim() || caches.pnpmStore
};
if (bundler === 'webpack') {
  env.DROP_MOD_WEBPACK = '1';
}

const nextBin = join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!existsSync(nextBin)) {
  console.error('[DropMod build] next is not installed. Run `pnpm install` first.');
  process.exit(1);
}

const nextArgs = ['build', ...(bundler === 'webpack' ? ['--webpack'] : []), ...argv];

console.log(`[DropMod build] uname: ${uname || '(unavailable)'}`);
console.log(`[DropMod build] bundler: ${bundler}${bundler === 'webpack' ? ' (--webpack)' : ' (Turbopack persistent cache)'}`);
console.log(`[DropMod build] next cache: ${nextCache}`);
console.log(`[DropMod build] persist: ${caches.nextCache}`);
console.log(`[DropMod build] pnpm store: ${env.PNPM_STORE_DIR}`);

const result = spawnSync(process.execPath, [nextBin, ...nextArgs], {
  cwd,
  env,
  stdio: 'inherit'
});

process.exit(result.status === null ? 1 : result.status);
