# Phase 10 候補リスト

Phase 9 完了時 (`577c31a`) 時点で意図的に見送った項目、および今後のロードマップ検討候補。計画書 `docs/planning/PHASE9_PLAN.md` §9.3 の DoD 「実装しなかった項目は `docs/planning/PHASE10_CANDIDATES.md` に記録」に対応。

Phase 10 の詳細計画書はまだ作成しない (ユーザーレビュー後に方針決定)。

---

## ⚠️ 【重要方針】Vercel デプロイは Phase 10 の**全項目完了後**に実施

> **決定**: Vercel 本番デプロイは Phase 10 の他の全項目 (bundle 削減 / AppContext 削除 / Markdown 画像最適化 / E2E 拡張 / shimmer skeleton 等) を完了した後の**最終ステップ**として実施する。
>
> 従来「Phase 10 の最優先項目」として位置付けていたが、以下の理由で**最後**に配置する。

### 決定理由: Vercel Hobby プランのリソース制約

Vercel Hobby プランは無料だが以下の**厳しい上限**があり、開発途中で SSR/ISR
を大量に消費すると即座に上限に達してアプリが停止するリスクがある:

| 項目 | Hobby プラン上限 | DropMod のリスク |
|---|---|---|
| **Function Invocations** | 100k / 月 | ISR revalidation で `/mods/[slug]` (100 pages) が定期実行、開発中に何度も再ビルドすると加速消費 |
| **Function Duration** | 100 GB-Hrs / 月 | Modrinth API 遅延時に fetch が長引くと消費増 |
| **Data Transfer (Bandwidth)** | 100 GB / 月 | 大 Modpack (JEI/no-chat-reports 数 MB) の SSR/ISR で消費 |
| **Build Executions** | 100 / 日 (soft limit) | 開発中の頻繁な push で枯渇の可能性 |
| **ISR Revalidations** | 上記 Function Invocations に含まれる | fetch cache tags で triggered revalidate も対象 |

### Phase 10 実施中に想定されるリスク

- 開発中に `pnpm build` で `generateStaticParams` が Modrinth API を叩く (100 リクエスト/build)
- 何かの原因で ISR が短時間で複数回 revalidate される (バグ / 誤設定 / tag invalidation)
- Bundle 削減や `<Image>` 化のテストで **意図せず頻繁に production deploy** してしまう
- 開発途中の SSR エラー時に Vercel 側で retry が走る

**Hobby プランでは上限到達 = プロジェクト即停止**であり、開発が完全に止まる。

### 対策

1. Phase 10 の全項目 (下記優先順位 §Phase 10 実施順) を **ローカル + `pnpm build` + 手動 `pnpm start` で検証**
2. E2E テストも **CI (GitHub Actions) 上のみ**で回す (無料枠 2,000 分/月)
3. Modrinth API との実通信を伴う機能検証はローカル `next dev` で完結させる
4. **全項目完了・ユーザー最終確認済み**の状態で、初めて Vercel Preview → Production に deploy

### Phase 11 / 12 / 13 との関係

ChatGPT レビュー (2026-08-24) に基づき、ローカル Minecraft 環境連携は
**3 Phase に分割** された:

- **Phase 11** (`docs/planning/PHASE11_PLAN.md`): Read-only Import & Analysis
- **Phase 12** (`docs/planning/PHASE12_PLAN.md`): Sync (書き込み) + Modrinth Modpack
- **Phase 13** (`docs/planning/PHASE13_PLAN.md`): CurseForge 完全対応

これらすべて Vercel デプロイ前に完了する (deploy 後だと本番リスクが高まる):

```
[今]  Phase 10 の残タスク (bundle / cleanup / test / UI polish)
  ↓
[次]  Phase 11 (Read-only Import & Analysis) — 4〜6 週
  ↓
      Phase 12 (Sync + Modrinth Modpack) — 4〜5 週
  ↓
      Phase 13 (CurseForge 完全対応) — 2〜3 週
  ↓
[最後] Vercel 本番 Production Deploy — 全機能揃った状態で公開
```

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

## 🚀 Vercel 本番デプロイ (Phase 10 の最終ステップ)

**現状**: `vercel.json` / `next.config.ts` / OGP / sitemap / robots.ts など Phase 7 で完了済み、実デプロイは未実施。

