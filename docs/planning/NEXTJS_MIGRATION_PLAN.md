# Vite + Hono → Next.js 16 (App Router) 段階的並行移行計画 【確定版 v3】

> 対応 task-list ID: `P0` 〜 `P7` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 完了** (2026-08-21〜実施 / Phase 7 の Vercel 本番検証のみ `DEPLOY-1` として継続保留)
> 移行後の各フェーズ (8〜13) は個別計画書を参照。

## 1. 開始前確認 (当時)

- Vite 版 (DropMod) が本番稼働中 — **並行構築で既存に影響を与えない**こと
- 移行の骨格 (§10.1) と Non-Goals (§3) をユーザーと合意済みであること

## 2. 目的 (Why)

Vite + Hono 構成の構造的課題を解消する:

| 現行課題 | Next.js 16 で解決 |
|---|---|
| SEO が空 (`<div id="root">` のみ)。検索・共有で本文が表示されない | Server Components + ISR で本文まで HTML 化。動的 OGP |
| `@hono/vite-dev-server` 埋め込み構成が本番で不安定 | Route Handlers に一本化。Edge/Node 選択可 |
| ページ切替が React state のみで URL に反映されない | ファイルベースルーティング |
| Mod 詳細モーダルが URL を持たず直リンク不能 | **Parallel + Intercepting Routes** でモーダル UX と SEO を両立 |
| Home 初期表示が CSR の API 待ち (TTFB/LCP 悪化) | 初期 24 件を ISR で事前レンダリング |

## 3. 変更範囲 (Scope)

やったこと:
1. `next/` サブディレクトリで**並行構築** (既存 Vite ソースに一切手を触れない)
2. Phase 単位でページを 1 つずつ移設 → Vercel プレビューで確認 → マージ
3. 全ページ完成後、ルート `/` を Next.js に切替 → 旧 Vite ソースを `.archive/vite/` へ退避

やらなかったこと (Non-Goals → 後続フェーズへ):
- LocalStorage → IndexedDB (Dexie) / TanStack Query / Zustand 全面移行 → **Phase 8/9**
- Modrinth 認証 / CurseForge / i18n → 未来の機能追加

## 4. 禁止事項 (当時)

- 並行構築期間中に Vite 側ソースを変更しない
- UI/UX の変更を混ぜない (**現状 100% 再現** — デザインシステム・アニメ・Toast・Confirm 含む)
- `.archive/vite/` 退避後は恒久不変 (§4.5 AGENT.md)

## 5. 完了条件 (DoD)

- [x] 4 ルート (`/` `/mods` `/settings` `/mod/[slug]`) が Next.js 側で動作
- [x] Home 初期 24 件 ISR + 詳細ページ ISR (人気 Top100 事前生成 + on-demand)
- [x] Parallel + Intercepting Routes モーダルが URL を持つ
- [x] Hono プロキシを `/api/modrinth/[...path]` Route Handler に置換
- [x] 旧 Vite ソースを `.archive/vite/` へ退避 (ルート切替)
- [x] Vercel プレビューで動作確認
- [ ] Vercel 本番デプロイ → **DEPLOY-1 として Phase 13 完了後まで保留** (Hobby 制約)

## 6. テスト方法 (当時)

| 層 | 実施 | 確認内容 |
|---|---|---|
| 手動 (Vercel Preview) | ✅ | 各 Phase 完了時にページ動作確認 |
| 自動テスト | △ | 本格導入は Phase 8-D |
| SEO | ✅ | view-source でメタデータ・本文が HTML に存在 |

## 7. 停止条件 (当時)

- 並行構築で Vite 側に影響が及ぶ場合
- モーダル二重 URL の技術検証が仕様を満たさない場合

## 8. 完了時に行うこと

各 Phase: 動作確認 → コミット → task-list 更新 (当時は Phase 完了報告で運用)。

## 9. サブタスク分割 (フェーズロードマップ)

