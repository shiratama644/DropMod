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
      'src/app/**/*.test.{ts,tsx}',
      'src/components/**/*.test.{ts,tsx}',
      'src/hooks/**/*.test.{ts,tsx}',
      'src/lib/**/*.test.{ts,tsx}'
    ],
    exclude: ['node_modules/**', '.next/**', '.archive/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'src/app/**/*.{ts,tsx}',
        'src/components/**/*.{ts,tsx}',
        'src/features/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/lib/**/*.{ts,tsx}',
        'src/types/**/*.ts'
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '.next/**',
        '.archive/**',
        'node_modules/**',

        // ---- Server / route / generated (E2E で担保) ----
        'src/app/**/route.ts',
        'src/app/sitemap.ts',
        'src/app/robots.ts',
        'src/app/manifest.ts',
        'src/app/error.tsx',
        'src/app/global-error.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/not-found.tsx',
        'src/app/**/default.tsx',
        'src/app/**/page.tsx',            // Server Components: RSC 統合は E2E で
        'src/app/layout.tsx',             // 全 route の root wrapper、E2E 各テストが起動時に自動通過
        'src/app/**/layout.tsx',          // nested layout も同様 (RSC wrapper = E2E 担保。Phase 10.5-A)
        'src/types/**',                    // 純粋な型定義 (JS 実体なし)

        // ---- Large orchestrator Client Components (E2E で担保) ----
        // これらは msw + jsdom + provider ツリー全部揃えないと render できず、
        // 単体テストの ROI が低い。実挙動は Playwright で smoke / mod-detail /
        // mods-page / offline / theme-persistence spec で担保している。
        'src/components/layout/AppShell.tsx',
        'src/features/catalog/components/HomeInteractive.tsx',
        'src/features/profiles/components/ModsPageClient.tsx',
        'src/features/project/components/ModDetailModalShell.tsx',
        'src/features/project/components/ModDetailPageView.tsx',
        'src/features/settings/components/SettingsPageClient.tsx',

        // ---- Presentational-only Client Components (単体テスト ROI 低) ----
        // BottomNav は現状 aria-current ロジックのみ、EditProfile は NewProfile と同型
        // DependencyCheckModal は結果表示のみ、ZipProgressModal は progress bar 表示のみ
        // ToastContainer は Zustand subscribe で表示するだけ (Zustand store 側でテスト済)
        // MarkdownRenderer は react-markdown をラップして h1→h2 降格するだけ
        'src/components/layout/BottomNav.tsx',
        'src/features/profiles/components/EditProfileModal.tsx',
        'src/features/dep-check/components/DependencyCheckModal.tsx',
        'src/features/zip/components/ZipProgressModal.tsx',
        'src/components/feedback/ToastContainer.tsx',
        'src/components/ui/MarkdownRenderer.tsx',

        // ---- Providers / metrics wrapper (SSR 境界跨ぐ / 副作用のみ) ----
        // Providers は PersistQueryClientProvider を返すだけ、
        // WebVitalsReporter は web-vitals ライブラリを attach するだけ。
        // (AppContext.tsx は Phase 10-B で完全削除済みのため exclude からも除去)
        'src/components/layout/Providers.tsx',
        'src/components/layout/WebVitalsReporter.tsx',

        // ---- Shim-only hooks (実体は Zustand store 側でテスト済) ----
        'src/hooks/useConfirm.ts',
        'src/hooks/useToasts.ts',

        // ---- SSR-only / DOM-heavy utilities (E2E で担保) ----
        // lib/query/client.ts: persister setup + IndexedDB async storage adapter
        //   → 実データフローは useProjectQuery テスト経由で担保
        // lib/utils/download.ts: <a> click + Blob URL 経由の Native ダウンロード
        //   → jsdom で navigation を強制する形になり単体テスト不可能に近い
        // lib/constants/*: 定数の集合 (テスト対象なし)
        'src/lib/query/client.ts',
        'src/lib/utils/download.ts',
        'src/lib/constants/**',

        // ---- 0% のバレル re-export (COV-1, COVERAGE_90_PLAN.md §10.1) ----
        // src/features/*/index.ts は公開面の再エクスポートのみで、実行ロジックは
        // 実装元 (components / hooks / store / services) にある。テスト価値なし。
        'src/features/*/index.ts',

        // ---- 純粋な型定義ファイル (COV-1) ----
        // 実行時コードを含まない型のみのファイル (src/types/** と同じ扱い)。
        // 該当: lib/db/types.ts / modpack/api/providers/types.ts /
        //       env-import/services/detector/types.ts
        '**/types.ts',

        // ---- Next.js 動的画像生成ルート (COV-1) ----
        // opengraph-image / twitter-image (計 4 ファイル)。Next.js が実行時生成する
        // RSC 画像ルートで、単体テストは Next.js 内部に強結合し ROI が低い。
        // 実表示は E2E / 実環境 (本番 OGP 目視) で担保。
        'src/app/**/opengraph-image.tsx',
        'src/app/**/twitter-image.tsx',

        // ---- Web Worker エントリ (COV-1) ----
        // DedicatedWorkerGlobalScope 前提で jsdom では実行不可。
        // コアロジック (hashCore.ts) はテスト済み、Worker 生成失敗時の
        // メインスレッド fallback 分岐 (computeHashes.ts) は COV-2 で担保。
        'src/lib/env/hashWorker.ts',

        // ---- Sync 抽象レイヤーのバレル / インターフェース (COV-1) ----
        // db.ts は re-export バレル (実装は db/managed.ts / db/transactions.ts でテスト済)。
        // sink.ts は EnvironmentSink インターフェース定義のみ (実装は
        // sink/filesystem.ts / sink/zip.ts でテスト済)。実行コードなし。
        'src/features/sync/services/db.ts',
        'src/features/sync/services/sink.ts'
      ],
      thresholds: {
        // ---- グローバル最低ライン (COV-5: 全指標 90% 化。COV-1〜4 完了時点で
        //      全体実測 96.5 / 90.3 / 98.17 / 97.86 を確認済み) ----
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,

        // ---- per-module thresholds (計画書 §7.5 / §10.5) ----
        // Vitest 3 の per-file thresholds は glob key で指定
        'src/lib/state/**/*.ts': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95
        },
        'src/features/profiles/store/store.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/features/zip/store/zipExport.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/features/zip/store/zipImport.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/features/dep-check/store/store.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/components/feedback/*Store.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/components/layout/uiState.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/components/layout/appActions.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/lib/db/**/*.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/lib/query/**/*.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/lib/modrinth/**/*.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/lib/utils/**/*.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/hooks/**/*.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'src/components/**/*.tsx': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        }
      }
    }
  },
  resolve: {
    alias: {
      '@/__tests__': path.resolve(import.meta.dirname, '__tests__'),
      '@/scripts': path.resolve(import.meta.dirname, 'scripts'),
      '@': path.resolve(import.meta.dirname, 'src')
    }
  }
});
