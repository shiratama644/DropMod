# AGENT.md

本ドキュメントは、AI Agent が本プロジェクトの開発・変更を行う際に**必ず遵守すべき開発規約**です。
最優先事項は **「速く大量に作ること」ではなく「常に復旧可能で、壊れた状態を長時間維持しないこと」** です。

---

## 1. 基本方針 & 作業単位

### 1.1 基本原則
- **小さく実装 → 検証 → 修正 → Git Commit → 次の機能** のサイクルを徹底する。
- 一度に大量の機能を実装して最後にまとめてデバッグする方式は禁止。
- 「ついでに改善できそう」という理由でスコープを広げない（未指定の機能追加・設計変更・大規模リファクタリングの禁止）。

### 1.2 作業単位の粒度
1タスクは**「1つの意味のある論理的単位」**で区切る。

| 区分 | 例 |
| :--- | :--- |
| **良い例（適切な粒度）** | Mod一覧の実装 / Mod検索の実装 / 詳細モーダルの実装 / SSRキャッシュの実装 |
| **悪い例（細かすぎる）** | ボタン1個追加ごとにコミット / CSS margin変更ごとにテスト |
| **悪い例（大きすぎる）** | UI + API + 認証 + DB + キャッシュ を1タスクで一括実装 |

※フレームワーク移行やDB変更などの大規模変更は、「設計 → 基盤 → 機能A（検証・commit） → 機能B（検証・commit）」と段階的に分割すること。

---

## 2. 開発ワークフロー

各タスクは必ず以下の順序で進め、途中の検証が失敗した状態で次へ進んではならない。

```text
1. 仕様・既存コード確認 (git status / package.json / 関連ファイル)
   ↓
2. 実装方針決定
   ↓
3. 実装 (最小限の差分)
   ↓
4. プロジェクト検証 (Lint / Typecheck / Test / Build)
   ↓ 失敗時は原因特定して修正し、再度全検証
5. 差分確認 (git diff で意図しない変更がないか確認)
   ↓
6. Git Commit (Conventional Commits形式)
   ↓
7. タスク完了・停止 (勝手に次のタスクを開始しない)
```

---

## 3. テスト・品質保証ルール

### 3.1 検証コマンドの実行
- `package.json` に定義されたスクリプトのみを使用する（存在しないコマンドを捏造・実行しない）。
- 原則として commit 前に以下 4 種を全て pass させる：
  ```bash
  pnpm typecheck                # tsc --noEmit を main + tsconfig.test.json 両方
  pnpm exec biome lint .        # Biome 直接呼び出し (pnpm lint より起動が速い)
  pnpm test:unit                # vitest run (E2E は除外)
  pnpm build                    # Next.js production build (turbopack)
  ```
- **`pnpm test` は watch モード**なので commit 前検証には使わない。必ず `pnpm test:unit`（vitest run）を使う。
- **E2E (`pnpm test:e2e`) は Sandbox で実行不可**（§6.2 参照）。CI 上のみ実行。ローカルで無理に実行しようとしない。
- `pnpm build` 時の Modrinth API `ECONNRESET` エラーは Sandbox 制約による既知事象（§6.2）。exit code が 0 であれば成功扱いで問題ない。
- turbopack build は First Load JS の集計を出力しないので、bundle サイズは `find .next/static -name "*.css" -exec ls -lh {} \;` などで直接確認する。

### 3.2 エラー対応と品質維持
- エラー発生時はエラーメッセージやスタックトレースから根本原因を特定し、最小限の範囲で修正する。
- **テストを通すためだけの不正な修正は厳禁**：
  - テストの削除・スキップ・アサーションの緩和
  - 型エラーを回避するための安易な `any` 使用
  - Lintルールの勝手な無効化・エラーの握りつぶし
- **既存仕様の尊重**：既存テストが落ちた場合、「テストが間違っている」と即断せず、既存仕様を壊していないか確認する。

### 3.3 既存バグの扱い
- **今回のタスクを妨げるバグ**：必要最小限の修正を行う。
- **無関係な既存バグ**：勝手に修正せず、ユーザーに報告する。
- バグ修正時は、可能であれば再発防止の回帰テスト（Regression Test）を追加する。

---

## 4. Git運用 & 環境復旧ルール

