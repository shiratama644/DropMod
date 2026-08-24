#!/usr/bin/env bash
# restore-sandbox-env.sh
# Sandbox 再構築後の依存再構築（sandbox-rebuild-recovery.md から呼出）。
# - corepack で pnpm を有効化
# - frozen-lockfile で依存を検証付きインストール
set -euo pipefail

echo "[restore-sandbox-env] enabling pnpm via corepack ..."
corepack enable pnpm >/dev/null 2>&1 || true
# package.json の packageManager に合わせて activate（pnpm@11.22.0）
corepack prepare pnpm@11.22.0 --activate >/dev/null 2>&1 || true

echo "[restore-sandbox-env] installing dependencies (frozen-lockfile) ..."
pnpm install --frozen-lockfile

echo "[restore-sandbox-env] done. verify with: pnpm test:unit"