**⚠️ タイミング方針の変更 (2026-08-24 決定)**:
従来「Phase 10 の最優先項目」だったが、**Vercel Hobby プランのリソース制約**
により Phase 10 + Phase 11 + Phase 12 + Phase 13 の全項目完了後の**最終ステップ**に
位置付け直し。詳細は本ドキュメント冒頭の「【重要方針】」節を参照。

**着手前チェックリスト** (これらが全て ✅ になってから deploy):
- [ ] FontAwesome subset 化 (bundle 900 KB 目標達成)
- [ ] AppContext.tsx 完全削除
- [ ] Markdown 内 `<Image>` 化 (LCP 改善)
- [ ] E2E カバレッジ拡張 (zip-export / zip-import / dep-check)
- [ ] shimmer skeleton (UX 磨き上げ)
- [ ] Phase 11 (Read-only Import & Analysis) 完了
- [ ] Phase 12 (Sync + Modrinth Modpack) 完了
- [ ] Phase 13 (CurseForge 完全対応) 完了
- [ ] `pnpm build` がローカルで完全 clean (0 warning)
- [ ] Modrinth API rate limit テスト (localhost で `generateStaticParams` を
      複数回叩いても 429 回避できる)
- [ ] Bundle 分析で異常な巨大化がないこと (`.next/analyze/` 等で確認)

**Phase 10 実施内容 (deploy 当日)**:
1. Vercel プロジェクト作成、GitHub Integration 接続
2. `main` ブランチ → 自動 build + deploy 設定
3. `NEXT_PUBLIC_SITE_URL` / `MODRINTH_USER_AGENT` / `MODRINTH_FETCH_TIMEOUT_MS`
   / `MODRINTH_MAX_RETRY_WAIT_MS` を Vercel Env に設定
4. カスタムドメイン割当 (任意)
5. CSP を Report-Only → Enforce 切替 (Phase 8-E の準備完了済み、Phase 10 で本移行)
6. Vercel Analytics 有効化 + web-vitals 送信先 (`/api/analytics`) 設定
7. **Preview → Production の 2 段階 deploy** (いきなり production は避ける)
8. Deploy 直後に Vercel Dashboard で Function Invocations / Bandwidth を監視

**Hobby プラン監視ダッシュボード**:
- Deploy 後 24 時間: Function Invocations を毎日確認、想定より速い消費なら
  即座に ISR revalidate 間隔を延長 (現状 1h → 6h や 24h) で対処
- 想定外の消費増を検知した場合は **一時的に production を pause** する運用手順を
  README に整備

**優先度**: 🔴 最終ステップ (Phase 10 + Phase 11 + Phase 12 + Phase 13 の全項目完了後に実施)

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

## 🎯 Phase 10 実施順の推奨 (2026-08-24 更新: Vercel を最後に配置)

**方針変更**: Vercel Hobby プランのリソース制約により、Vercel 本番デプロイは
Phase 10 の他全項目 + Phase 11 + Phase 12 + Phase 13 完了後の**最終ステップ**として実施する
(冒頭「【重要方針】」節参照)。

**推奨実施順**:

1. **FontAwesome subset 化** (bundle 900 KB 目標達成) 🟡
2. **AppContext.tsx 完全削除** (grep 確認後の後方互換整理) 🟡
3. **9-E.2 Markdown 内 `<Image>` 化** (LCP 改善) 🟡
4. **E2E カバレッジ拡張** (zip-export / zip-import / dep-check) 🟡
5. **9-E.3 shimmer skeleton** (UX 磨き上げ) 🟢
6. *(Phase 11: Read-only Import & Analysis 完了)*
7. *(Phase 12: Sync + Modrinth Modpack 完了)*
8. *(Phase 13: CurseForge 完全対応 完了)*
9. **🚀 Vercel 本番デプロイ** — 最終ステップ、全項目完了・ユーザー最終確認済み
   の状態でのみ実施 🔴

**理由の再掲**:
- 上記 1〜5 と Phase 11 / 12 / 13 の開発中は **ローカル + CI のみで検証**
- 全機能揃った状態で Vercel Preview → Production の 2 段階 deploy
- Hobby プランの上限 (100k Function Invocations / 月, 100 GB Bandwidth / 月)
  を意図せぬ消費で使い切るリスクを最小化

Phase 10 詳細計画書は上記優先度をユーザーが確認・調整した後に作成する。

---

*このリストは Phase 9 完了時点 (2026-08-23) の情報です。Phase 10 開始前に再確認・追加・削除してください。*
*2026-08-24 更新: Vercel デプロイのタイミングを「最優先」→「最終ステップ」に変更 (Hobby プラン制約対策)。*