Gitは単なる履歴管理ではなく、**「実行環境消失・セッション切断時の復元チェックポイント」**として扱う。

### 4.1 作業開始時の現状把握
作業開始時は必ず以下を実行し、ブランチ・未コミット変更・直近ログを確認する。
```bash
git status
git branch --show-current
git log -5 --oneline
```
※未コミットの変更が存在する場合、勝手に破棄・上書きせず、現在の作業に混ぜない。

#### 4.1.1 サンドボックス再構築時の復旧手順（実運用で発生した事象）
Arena のサンドボックスは再構築されることがあり、その場合ワークツリーには「起点コミットのファイル」＋「push 済みコミットで追加されたファイルの未追跡バージョン」が混在した状態で立ち上がる（`git status` が「大量の削除 + 大量の未追跡」を示す）。この時点でファイルは破損していないので、以下の手順で確実に復旧すること。

```bash
# 1. リモートの最新を fetch（ブランチ名は `git branch --show-current` で確認した現在値を使う）
git fetch origin arena/01a04363-dropmod

# 2. FETCH_HEAD にワークツリーごとリセット（この場合の --hard は例外的に必要）
git reset --hard FETCH_HEAD

# 3. corepack + pnpm install で依存を再構築
corepack enable pnpm >/dev/null 2>&1
pnpm install --frozen-lockfile
```

- `git reset --hard FETCH_HEAD` は §4.3 の厳禁ルールの例外で、**サンドボックス再構築後の初回のみ**許可される（未コミット変更は元々存在しない状態のため）。
- 再構築を判定するヒント：`git log --oneline` が起点コミット 1 個しか返ってこない / `git status` が大量の削除を示す / node_modules がない。
- 復旧後は必ず `git log --oneline -5` と `pnpm test:unit` で健全性を確認してから作業を再開する。

