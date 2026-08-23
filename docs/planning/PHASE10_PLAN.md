# Phase 10 実施計画書

**開始日**: 2026-08-23
**HEAD 起点**: `e156653` (Phase 9.5-G 完了、PC UI 一新)
**目的**: `PHASE10_CANDIDATES.md` の推奨実施順に沿い、Vercel デプロイ前の 5 項目を確実に完了させる。

---

## 0. 方針 (計画書 > AGENT.md、ただし AGENT.md のサイクル厳守)

- **1 サブフェーズ = 1 commit (原則)**、複雑な場合は 2〜3 commit に分割可能
- 各 commit 前に **必ず**: `pnpm typecheck` (main + test) + `pnpm exec biome lint .` + `pnpm test:unit` + `pnpm build` + `.archive/vite/` 無変更確認
- **Vercel デプロイは Phase 13 完了後**の最終ステップ (Hobby プラン制約、`PHASE10_CANDIDATES.md` §「【重要方針】」参照)
- Phase 10 内でユーザーが Go を出した項目から順次進める (デフォルトは下記推奨順)

---

## 1. サブフェーズ一覧 (推奨実施順)

### Phase 10-A: FontAwesome subset 化 🟡

**目的**: Home ページ bundle を 963 KB → 目標 900 KB 台に削減 (Phase 9 で未達成の 63 KB 超過分を回収)。

**現状 (2026-08-23 時点)**:
- `@fortawesome/fontawesome-free` を `app/layout.tsx` または `app/globals.css` で全 CSS import (~800 KB uncompressed)
- 実際に使う icon は 30 個以下 (grep 予定)
- `optimizePackageImports` は CSS-only では効かない

**実施内容**:
1. `grep -rn 'fa-solid\|fa-brands\|fa-regular' app components hooks | grep -oE 'fa-[a-z-]+' | sort -u` で使用 icon を列挙
2. `@fortawesome/react-fontawesome` + `@fortawesome/free-solid-svg-icons` 等の個別 icon import に切替
3. または: PostCSS 経由で使用 icon のみ subset 抽出 (fontawesome-subsetter などのツール)
4. `app/globals.css` から fontawesome の全 CSS import を削除
5. 全ページで icon 表示崩れがないか production build で目視 (11 pages)
6. Bundle 分析 (`.next/analyze/` または `next build --experimental-turbopack-analyze`) で削減量を確認

**選択方針**:
- **A案: react-fontawesome 個別 import** — 開発時の icon 追加コスト増 (import 忘れでバグる)、ただし tree-shaking が確実
- **B案: fontawesome-subsetter (PostCSS 経由)** — CSS-only で `fa-xxx` クラス継続使用可、追加時の import 不要、subset config は 1 箇所

→ **B 案優先** (現在の `<i className="fa-solid fa-cube">` 記法を全て書き換えるコストが大きく、リグレッションリスクが高い)
→ ただし fontawesome-subsetter が pnpm workspace で動くかを事前確認、無理なら A 案フォールバック

**期待効果**: -400〜600 KB (使用 icon 数次第、実測待ち)
**リスク**: icon 表示崩れ / 未使用検出漏れ → 全ページ目視で緩和
**推定作業量**: 半日〜1 日

---

### Phase 10-B: AppContext.tsx 完全削除 🟡

**目的**: Phase 9-A.5 で stub 化した後方互換レイヤーを撤去、コードベースを整理。

**現状**:
- `components/AppContext.tsx` は stub (`useAppContext()` は throw、Provider は pass-through)
- 消費者は Phase 9-A で全て `useAppActionsStore` (Zustand) 直接参照に移行済み

**実施内容**:
1. `grep -rn 'useAppContext\|AppContext\|AppContextProvider' app components hooks lib __tests__` を実行
2. 依存が 0 件 (import 元は `components/AppContext.tsx` 自身と `components/AppShell.tsx` の pass-through のみ) を確認
3. `AppShell.tsx` から `AppContextProvider` の import と JSX ラッパーを削除
4. `components/AppContext.tsx` を削除
5. 単体テストで `AppContext` を参照しているものがないか再確認 (0 件の想定)
6. `pnpm build` + E2E 相当の HTTP 200 チェックで全ページ動作確認

**期待効果**: -1 file (~50 LOC)、認知コスト減
**リスク**: なし (既に stub 化済み、消費者ゼロ)
**推定作業量**: 30 分

---

### Phase 10-C: Markdown 内 `<Image>` 化 🟡

**目的**: LCP 改善 (Modrinth CDN 画像を Next.js `<Image>` に置換)。

