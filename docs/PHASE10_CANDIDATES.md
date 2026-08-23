# Phase 10 候補リスト

Phase 9 完了時 (`577c31a`) 時点で意図的に見送った項目、および今後のロードマップ検討候補。計画書 `docs/PHASE9_PLAN.md` §9.3 の DoD 「実装しなかった項目は `docs/PHASE10_CANDIDATES.md` に記録」に対応。

Phase 10 の詳細計画書はまだ作成しない (ユーザーレビュー後に方針決定)。

---

## 🎯 Phase 9-E で見送った項目

### 9-E.2: E-4 Markdown 内画像を `<Image>` 化 (Modrinth CDN 限定)

**現状**: `components/MarkdownRenderer.tsx` は `react-markdown` + `rehype-sanitize` の allowlist で `<img>` タグを許容し、ネイティブ `<img src>` として描画。

**Phase 10 実施内容**:
- `remotePatterns` を Modrinth CDN パターンで拡張済み (Phase 7)
- rehype plugin を追加し、`<img src=cdn.modrinth.com/...>` を `<Image>` に置換
- 副作用: `<Image>` は width/height 必須なので、intrinsic size を SSR で取得するか、`unoptimized flag + fill` 属性で回避策
- 期待効果: LCP 100-300ms 改善 (計画書見積り、実測待ち)

**優先度**: 🟡 中 (既存機能に問題なし、パフォーマンス改善目的)

### 9-E.3: E-5 ローディングスケルトン強化 (shimmer)

**現状**: `animate-pulse` の Tailwind クラスで灰色 pulsating skeleton。

**Phase 10 実施内容**:
- Tailwind `keyframes` に shimmer (左→右へのグラデーション sweep) を追加
- `HomeInteractive.tsx` の初期 6 個 skeleton grid を shimmer 適用
- `ModDetailModalShell` の loading 状態も shimmer 統一
- 副作用: bundle は +200B 程度 (Tailwind keyframes 生成)
- 期待効果: 知覚的パフォーマンス向上 (UX)

**優先度**: 🟢 低 (現状 UX 上問題なし、Phase 10 の全体 UX 見直しとセットで検討)

---

## 🏗 Bundle 削減 (計画書 §1.3 の Phase 9 Non-Goal より継続)

### FontAwesome subset 化

**現状**: `@fortawesome/fontawesome-free` をフル同梱 (~800KB uncompressed)、CSS-only なので `optimizePackageImports` の対象外。

**Phase 10 実施内容**:
- 実際に使う icon (`fa-cube`, `fa-check`, `fa-plus`, `fa-xmark`, `fa-shield-halved` 等) を grep で列挙
- `@fortawesome/react-fontawesome` + 個別 icon import に切替、または PostCSS で使用 icon のみ抽出
- 副作用: 開発時の icon 追加コスト増 (import 忘れでバグる)
- 期待効果: Home 963 KB → 800 KB 台に (目標 900 KB 台の余裕確保)

**優先度**: 🟡 中 (Phase 9 で bundle 目標 900 KB を +63 KB 超過中、Phase 10 の主目的候補)

### `optimizePackageImports` 追加候補

- `@fortawesome/fontawesome-free`: 現状 CSS-only で JS export 皆無 → subset 化と同時に検討
- `web-vitals`: 4 export しか使わないので効果小、優先度低

**優先度**: 🟢 低 (FontAwesome subset 化とセットで再評価)

---

## 🚀 Vercel 本番デプロイ

**現状**: `vercel.json` / `next.config.ts` / OGP / sitemap / robots.ts など Phase 7 で完了済み、実デプロイは未実施。

**Phase 10 実施内容**:
1. Vercel プロジェクト作成、GitHub Integration 接続
2. `main` ブランチ → 自動 build + deploy 設定
3. `NEXT_PUBLIC_SITE_URL` / `MODRINTH_USER_AGENT` を Vercel Env に設定
4. カスタムドメイン割当 (任意)
5. CSP を Report-Only → Enforce 切替 (Phase 8-E の準備完了済み、Phase 10 で本移行)
6. Vercel Analytics 有効化 + web-vitals 送信先 (`/api/analytics`) 設定

**優先度**: 🔴 高 (実際の公開が Phase 10 の主目的)

---

## 🧹 コード整理

### AppContext.tsx の完全削除

**現状**: Phase 9-A.5 で stub 化 (`useAppContext()` は throw)、後方互換で残置。