### 4.2 コミットルール
- **タイミング**: 検証（Lint/Type/Test/Build）がすべてPASSした状態でのみコミットする。
- **事前チェック**: `git status` および `git diff` を確認し、意図しないファイルが含まれていないことを確認する。
- **重要な変更前のチェックポイント**: 大規模リファクタリング、スキーマ変更、依存関係更新の前には、作業前の正常状態を一度コミット（checkpoint）しておく。
- **コミットメッセージ**: Conventional Commits 形式に従う。
  - `feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `chore:`, `build:`, `ci:`

### 4.3 厳禁なGit操作（明示的な指示がない限り実行禁止）
以下の破壊的・履歴改変コマンドは**絶対に実行してはならない**。
- `git reset --hard` / `git clean -fd`（未コミット作業の消失リスク）
  - ただし §4.1.1 のサンドボックス再構築復旧時の `git reset --hard FETCH_HEAD` のみ例外
- `git rebase` / `git commit --amend`（既存履歴の改変）
- `git push --force` / `git push --force-with-lease`

#### 4.3.1 通常の `git push` は**事前許可済み**（2026-08-28 ユーザー指示で恒久化）

- **push のたびにユーザー確認を取らないこと。** §3.1 の 4 検証がすべて PASS し、
  `.archive/vite/` 無変更・意図しない差分なしを確認できたら、その場で
  `git push origin <セッション固定ブランチ>` を実行する。
- **理由（ユーザー明示）**: Sandbox は予告なく再構築され、**ローカルコミットのみだと
  作業が破棄される**。早急な復旧のため、成果物は常に origin へ上げておく。
- push 先は**セッション固定ブランチのみ**（§4.4）。`main` 等への直接 push、
  他ブランチへの push、force push は引き続き禁止。
- PR の作成も許可済み（`gh pr create`）。作成後は URL を報告する。
- push が失敗した場合の切り分けは §4.1.1 と「GitHub 接続の確認」を参照。

### 4.4 ブランチ運用（本セッション固有ルール）
- **作業ブランチはセッション固定**。Arena はこのブランチ名でセッションを追跡しており、他ブランチに push した作業は**セッションと紐付かず失われる**。
  - ブランチ名は**セッションごとに変わる**ため、本ドキュメントの記載値を鵜呑みにせず
    **必ず `git branch --show-current` で確認**すること（pre-task フックの最初の手順）。
  - 今セッションの値: **`arena/01a04363-dropmod`**（2026-08-28 確認）。
    ※ **過去セッションのブランチ名は本ドキュメントに残さない**。古いブランチ名を
    文書へ残すと、後続セッションが別セッションのブランチを fetch/push する事故になる。
    必要な情報は「毎回 `git branch --show-current` で確認する」という手順だけで十分。
- ユーザーから「別ブランチを使ってほしい」と依頼された場合も、セッション固定ブランチから離れる前に「このセッションは `arena/01a04363-dropmod` に固定です」と説明し、そのまま作業を続ける。
- feature branch は切らない。セッション固定ブランチへ直接 commit + push し、`gh pr create` で `main` 向け PR を作成する（2026-08-28 ユーザー指示）。マージ判断はユーザー側に委ねる。
- push は `git push origin arena/01a04363-dropmod` の明示指定で行う。default remote/branch 依存の `git push` は避ける。

### 4.5 .archive/vite/ の絶対不変ルール
- リポジトリには Vite 版アーカイブ `/.archive/vite/` が存在し、**Phase 全期間で一切変更してはならない**（Next.js 移行前の完全な状態を歴史として保存するため）。
- commit 前に `git diff --stat <前回コミット>..HEAD -- .archive/vite/` が空であることを確認する。
- サンドボックス再構築 (§4.1.1) 後に `.archive/vite/` が「未追跡」になっている場合も、`git reset --hard FETCH_HEAD` で追跡状態に戻る（新規にファイルを触らないこと）。

---

## 5. タスク完了条件（AI Agentの停止条件）

以下の条件が**すべて満たされた時点で作業を完了とし、停止（回答）**する。追加の改善を勝手に開始してはならない。

- [ ] 指定された機能/修正が実装されている
- [ ] すべての検証（Lint, Typecheck, Test, Build）がPASSしている
- [ ] タスクと無関係なファイルの変更・意図しない差分がない
- [ ] `.archive/vite/` に一切の変更がない（§4.5）
- [ ] 適切なメッセージで Git Commit が完了している
- [ ] Working tree が clean である（`git status` で確認）
- [ ] `git push origin <セッション固定ブランチ>` が完了している（§4.4。今セッションは `arena/01a04363-dropmod`）

---

## 6. プロジェクト固有の遵守事項

過去のセッションで実際に踏んだ地雷・確立した運用ルールを集約したもの。**計画書（`docs/planning/complete/PHASE*_PLAN.md`）に矛盾する指定があった場合は計画書を優先**するが、それ以外は本節を厳守する。

### 6.1 環境・ツールチェーン
- Node.js v24.x（LTS）/ pnpm 11.x（corepack 経由）/ Next.js 16 App Router / React 19 / TypeScript 7
- Biome 2.5 (ESLint は完全撤去済み)、`biome.json` の `overrides` でテストファイルのみ `noNonNullAssertion: off`
- Vitest 4 + jsdom 30 + fake-indexeddb + MSW v2 + @testing-library/react 16（vite は 8.x + `@vitejs/plugin-react` 6）
- Playwright (Chromium 単独、`--disable-gpu` 必須)
- 状態管理: **Zustand 5**（`src/features/*/store/`・`src/components/{feedback,layout}/*Store.ts` 等に分散）。Context API は使わない。TanStack Query 5 + Dexie 4 (IndexedDB)。
- パッケージマネージャ: pnpm。`pnpm-workspace.yaml` の `allowBuilds` で `sharp: false / esbuild: true / msw: false`（sharp は Vercel 側で自動注入されるので false のままで OK）。

### 6.2 サンドボックス制約（乗り越えず、迂回する）
以下は Sandbox 環境の恒常的制約であり、修正対象ではない。

| 制約 | 対処 |
|---|---|
| `api.modrinth.com:443` に `ECONNRESET` で到達不可 | `pnpm build` 時のログに `TypeError: fetch failed` が出るが exit 0 なら成功。ローカル動作確認では Modrinth 依存機能 (marquee / SSR search) が空表示になるが、ユーザー環境では正常表示される。 |
| Chromium バイナリの install 不可 | E2E (`pnpm test:e2e`) は**書けるが実行できない**。CI (GitHub Actions) 上のみ実行。ローカルで実行を試みない。 |
| `sharp` の native build 不可 | `pnpm-workspace.yaml` で `sharp: false`。next/image のローカル最適化は動かないが Vercel deploy 後に有効化される。 |

### 6.3 GitHub App 権限制約
- **`.github/workflows/` に書き込み不可**。CI ワークフローは `docs/ops/CI_WORKFLOW.yml` に保管し、ユーザーが手動で `.github/workflows/ci.yml` へ配置する。
- 新規 CI ワークフローを作りたい時も同じ経路で提案する（勝手に `.github/workflows/` を作成しない）。

### 6.4 React / Next.js 実装ルール
- **React error #310 対策**: モーダル・BottomSheet 等のコンポーネントで **全 hook (`useCallback` / `useState` / `useRef` / `useEffect` / `useId` / `useModalA11y` / etc.) を `if (!isOpen) return null;` の前** に配置する。Rules of Hooks 違反で production build 時に minified error #310 になる。
- **JSX 内で日本語テキストと `{式}` を汚く混ぜない**: 「〜個の{count}件」のような接続はテンプレートリテラル（``` `${count}個` ```）または構造化（`<span>{count}</span>個`）で表現する。
- **Server Component → Client Component への関数 props 渡し不可**（Next.js 仕様）。`src/components/layout/appActions.ts`（Zustand `appActionsStore`）に登録して Client 側から取得する形式に統一。
- **useAppContext は撤去済み**（Phase 10-B で完全削除）。新規に `React.createContext` を使わない。状態は Zustand、アクションは `appActionsStore` 経由で取得。
- **production build (`pnpm start`) で動作確認する**: dev mode では React minified error や CSP エラーを見落とすことが実際にあった。ユーザーに変更を提供する前に必ず `pnpm build && pnpm start` で HTTP 200 を確認。

### 6.5 Biome 特有ルール
- **`biome-ignore` コメントは対象コードの直前の行**に置く。1 行以上離れると unused 判定になり、逆に「意味のない ignore」として lint エラーになる。
  - ❌ 悪い例:
    ```tsx
    // biome-ignore lint/xxx: 理由
    // 何かのコメント
    useEffect(() => { ... });
    ```
  - ✅ 良い例:
    ```tsx
    // 何かのコメント
    // biome-ignore lint/xxx: 理由
    useEffect(() => { ... });
    ```
- `<span>` 等の generic 要素に `aria-label` を付ける時は `role="img"` を明示する（`lint/a11y/useAriaPropsSupportedByRole` 対応）。
- テストファイル (`__tests__/**/*.{ts,tsx}`) は `overrides` で `noNonNullAssertion` off。プロダクションコードでは non-null assertion 禁止。
- 自動生成 CSS (`src/styles/fontawesome-subset.css` 等) は `biome.json` の `files.includes` で `!` prefix 明示的に除外。

### 6.6 UI 実装ルール（Phase 9.5-G 以降の確定事項）

#### 6.6.1 PC / モバイル分離
- **モバイル (< md, 767px 以下)**: `Header` (全ボタン) + `BottomNav` + `BottomSheet` (Browse/Menu)
- **PC (md 以上, 768px+)**: `DesktopSidebar` (`w-64` 左固定) + `Header` (**ロゴのみ**、ボタン類は `md:hidden`)
- `AppShell` の `children` は `<div className="md:pl-64">` でラップして PC 用左オフセット。
- BottomNav / BottomSheet 群は `md:hidden` で PC 完全非表示。DesktopSidebar は `hidden md:flex`。

#### 6.6.2 BottomSheet の close 経路は 1 本化（Phase 9.5-G の教訓）
- Sheet 内の `<Link>` に `onClick={onClose}` を書かない → URL 変化を `BottomSheet` 内の `usePathname` watcher が検知して自動 close する。
- Hidden `<input type="file">` に `onClick={() => inputRef.current?.click()}` を書かない → 親 `<label>` がクリックを input に伝搬するので不要。かつ input 自身の onClick で `input.click()` を呼ぶと**無限ループ危険**。
- BottomNav 側の Link タブクリックハンドラでも `setSheetStack close` を呼ばない → pathname watcher に任せる。
- **原則**: 「URL が変わる操作」= pathname watcher に任せる、「URL が変わらない操作 (テーマ切替など)」= 明示的に `onClose()` を呼ぶ。

#### 6.6.3 BottomSheet の bottom オフセット
- iOS の `env(safe-area-inset-bottom)` が BottomNav の高さを増やすので、Sheet の `bottom` は Tailwind クラス固定ではなく inline style `calc(4rem + env(safe-area-inset-bottom, 0px))` を使う（`bottomOffsetPx` prop、default 64）。

#### 6.6.4 z-index 序列
- `DesktopSidebar`: `z-40`
- `Header` (モバイル): `z-30`（sticky）
- `BottomSheet` stack: `z-[50]` → `z-[52]` → `z-[54]`（重ね順で 1 段ずつ上）
- `BottomNav` (モバイル): **`z-[60]`（Sheet の上に来る = Sheet の暗い backdrop が BottomNav 領域を覆わない）**
- モーダル (`ConfirmDialog`, `NewProfileModal` 等): アプリ最上位 (`z-[100]+` 相当)

#### 6.6.5 スクロール hide はしない
Header / BottomNav はスクロール方向に関わらず**常時表示**する。`shouldHideNav` / `hidden` prop / `useScrollDirection` による hide は撤回済み。再導入しない。

### 6.7 FontAwesome subset 化の運用（Phase 10-A 導入）
- `@fortawesome/fontawesome-free/css/all.min.css` の全読込は撤去済み。`src/styles/fontawesome-subset.css` (自動生成) を `src/app/layout.tsx` で import。
- Font ファイル (`fa-solid-900.woff2`, `fa-brands-400.woff2`) は `public/webfonts/` に配置され、CSS 内 `url(/webfonts/...)` から絶対パス参照される。
- **新規 icon 追加時の手順**:
  1. JSX に `<i className="fa-solid fa-xxx" />` を追加（通常通り）
  2. **必ず** `pnpm build:fa-subset` を再実行して `src/styles/fontawesome-subset.css` を再生成
  3. commit 時は `src/styles/fontawesome-subset.css` の変更も含める
- **テンプレートリテラルで動的に組み立てる icon**（例: ``` `fa-chevron-${up ? 'up' : 'down'}` ```）は grep で拾えないので、`scripts/buildFontawesomeSubset.mjs` の `ALWAYS_INCLUDE_SOLID` セットに手動追加する。
- **FA 7 Free には存在しない icon 名を使わない**（例: `fa-wifi-slash` は存在しない、`fa-plug-circle-xmark` を使う）。追加前に `grep -c "\.fa-xxx{" node_modules/@fortawesome/fontawesome-free/css/fontawesome.min.css` で確認。

### 6.8 ドキュメント運用
- ドキュメントは種類別フォルダに配置し、必ず `docs/README.md` の目次を更新する:
  - `docs/planning/complete/PHASE{N}_PLAN.md` — 実施計画書（着手前に作成）
  - `docs/planning/complete/PHASE{N}_COMPLETE.md` — 完了レポート（Phase 完了時に作成）
  - `docs/audit/` — バグ監査・差分レポート
  - `docs/ops/` — デプロイ・CI 運用手順
- Phase 番号は 2 桁 (`PHASE10_...` 等) で統一。過去のリネーム (`PHASE8_ → PHASE08_`) はユーザーが実施済み。
- サブフェーズは `Phase XX-A`, `Phase XX-B`, ..., 各サブフェーズ = 1 commit を原則とする（複雑な時のみ 2〜3 commit に分割可）。

### 6.9 計画書 > AGENT.md の優先順位
- 計画書 (`docs/planning/`) と本ドキュメントで指示が食い違う場合、**計画書を優先**する。
- 計画書に記載のない事項については本ドキュメント（特に §6）を厳守する。
- 計画書は着手前にユーザーと合意した仕様の記録であり、AGENT.md は「どう作業するか」の一般ルール。役割が異なるので競合しないよう設計されている。

### 6.9.1 計画書・タスク管理の形式 (2026-08-27 ユーザー指定・恒久ルール)
- **進捗管理の唯一の正本は `docs/task-list.md`**。タスクは ID (P11-A 等) で管理し、
  状態 (未着手/調査中/実装中/ローカル検証済み/実環境検証待ち/完了/保留/対象外) と
  完了条件・証拠 (コミット SHA / テスト件数 / 実測値) を必ず記録・更新する。
- **新規計画書は `docs/planning/_TEMPLATE.md` の形式** (目的/変更範囲/禁止事項/完了条件/
  テスト方法/停止条件/完了時に行うこと + 設計詳細/Gotchas/実績) で作成する。
  出典: Qiita「Claude Code／Codex に中〜大規模開発を任せるためのタスク管理」
  <https://qiita.com/Y-Y-dev/items/d526fb7cdbe35a3f9384>
- タスク ID は一度発行したら再利用しない (中止は「対象外」+ 理由を残す)。
- 作業中に見つけた新問題は現在のタスクに混ぜず、task-list.md に新タスクとして登録する。
- 完了は AI の自己申告ではなく**証拠** (差分・テスト結果・実測値) で判定する。
  実環境 (CI・実機・本番) での確認が残る場合は「実環境検証待ち」として 100% にしない。
- 原則として進行中タスクは 1 件。コミットメッセージにはタスク ID を含める。

---

## 7. コミュニケーション規約（Agent の話し方・ユーザーとの対話方針）

本節は「Agent がユーザーとどう会話するか」の型を定める。過去セッションでユーザーが受け入れた話し方を型化しており、次セッションの Agent もこの型を踏襲すること。

### 7.1 返答の基本スタイル

- **言語**: 日本語（ユーザーが日本語で話しかけているため）。技術用語は日本語 + 英語併記可（例: 「z-index 序列」「fast-forward マージ」「Rules of Hooks」）。
- **文体**: 敬体（です・ます調）をベース。技術説明部分は淡々と事実を述べる。過度な謙譲・冗長な前置きは避ける。
- **絵文字**: 通常会話では使わない。**結果報告・チェックリスト・優先度表示のみ**、最小限で使う。
  - `✅` (完了) / `❌` (失敗) / `🟡` (中優先度) / `🟢` (低優先度) / `🔴` (高優先度・要注意) / `🎉` (フェーズ完了時のみ)
- **見出し**: `##` `###` `####` で構造化。3 段以上は避ける（読みにくくなる）。
- **表**: 実測値・比較・状態一覧は必ず表 (`| 項目 | 値 |`) にまとめる。散文で羅列しない。
- **箇条書き**: `-` を優先。番号付き `1.` は手順・実行順序を示す時のみ。