**現状**:
- `components/MarkdownRenderer.tsx` が `react-markdown` + `rehype-sanitize` で `<img>` タグを許容し、ネイティブ描画
- Modrinth CDN パターンは `next.config.ts` の `remotePatterns` に登録済み (Phase 7)

**実施内容**:
1. `MarkdownRenderer.tsx` の `components.img` カスタム renderer で、`src` が Modrinth CDN (`cdn.modrinth.com` / `staging-cdn.modrinth.com`) なら `next/image` の `<Image>` に置換
2. `<Image>` は width/height 必須 → `fill` + 親要素の relative position + max-width で対応
3. Modrinth CDN 外の画像 (自己 host / 他 CDN) はそのまま `<img>` フォールバック
4. Mod 詳細ページ (`/mods/[slug]`) と Intercepting モーダルで表示を確認
5. Chrome DevTools > Performance で LCP 実測 (Sodium など画像多めの mod で)

**期待効果**: LCP 100〜300 ms 改善 (計画書見積り)
**リスク**: Modrinth CDN で width/height 事前取得不可 → `fill` + aspect-ratio で回避
**推定作業量**: 半日

---

### Phase 10-D: E2E カバレッジ拡張 🟡

**目的**: リグレッション検出強化 (現状 5 spec → 8-9 spec に)。

**現状**:
- `e2e/smoke.spec.ts` / `mods-page.spec.ts` / `mod-detail-modal.spec.ts` / `offline.spec.ts` / `theme-persistence.spec.ts`
- Sandbox は Chromium install 不可 → CI (GitHub Actions) でのみ実行

**実施内容**:
1. **`zip-export.spec.ts`**: プロファイルに 3 mod 追加 → ZIP 保存 → Playwright download API で中身検証
2. **`zip-import.spec.ts`**: `.mrpack` ダミーファイルを drop → プロファイル作成完了確認
3. **`dep-check.spec.ts`**: 依存関係のある mod 追加 → 依存 mod 削除 → 警告バッジ点灯確認
4. Sandbox 上では書けるが実行できないため、`.github/workflows/` の CI ワークフローで走ることを前提とする

**期待効果**: リグレッション検出率向上、Vercel デプロイ前の安心感
**リスク**: Modpack ダミーファイル生成のセットアップ (小サイズの `.mrpack` fixture 追加)
**推定作業量**: 1 日

---

### Phase 10-E: shimmer skeleton 🟢

**目的**: UX 磨き上げ (loading の見た目改善)。

**現状**: `animate-pulse` のグレー pulsating

**実施内容**:
1. `app/globals.css` に `@keyframes shimmer` 追加 (左→右への白 sweep グラデーション)
2. `.skeleton-shimmer` utility class を定義
3. `HomeInteractive.tsx` / `ModDetailModalShell.tsx` / `PreviewCard` などの skeleton を shimmer 化
4. Reduced Motion 環境では shimmer 無効化 (grey static)

**期待効果**: 知覚パフォーマンス向上
**リスク**: なし
**推定作業量**: 半日

---

## 2. 完了条件 (DoD)

Phase 10 全体の完了は以下を満たすこと:

- [ ] Phase 10-A/B/C/D/E の全 5 サブフェーズ完了 (各 commit + push)
- [ ] `pnpm build` の Home ページ bundle が **900 KB 台**
- [ ] `pnpm test:unit` 全 pass、`pnpm exec biome lint` 0 error
- [ ] `AppContext.tsx` が repo に存在しない (`git ls-files | grep -i appcontext` が空)
- [ ] E2E 全 spec を CI で 1 度以上 green (ユーザーが CI 実行 → 結果報告で確認)
- [ ] `docs/complete/PHASE10_COMPLETE.md` を作成し、実測値・スクリーンショット・削減量を記録
- [ ] `.archive/vite/` 無変更 (Phase 全体で不変)

---

## 3. リスク & ロールバック方針

- 各サブフェーズは独立 commit → 問題発生時は該当 commit の revert で戻せる
- FontAwesome subset 化 (Phase 10-A) が最もリスク高 (全ページ icon 表示に影響)
  → subset 化前に「使用 icon 一覧」の CSV を `docs/audit/fontawesome-usage.md` に保存し、リグレッション時に追加できる備えを持つ
- Markdown `<Image>` 化 (Phase 10-C) は Modrinth CDN 限定 → fallback で `<img>` を維持

---

## 4. 次のフェーズ (完了後)

- Phase 11: Read-only Import & Analysis (`PHASE11_PLAN.md`)
- Phase 12: Sync + Modrinth Modpack (`PHASE12_PLAN.md`)
- Phase 13: CurseForge 完全対応 (`PHASE13_PLAN.md`)
- 最終ステップ: Vercel 本番デプロイ (`PHASE10_CANDIDATES.md` §「【重要方針】」)
