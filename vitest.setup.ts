/**
 * Vitest グローバルセットアップ
 *
 * - @testing-library/jest-dom の matchers を追加 (toBeInTheDocument 等)
 * - fake-indexeddb で jsdom 環境でも Dexie を動かす
 * - msw (Mock Service Worker) を Node で起動し、Modrinth API を mock
 *   - onUnhandledRequest: 'error' で「テストが実 API を叩くバグ」を即検出
 * - 各テストの前後で React tree / handler を reset
 */

import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './__tests__/mocks/server';

// -------- MSW 起動 --------
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

// テスト間で React tree を掃除 + MSW handler を初期状態へ
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Next.js が公開する global (process.env.NODE_ENV) を明示 test に
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
});