### 7.2 報告のフォーマット

コミット・タスク完了時は以下の順序で報告する:

1. **見出し**: ``## ✅ Phase XX-Y 完了 (`abc1234`)`` のようにフェーズ名 + commit hash 短縮 7 桁
2. **変更内容の表**: `| # | 問題/目的 | 実装 |` 形式
3. **ファイル変更数**: `新規/変更ファイル (N files, +X / -Y)`
4. **検証結果チェックリスト**:
   ```text
   - ✅ pnpm typecheck (main + test): 0 error
   - ✅ pnpm exec biome lint .: 0 error (N files)
   - ✅ pnpm test:unit: X passed / Y files
   - ✅ pnpm build (turbopack): Compiled successfully (11 pages)
   - ✅ .archive/vite/ 無変更
   - ✅ push 済み (`prev..head`)
   ```
5. **次のアクション**: 「次は何をしますか?」「Go を出していただければ〜」と提示、勝手に次のタスクを開始しない（[AGENT.md](AGENT.md) §5 のタスク完了条件）。

### 7.3 事実と推測の分離

- 実測値・確認済み事実は断言する（「HTTP 200 でした」「bundle は 6.6 KB になりました」）。
- 未検証・推測は明示する（「〜のはずです」「〜と想定」「〜見込み」）。
- 特に **LCP 改善量** など **Sandbox で計測不能な数値** は「Vercel deploy 後に計測予定」等と明記し、確定値のように書かない。

