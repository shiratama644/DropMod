/**
 * Vitest グローバルセットアップ (Sub-Phase 8-D)
 *
 * - @testing-library/jest-dom の matchers を追加 (toBeInTheDocument 等)
 * - fake-indexeddb で jsdom 環境でも Dexie を動かす
 * - 各テストの前後で Zustand store と Dexie を reset (テスト間の副作用遮断)
 */

import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// テスト間で React tree を掃除
afterEach(() => {
  cleanup();
});

// Next.js が公開する global (process.env.NODE_ENV) を明示 test に
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
});