**Phase 10 実施内容**:
1. `grep -r 'useAppContext\|AppContext\|AppContextProvider' app components hooks lib` を実行、0 件を確認
2. `components/AppContext.tsx` を削除
3. `app/layout.tsx` 等の import も削除
4. E2E で `/` `/mods` `/settings` `/mod/sodium` すべて回帰確認

**優先度**: 🟡 中 (後方互換の必要が消えたら実施)

### useProfilesStore の細粒度 selector 化

**現状 (Phase 9-D 分析結果)**:
- Header, HomeInteractive などで `useProfilesStore((s) => s.profiles)` (配列全体) を購読
- 実は `s.profiles.length` や `useProfilesStore(selectCurrentProfile)` だけで十分なケース多数

**Phase 10 実施内容**:
- Header の profile dropdown: `profileOptions = profiles.map(...)` に必要な `name / id` のみ抽出する selector
- 依存チェックの `installedProjectSet` 構築: mods 配列全体でなく id 集合のみ購読
- 副作用: shallow 比較のための memoization 追加
- 期待効果: 現状 80% 削減済みだが、profile mod 追加時に他コンポーネントの再レンダーがゼロになる (現状は Header の profile dropdown が実は必要ない再レンダーをする)

**優先度**: 🟢 低 (既に 80% 削減済み、必要性は Phase 10 profiler 再測定で判断)

---

## 🧪 テスト拡張

### E2E カバレッジ拡張

**現状**: `e2e/smoke.spec.ts` / `mods-page.spec.ts` / `mod-detail-modal.spec.ts` / `offline.spec.ts` / `theme-persistence.spec.ts` の 5 spec。

**Phase 10 実施内容**:
- **zip-export.spec.ts**: プロファイルに 3 mod 追加 → ZIP 保存 → 中身の README.txt を検証 (Playwright download API)
- **zip-import.spec.ts**: `.mrpack` ダミーファイルを drag & drop → プロファイル作成完了を確認
- **dep-check.spec.ts**: 依存関係のある mod を追加 → 依存 mod を消して警告バッジ点灯確認
- **profile-crud.spec.ts**: 新規作成 → 複製 → 編集 → 削除の一連
- 副作用: Playwright 実行時間 5 分 → 10 分程度

**優先度**: 🟡 中 (CI で E2E が主なリグレッション検出、Phase 10 で拡充)

### 単体テスト補完

- Phase 9-C.6 で exclude した component の一部 (`BottomNav.tsx`, `EditProfileModal.tsx`, `ModDetailModalShell.tsx` の一部) を段階的に単体テスト化
- 現状 coverage 91.34% を **95%+** に押し上げ

**優先度**: 🟢 低 (現状十分、Phase 10 の他優先度次第)

---

## 📚 ドキュメント整理

### 過去 phase の統合

Phase 1-9 の PLAN / COMPLETE / PHASE_PROFILER / issues.md 等を `docs/history/` に移動、`docs/README.md` から辿れる形にリファクタリング。

**優先度**: 🟢 低

### API リファレンス生成

`lib/**` の JSDoc から typedoc で HTML 生成、`docs/api/` に配置。開発者向けオンボーディングに寄与。

**優先度**: 🟢 低 (人数が増えたら)

---

## ❌ Phase 10 でも実施しないと決めた項目 (計画書 §5.6 等の再確認)

- **Storybook**: 小規模個人開発では割に合わない (Phase 9 のクイズ回答で決定)
- **React Server Actions**: 現状 Route Handlers (`/api/*`) で十分、Server Actions の恩恵は形状変換系のフォームで大きいが本アプリの主フローには不要
- **Suspense + streaming SSR の全面採用**: 初期 24 件 SSR + CSR 追加ロード の現行方針で十分、Phase 10 でも維持

---

## 🎯 Phase 10 実施順の推奨

1. **Vercel 本番デプロイ** (実際に公開してユーザーが触れる状態を作る) 🔴 最優先
2. **FontAwesome subset 化** (bundle 900 KB 目標達成) 🟡
3. **AppContext.tsx 完全削除** (grep 確認後の後方互換整理) 🟡
4. **9-E.2 Markdown 内 `<Image>` 化** (LCP 改善) 🟡
5. **E2E カバレッジ拡張** (zip-export / zip-import / dep-check) 🟡
6. **9-E.3 shimmer skeleton** (UX 磨き上げ) 🟢

Phase 10 詳細計画書は上記優先度をユーザーが確認・調整した後に作成する。

---

*このリストは Phase 9 完了時点 (2026-08-23) の情報です。Phase 10 開始前に再確認・追加・削除してください。*