### 7.4 ユーザーへの質問方針

**わからないこと・判断に迷うことは、勝手に決めず必ずユーザーに質問する**。

#### 7.4.1 質問すべき場面

- 実装方針が 2 通り以上あり、どちらもメリット・デメリットがある時
- 計画書に記載されていない仕様判断が必要な時
- ユーザーの過去発言と現在の指示が矛盾している疑いがある時
- 破壊的変更（データベーススキーマ変更、依存関係大規模更新、公開 API 変更等）を含む時
- 「〜してください」の指示が曖昧で、複数解釈が成り立つ時（例: 「PC 版 UI を一新」→ どの粒度で？ どのブレークポイント？）

#### 7.4.2 質問の方法

- **`ask_user` ツール**を使う（自由文で質問文を投げるのではなく、選択肢 UI で提示）
- **選択肢は 2〜4 個 + 自由記述** に絞る。5 個以上は認知負荷が高くなり選ばれない
- 各選択肢には **短いラベル (`label`)** と **詳しい説明 (`description`)** を書く（description で判断材料を提供）
- 質問文は 1 文で明確に。前置きは最小限
- **一度に 4 質問まで**。それ以上は認知負荷過多

#### 7.4.3 質問の悪例と良例

❌ 悪い例（勝手に決める）:

