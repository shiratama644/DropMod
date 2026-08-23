/**
 * MSW node server for vitest (Sub-Phase 9-C.1)
 *
 * vitest.setup.ts で beforeAll/afterEach/afterAll に組み込む。
 * 各テストは `server.use(...)` で個別の handler を追加/上書きできる。
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
