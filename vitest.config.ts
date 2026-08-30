/**
 * Vitest 設定
 *
 * - jsdom 環境で React 19 コンポーネントをテスト
 * - fake-indexeddb で Dexie を jsdom 上でも動かす (vitest.setup.ts)
 * - msw で Modrinth API を mock (vitest.setup.ts + __tests__/mocks/)
 * - '@/' path alias を Next.js の tsconfig と同じ扱いに
 *
 * Sub-Phase 9-C.6 更新:
 *   - per-module (per-file) coverage thresholds を計画書 §7.5 に沿って設定
 *   - グローバル最低ライン 60%+ を維持
 *   - 単体テストで検証しづらい File (SSR-only / Client-only wrapper / DOM-heavy
 *     util 等) は include から exclude し、E2E (Playwright) で担保
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom 環境で React 19 コンポーネントをテスト。
    // ※ Node 24 (undici v7) の fetch が jsdom 由来の AbortSignal を拒否する
    //    問題 (vitest#8374) は vitest 4 で上流解決済みのため、
    //    カスタム環境 (旧 vitest.environment.ts) は削除して素の 'jsdom' に戻した。
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      '__tests__/**/*.test.{ts,tsx}',
      'app/**/*.test.{ts,tsx}',
      'components/**/*.test.{ts,tsx}',
      'hooks/**/*.test.{ts,tsx}',
      'lib/**/*.test.{ts,tsx}'
    ],
    exclude: ['node_modules/**', '.next/**', '.archive/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'types.ts'
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '.next/**',
        '.archive/**',
        'node_modules/**',

        // ---- Server / route / generated (E2E で担保) ----
        'app/**/route.ts',
        'app/sitemap.ts',
        'app/robots.ts',
        'app/manifest.ts',
        'app/error.tsx',
        'app/global-error.tsx',
        'app/**/loading.tsx',
        'app/**/not-found.tsx',
        'app/**/default.tsx',
        'app/**/page.tsx',            // Server Components: RSC 統合は E2E で
        'app/layout.tsx',             // 全 route の root wrapper、E2E 各テストが起動時に自動通過
        'app/**/layout.tsx',          // nested layout も同様 (RSC wrapper = E2E 担保。Phase 10.5-A)
        'types.ts',                   // 純粋な型定義 (JS 実体なし)

        // ---- Large orchestrator Client Components (E2E で担保) ----
        // これらは msw + jsdom + provider ツリー全部揃えないと render できず、
        // 単体テストの ROI が低い。実挙動は Playwright で smoke / mod-detail /
        // mods-page / offline / theme-persistence spec で担保している。
        'components/layout/AppShell.tsx',
        'components/AppShell.tsx',
        'components/HomeInteractive.tsx',
        'components/ModsPageClient.tsx',
        'components/ModDetailModalShell.tsx',
        // Phase 10-P1: /mods/[slug] フルページ用の刷新デザインコンポーネント。
        // ModDetailModalShell と同じく Zustand + fa-icon + next/image を
        // 大量に使うため単体テスト ROI 低、E2E (mod-detail-modal / smoke) で担保。
        'components/ModDetailPageView.tsx',
        'components/SettingsPageClient.tsx',

        // ---- Presentational-only Client Components (単体テスト ROI 低) ----
        // BottomNav は現状 aria-current ロジックのみ、EditProfile は NewProfile と同型
        // DependencyCheckModal は結果表示のみ、ZipProgressModal は progress bar 表示のみ
        // ToastContainer は Zustand subscribe で表示するだけ (Zustand store 側でテスト済)
        // MarkdownRenderer は react-markdown をラップして h1→h2 降格するだけ
        'components/layout/BottomNav.tsx',
        'components/BottomNav.tsx',
        'components/EditProfileModal.tsx',
        'components/DependencyCheckModal.tsx',
        'components/ZipProgressModal.tsx',
        'components/feedback/ToastContainer.tsx',
        'components/ToastContainer.tsx',
        'components/ui/MarkdownRenderer.tsx',
        'components/MarkdownRenderer.tsx',

        // ---- Providers / metrics wrapper (SSR 境界跨ぐ / 副作用のみ) ----
        // Providers は PersistQueryClientProvider を返すだけ、
        // WebVitalsReporter は web-vitals ライブラリを attach するだけ。
        // (AppContext.tsx は Phase 10-B で完全削除済みのため exclude からも除去)
        'components/layout/Providers.tsx',
        'components/Providers.tsx',
        'components/layout/WebVitalsReporter.tsx',
        'components/WebVitalsReporter.tsx',

        // ---- Shim-only hooks (実体は Zustand store 側でテスト済) ----
        'hooks/useConfirm.ts',
        'hooks/useToasts.ts',

        // ---- SSR-only / DOM-heavy utilities (E2E で担保) ----
        // lib/query/client.ts: persister setup + IndexedDB async storage adapter
        //   → 実データフローは useProjectQuery テスト経由で担保
        // lib/utils/download.ts: <a> click + Blob URL 経由の Native ダウンロード
        //   → jsdom で navigation を強制する形になり単体テスト不可能に近い
        // lib/constants/*: 定数の集合 (テスト対象なし)
        'lib/query/client.ts',
        'lib/utils/download.ts',
        'lib/constants/**'
      ],
      thresholds: {
        // ---- グローバル最低ライン (Phase 9-C 完了時 60%+) ----
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,

        // ---- per-module thresholds (計画書 §7.5) ----
        // Vitest 3 の per-file thresholds は glob key で指定
        'lib/state/**/*.ts': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95
        },
        'lib/store/**/*.ts': {
          statements: 85,
          branches: 80,
          functions: 90,
          lines: 85
        },
        'lib/db/**/*.ts': {
          statements: 75,
          branches: 70,
          functions: 75,
          lines: 75
        },
        'lib/query/**/*.ts': {
          statements: 70,
          branches: 60,
          functions: 70,
          lines: 70
        },
        'lib/modrinth/**/*.ts': {
          statements: 65,
          branches: 55,
          functions: 65,
          lines: 65
        },
        'lib/utils/**/*.ts': {
          statements: 60,
          branches: 60,
          functions: 60,
          lines: 60
        },
        'hooks/**/*.ts': {
          statements: 70,
          branches: 60,
          functions: 70,
          lines: 70
        },
        'components/**/*.tsx': {
          statements: 50,
          branches: 45,
          functions: 50,
          lines: 50
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.')
    }
  }
});