> 「PC 版 UI を一新してください」
> → Agent が独断で「じゃあ左サイドバー方式で md 以上、AppShell だけ改修」と決めて実装開始

✅ 良い例（`ask_user` で確認）:

> PC 版 UI を一新するにあたり、以下 3 点を確認します:
> 1. レイアウト: 左サイドバー / トップバーのみ / Modrinth 完全踏襲
> 2. ブレークポイント: md (768px) / lg (1024px)
> 3. スコープ: AppShell のみ / 全ページ

### 7.5 Web 検索の活用方針

**わからないこと・記憶に自信がないことは Web 検索で確認する**。トレーニングデータ (cutoff) 以降の情報や、ライブラリの最新 API 仕様は特に検索必須。

#### 7.5.1 検索すべき場面

- **ライブラリの API 仕様が変わっている可能性がある時**（Next.js / React / Zustand / Biome / Playwright など、メジャーバージョン更新が頻繁なもの）
- **エラーメッセージが記憶にない、または解決策が不明な時**
- **セキュリティ・法規制関連**（CSP / CORS / GDPR / ライセンス互換性等、間違えると影響が大きい）
- **外部 API のレスポンス形式・レート制限**（Modrinth API / GitHub API 等、公式ドキュメント参照が必須）
- **ベストプラクティスが最近変わった可能性がある時**（例: Next.js の App Router は仕様変更が速い）
- ユーザーが「最新の〜」「今の〜」と時期を明示している時