| ID | テーマ | 期間 | 状態 |
|---|---|---:|---|
| P0 | 準備・調査 | 0.5 日 | 完了 (2026-08-21) |
| P1 | `next/` 骨組み作成 | 1 日 | 完了 (2026-08-21) |
| P2 | 共通コンポーネント移植 | 1.5 日 | 完了 (2026-08-21) |
| P3 | Route Handlers + Home ISR | 1.5 日 | 完了 (2026-08-21) |
| P4 | `/mod/[slug]` + Parallel/Intercepting Modal | 2 日 | 完了 |
| P5 | `/mods` + `/settings` | 1 日 | 完了 |
| P6 | 統合切替 + Vite アーカイブ退避 | 1 日 | 完了 |
| P7 | Vercel 本番検証 | 0.5 日 | 完了 (リポジトリ側) / 本番 deploy は DEPLOY-1 で保留 |

## 10. 設計詳細・仕様 (継承)

### 10.1 移行の骨格 (3 行要約)

1. `next/` サブディレクトリで Next.js プロジェクトを新規並行構築
2. Phase 単位でページを 1 つずつ移設 → プレビュー確認 → マージ
3. 全ページ完成後にルート切替 → 旧ソースをアーカイブ

### 10.2 一部 SSR の定義 (確定)

| 領域 | レンダリング | 詳細 |
|---|---|---|
| `/` 初期 24 件 | ISR | `revalidate` で再生成。以降は `HomeInteractive` (Client) へバトン |
| `/` 検索・無限スクロール | CSR | Client Component |
| `/<型>/[slug]` 直接アクセス | ISR | `generateStaticParams` で人気上位を事前生成 + on-demand |
| `/<型>/[slug]` 一覧からタップ | モーダル (Intercepting) | `@modal/(.)[slug]` が同じデータを取得し描画 |
| `/profile` `/settings` | CSR | プロファイル依存のため Client のみ |
| `/api/modrinth/[...path]` | Route Handler (Node) | Hono プロキシの置換 |

### 10.3 Modal Route 設計 (Parallel + Intercepting)

- `app/@modal/(.)<slug>/page.tsx` が soft-nav 時にモーダルを差し込み、
  直接 URL 時はフルページ (`app/<slug>/page.tsx`) が描画される二重構造
- 「モーダル UX」と「独立ページの SEO/共有性」を両立するための中核設計
- URL 生成は `lib/constants/search.ts` に一元化 (ルーティング再設計 ROUTE-1 で確立)

### 10.4 Hono → Route Handlers 置換

- 万能プロキシ `/api/modrinth/[...path]`: path traversal 対策・UA 付与・
  Web Streams パススルー (100MB+ ファイル対応)・Retry-After 透過
- 後の強化: CORS / レート制限 / Same-Origin (SEC-1)

### 10.5 キャッシュ戦略

- `/search` 5 分 / `/project/{id}` 1 時間 / `/version` は `unstable_cache` + slim 化
  (Data Cache 2MB 上限対策) / `/tag/game_version` 24 時間
- 詳細は `lib/modrinth/server.ts` ヘッダコメント (実装の正本)

### 10.6 ブランチ戦略

- Phase 群をブランチで並行開発 → PR ごとにマージ (PR #1 / #2 が該当)

## 11. リスク・Gotchas (継承)

- 並行構築の衝突: Vite 側を凍結して解消
- JS→CSS アセット差異: Tailwind v4 の CSS-in-CSS 方式へ移行 (`@import "tailwindcss"`)
- GSAP 等の client library は `<dynamic import>` + Suspense fallback で対応

## 12. 実績と証拠

| ID | 証拠 | 備考 |
|---|---|---|
| P0〜P7 | PR #1 (2026-08-20 マージ) + 本書 §9 の Phase 別完了記録 | 個別 SHA は当時の完了報告参照 |
| 統合後 | `docs/audit/diff-vite-vs-nextjs.md` | 全ファイル差分監査 |

移行後の継続フェーズ: [PHASE08](./PHASE08_PLAN.md) → [09](./PHASE09_PLAN.md) →
[09.5](./PHASE09_5_PLAN.md) → [10](./PHASE10_PLAN.md) → [10.5](./PHASE10_5_PLAN.md) →
[11](./PHASE11_PLAN.md) → [12](./PHASE12_PLAN.md) → [13](./PHASE13_PLAN.md)