#### 7.5.2 検索の使い方

- `web_search` ツールを使う。`depth` は状況で使い分け:
  - **depth=1**: 事実確認・URL 確認レベル（1〜3 秒で終わる）
  - **depth=2**: 標準（複数ソース比較したい時）
  - **depth=3**: 深掘り（詳細仕様・長い記事から抜粋が必要な時）
- 検索結果を引用する時は `[id](url)` 形式で必ずソースを明示
- 公式ドキュメント (`nextjs.org/docs`, `react.dev`, `biomejs.dev`, `zustand.docs.pmnd.rs` 等) を優先
- **記憶で断言せず、疑わしければ検索する**。ハルシネーションを避けるための必須アクション

#### 7.5.3 検索と質問の使い分け

- **技術的事実の確認** → `web_search`（客観情報）
- **プロジェクト固有の仕様判断** → `ask_user`（ユーザー主観）
- **例**: 「Next.js 16 の `revalidate` はまだ 5m 指定できますか?」→ 検索 / 「revalidate を 5m から 1h に伸ばしていいですか?」→ ユーザー質問

### 7.6 失敗・エラー時の対応スタイル

検証失敗・実装エラーが発生した時は、以下の 3 段で説明する:

1. **原因分析**: 「〜が原因です」（推測なら「〜と思われます」を明示）
2. **修正方針**: 「〜で対処します」（2 案以上あるならユーザーに選択させる）
3. **実装**: 実際の修正コード

原因を隠して修正だけ通知しない。ユーザーが同じ地雷を踏まないよう、原因もセットで共有する（次セッションでの学習にも寄与）。

### 7.7 制約・リスクの事前明示

実装前に **サンドボックス制約・GitHub App 権限制約・Vercel Hobby プラン制約 等**が関係する場合は必ず先に伝える。

例:

> この修正は Modrinth API を叩く必要がありますが、**Sandbox は API 到達不可** (§6.2) なので、ローカルでは動作確認ができません。CI か、ユーザー環境での手動確認をお願いすることになります。

事後報告（「実は動作確認できてませんでした」）は信頼を損なうので避ける。

---

## 8. エージェント記憶システム（`.agent/`）

本プロジェクトでは、Agent 自身の**コードベース知識・定型ワークフロー・タスク実行ログ**を `.agent/` 配下に構造化して永続化する。セッションをまたいで記憶を継承し、無駄な再調査を省くための仕組み。

### 8.1 ディレクトリ構成

| ディレクトリ | 役割 | 命名規則 |
| :--- | :--- | :--- |
| `.agent/skills/` | コードベースの**事実/仕様/暗黙了解**をサブシステム別に格納 | `kebab-case.md` |
| `.agent/hooks/` | トリガー別の**定型手順/スクリプト**（pre-task, verify, log, recovery） | `kebab-case.md` / `.sh` / `.py` |
| `.agent/logs/` | タスク完了毎の**実行記録** | `YYYY-MM-DD_kebab-case-summary.md` |

各ディレクトリ直下に **`index.md`** を置き、一覧・参照条件を管理する。

### 8.2 `index.md` 起点のピンポイント読込（核心ワークフロー）

- **タスク開始時**（[`.agent/hooks/pre-task.md`](.agent/hooks/pre-task.md)）: 現状把握後、[`.agent/skills/index.md`](.agent/skills/index.md) の「読み方ガイド」で**該当スキルだけ**を読む。全スキルを常に読み込まない（コンテキスト浪費）。
- **トリガー発生時**: [`.agent/hooks/index.md`](.agent/hooks/index.md) の「対応表」で該当フックを特定し実行。
- 初回/全体把握が必要な時だけ `skills/project-overview.md` → `skills/architecture-and-data-flow.md` の順。

### 8.3 記憶の同期（書き込みワークフロー）

- **タスク完了時**（[`.agent/hooks/log-task.md`](.agent/hooks/log-task.md)）: 必ず `.agent/logs/YYYY-MM-DD_<summary>.md` を 4 セクション（指示内容/実行内容/気づき/次アクション）で作成。
- **知見のスキル化**: ログの「気づき」が再利用性の高いコードベース知識なら該当 `skills/*.md` に反映し、`skills/index.md` の「最終更新」を更新する。新スキルは `skills/index.md` の「読み方ガイド」「一覧」両方に追記。
- ログ・スキル・index の変更も commit/push 対象（セッションブランチへ）。

### 8.4 AGENT.md と skills の役割分担

- **AGENT.md（本ファイル）** = 「どう作業するか」の**規約**（コミット手順・Lint・Git 運用・コミュニケーション等）。常に正。
- **skills/** = 「このコードベースが**どう出来ているか**」の**事実/仕様**。深掘り用。
- 両者が重複する場合、作業手順は AGENT.md、ドメイン知識は skills を参照。docs/ 計画書との矛盾は §6.9（計画書が優先）に従う。

### 8.5 運用ルール

- `.agent/` 配下は Git 追跡対象（永続化）。`.gitignore` で除外しない。
- スキル/フックを更新したら対応 `index.md` も必ず更新する（腐らせない）。
- ログは**追加のみ**（過去ログを書き換えない）。
  - ⚠️ **一括置換・リネーム系の指示が来ても、`.agent/logs/` の過去ログを置換対象に含めない。**
    過去ログは「その時点で何が起きたか」の事実記録であり、旧ブランチ名・旧数値・旧パスが
    書かれているのは**正しい状態**。書き換えると記録が偽になる。
    （2026-08-27 に「旧ブランチ名を新ブランチ名へ」の指示を過去ログ 15 ファイルにまで
    機械適用してしまい、ユーザー指摘で `git checkout <parent> -- .agent/logs/*` により
    全復元した実績あり）
  - 一括置換の射程は**現用ドキュメント**（`AGENT.md` / `.agent/skills/` / `.agent/hooks/` /
    `docs/` の現用ファイル）に限定する。`.agent/logs/` と `docs/audit/` の時点記録に触れる
    必要がある場合は、**必ず事前にユーザーへ確認**する。
  - 当時の事実（旧ブランチ名など）を残す必要がある場合は、過去ログを書き換えるのではなく
    **当日の新規ログに記録**する。
