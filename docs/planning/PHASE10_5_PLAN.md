# Phase 10.5 (Emergency): カバレッジ回復 — vitest 4 アップグレード対応

> 作成: 2026-08-26 / 起点コミット: `ccd5f98` (vitest 3.2.7 → 4.1.11)
> 位置付け: Phase 10 完了後・Phase 11 着手前の**割り込み緊急タスク**（ユーザー指示）。
> Phase 11 は本フェーズ完了後に着手する。

---

## 0. 方針 (計画書 > AGENT.md、ただし AGENT.md のサイクル厳守)

1. **閾値の緩和はしない**（ユーザー決定）。テストを追加してカバレッジを回復する。
2. **coverage.exclude の追加は既存ポリシーの整合性のみ**（§3.2 参照）。閾値回避のための除外はしない。
3. vitest 4 への rollback はしない。AST ベースの新カバレッジ数値（旧 v8-to-istanbul より正確）を正とする。
4. 各サブフェーズ = 1 commit。commit 前 §3.1 の 4 検証（typecheck / biome lint / test:unit / build）を pass させる。
5. サブフェーズ A→B→C で**全 threshold green** を目指す。D/E は品質強化（green 後に実施可）。

---

## 1. 背景: なぜ Emergency か

### 1.1 経緯

- vitest 3 → 4 アップグレード（`ccd5f98`）に伴い、V8 coverage のリマッピングが
  v8-to-istanbul（過大計上あり）から **AST ベース**（正確）に変更され、branch/function 数値が低下。
- さらに測定の結果、**Phase 10-P1 / ルーティング再設計で追加されたファイルが未テストのまま**
  だったことが判明（`pnpm test:unit` は threshold を見ないため検知されず、CI も最近未実行だった）。
  - 具体的には **components stmt/lines は vitest 3 時点でも 49.86% < 50% で違反**していた。
- CI（`docs/ops/CI_WORKFLOW.yml`）の static-checks job は `pnpm test:coverage` を gate にしているため、
  **CI 整備・実行時に必ず落ちる**。Phase 11 の CI 保証体制を壊さないため緊急対応とする。

### 1.2 現状の threshold 違反 (vitest 4.1.11, `ccd5f98` 時点の測定)

| threshold | 現在値 | 閾値 | 必要カバー数 | ギャップ |
|---|---|---|---|---|
| global branches | 59.23% (995/1680) | 60% | 1008 | **+13 br** |
| lib/store branches | 76.06% (54/71) | 80% | 57 | **+3 br** |
| hooks branches | 54.86% (316/576) | 60% | 346 | **+30 br** |
| components statements | 47.08% (347/737) | 50% | 369 | **+22 stmt** |
| components lines | 47.91% (309/645) | 50% | 323 | **+14 lines** |
| components functions | 42.14% (67/159) | 50% | 80 | **+13 fn** |

※ global statements (69.42%) / lines (70.83%) / functions (74.10%) および
lib/state・lib/db・lib/query・lib/modrinth・lib/utils の per-module threshold は現状 pass。

### 1.3 vitest 3 → 4 の数値変化（同一ソースでの実測比較）

| 指標 | vitest 3 | vitest 4 | 備考 |
|---|---|---|---|
| statements | 68.42% | 69.42% | 微増（ランタイムコード無し行が除外されるため） |
| branches | 78.33% | **59.23%** | 旧 v8-to-istanbul の過大計上分が消えた |
| functions | 90.77% | 74.10% | 同上 |
| lines | 68.42% | 70.83% | 微増 |

-低下は「正確化」であり、旧数値を基準にした閾値（branches 60 等）が
実態より高く設定されていたことが露見した。ただし §0-2 の通り**閾値は緩和せず**、
未テストファイルへのテスト追加で対応する。

---

## 2. 未カバーインベントリ (0% ファイル、vitest 4 実測)

### 2.1 hooks（→ hooks branches ギャップ +30 の主因）

| ファイル | stmt | br | fn | 行数 | 内容 |
|---|---|---|---|---|---|
| `hooks/useCountUp.ts` | 0/32 | 0/16 | 0/7 | 85 | IntersectionObserver + anime.js カウントアップ、reduced-motion 分岐 |
| `hooks/useScrollDirection.ts` | 0/30 | 0/13 | 0/5 | 78 | scroll 方向検知、rAF throttle、jitter しきい値分岐 |
| `hooks/useScrollReveal.ts` | 0/36 | 0/16 | 0/6 | 99 | IntersectionObserver + anime.js reveal、reduced-motion 分岐 |
| `hooks/useModalA11y.ts` | 69.87% | **44.23%** (23/52) | 81.81% | — | 既存テストあり。branch 補強で hooks/global に上乗せ |

3 ファイル合計 **45 branches** → 70% カバーで +31br、hooks 60% 超え & global 60% 超えを同時達成。

### 2.2 components（→ components stmt/lines/fn ギャップの主因）

| ファイル | stmt | br | fn | 行数 | 内容 |
|---|---|---|---|---|---|
| `components/BottomSheet.tsx` | 0/183 | 0/89 | 0/32 | 483 | 共通ボトムシート。drag・Escape・pathname watcher・anime.js・safe-area |
| `components/DesktopSidebar.tsx` | 0/23 | 0/36 | 0/8 | 287 | PC サイドバー。usePathname による active 判定 |
| `components/landing/HeroRotator.tsx` | 0/25 | 0/16 | 0/7 | 67 | ヒーロー文言ローテーション（setInterval + fade） |
| `components/landing/PopularMarquee.tsx` | 0/23 | 0/20 | 0/8 | 131 | Modrinth 人気 Mod 無限マーキー |
| `components/landing/PreviewCard.tsx` | 0/12 | 0/18 | 0/2 | 81 | LP プレビューカード（モック画像切替） |
| `components/landing/AnimatedStats.tsx` | 0/10 | 0/2 | 0/6 | 82 | useCountUp を使う統計カード群 |
| `components/landing/LandingSearchForm.tsx` | 0/10 | 0/3 | 0/3 | 72 | 検索フォーム → `/discover/mods?q=` 遷移 |
| `components/MenuBottomSheet.tsx` | 0/13 | 0/4 | 0/4 | 137 | BottomSheet ラッパ（メニュー） |
| `components/BrowseBottomSheet.tsx` | 0/4 | 0/0 | 0/2 | 91 | BottomSheet ラッパ（カテゴリ遷移リンク） |
| `components/ReservedCategoryPage.tsx` | 0/1 | 0/0 | 0/1 | 57 | `/modpack` 等の予約ページ（静的） |
| `components/landing/RevealSection.tsx` | 0/2 | 0/1 | 0/1 | 39 | useScrollReveal ラッパ |

BottomSheet **以外**の合計 = 123 stmt / 62 br / 42 fn。ここを 85%+ カバーすれば
components 3 指標とも 50% 超え（約 62% stmt / 65% fn 見込み）。
BottomSheet 単体は最大の未カバー塊（183 stmt / 89 br / 32 fn）だが実装難度も最高（§6）。

### 2.3 その他（現状はどの閾値にも直接効かないが 0%）

| ファイル | stmt | br | fn | 内容 |
|---|---|---|---|---|
| `lib/search/loadDiscoverSearch.ts` | 0/19 | 0/14 | 0/3 | discover SSR 検索。cookie パース（純粋関数部分が大きい）+ fetchModrinthSearch 失敗 fallback |
| `lib/server/project-detail.ts` | 0/26 | 0/8 | 0/9 | 詳細/モーダル共用 server データ取得（Phase 10-P1 追加） |
| `app/discover/[type]/layout.tsx` | 0/1 | 0/0 | 0/1 | Parallel Routes `{children}+{modal}` を並べるだけの server layout |
| `lib/store/confirm.ts` | 89.79% | **68.18%** (15/22) | 100% | `cleanup()` の pendingResolve/pendingOwner 分岐（l.109-112）が未カバー → lib/store branches ギャップ +3 の主因 |

---

## 3. サブフェーズ一覧 (推奨実施順)

### Phase 10.5-A: browser API mock 基盤 + hooks 3 種テスト 🟡

**対象**: `useCountUp` / `useScrollDirection` / `useScrollReveal`、共通 mock 基盤。

- `__tests__/test-utils/browserApi.ts` を新設:
  - `mockMatchMedia(matches)` — jsdom は `window.matchMedia` 未実装のため必須。reduced-motion 両モードを切替可能に
  - `createIntersectionObserverStub()` — jsdom 未実装。`trigger(entry)` でコールバックを手動発火
  - anime.js mock — `vi.mock('animejs', ...)` は dynamic import (`await import('animejs')`) も intercept する
- `useCountUp`: reduced-motion 時の即時最終値 / 通常時のカウント進行（fake timers）/ threshold 未達で発火しない
- `useScrollDirection`: 上スクロール → 'up'、下スクロール 80px 超え → 'down'、topArea 内 → 'up'、jitter（8px 未満）→ 前回値維持
- `useScrollReveal`: 20% 可視で発火 / 発火後 disconnect / reduced-motion で即時最終状態
- この時点で **hooks branches 60% 超・global branches 60% 超** の見込み
- **設定整合性**: `vitest.config.ts` の `coverage.exclude` に `app/**/layout.tsx` を追加
  （既存の `app/layout.tsx`（root wrapper は E2E 担保）除外と同一理由・同一ポリシーの拡張。27 行中 1 stmt の server layout であり unit テストの対象外）

**効果見込み**: hooks br 54.86 → 62%±、global br 59.23 → 61%±
**見積**: テスト 10-12 件 / mock 基盤 1 ファイル

### Phase 10.5-B: 軽量 components 一式テスト 🟡

**対象**: §2.2 の BottomSheet 以外全 10 ファイル。

- `next/navigation` mock（`usePathname` / `useRouter`）— 既存テストに前例がないため A の基盤に追加
- `ReservedCategoryPage` / `BrowseBottomSheet` / `RevealSection`: render + リンク/ラベル assertion（Next `Link` は `next/link` を mock するか jsdom でそのまま render）
- `DesktopSidebar`: usePathname の active 判定（aria-current / ハイライトクラス）、各ナビ項目の href
- `MenuBottomSheet` / `LandingSearchForm`: インタラクション（open/close、submit → router.push の引数検証）
- `HeroRotator`: fake timers でローテーション進行・一時停止（hover 等）
- `PopularMarquee` / `PreviewCard` / `AnimatedStats`: render + IntersectionObserver stub 連携

**効果見込み**: components stmt 47.08 → 62%± / lines 47.91 → 62%± / fn 42.14 → 65%±
**見積**: テスト 15-20 件

### Phase 10.5-C: lib/store confirm.ts cleanup 分岐 🟢

**対象**: `confirm.ts` の `cleanup()`（ownerId キュー破棄・pendingResolve 解決・pendingOwner 不一致）。

- open 中に cleanup → `resolve(false)` されること、キューの当該 ownerId 項目が破棄されること、
  異なる ownerId では pending が影響を受けないこと
- 小規模（+3〜4 br）だが **lib/store branches 80% の最後のピース**

**効果見込み**: lib/store br 76.06 → 80%+
**見積**: テスト 2-3 件
**ここで全 threshold green 確認（§5 の DoD-1）**

### Phase 10.5-D: BottomSheet 本体テスト（品質強化）🟡

**対象**: `components/BottomSheet.tsx`（183 stmt / 89 br / 32 fn）。

- open/close アニメ（anime.js mock の完了 callback で `onCloseAnimationComplete`）
- Escape キー close・背景クリック close・Sheet 内クリックは伝播停止
- grabber drag: user-event `pointer()` で down → move → up。rAF throttle と inline transform
- pathname 変化で close（usePathname mock を render 中に切替）
- reduced-motion 時の短縮 duration 分岐
- **§5 の閾値は B で超えているため本サブフェーズは必須ではない**が、
  Phase 11 のフォルダ選択 UI でも BottomSheet 系 UX を再利用する可能性が高く、
  動作保証の価値が大きい。難易度に応じて段階実施可。

**効果見込み**: components stmt → 75%±、global br → 63%±
**見積**: テスト 10-15 件

### Phase 10.5-E: server 層テスト（任意・Phase 11 前の安全網）🟢

**対象**: `lib/search/loadDiscoverSearch.ts`、`lib/server/project-detail.ts`。

- `loadDiscoverSearch`: cookie 正常値 / 破損値 / 未設定の 3 分岐 + `fetchModrinthSearch` は msw mock
  （`next/headers` の `cookies()` を `vi.mock`）+ fetch 失敗時の空 fallback
- `project-detail`: `lib/modrinth/server.ts` と同じく msw で検証（§ 既存 `server.test.ts` パターン流用）
- 閾値への直接効果は薄いが、Phase 11 の Import フローが依存する server 層の安全網になる

**見積**: テスト 6-8 件

---

## 4. テスト設計メモ（mock 戦略）

| 対象 | 方法 | 備考 |
|---|---|---|
| `window.matchMedia` | stub helper（`matches` 切替） | jsdom 未実装。reduced-motion 分岐網羅に必須 |
| `IntersectionObserver` | stub クラス（手動 trigger） | jsdom 未実装。`observe/unobserve/disconnect` の呼出記録も保持 |
| anime.js v4 | `vi.mock('animejs', () => ({ animate: vi.fn(...) }))` | dynamic import も intercept される。完了は mock の callback 呼び出しで代行 |
| `next/navigation` | `vi.mock`（usePathname / useRouter を切替可能な factory） | DesktopSidebar / BottomSheet / LandingSearchForm で使用 |
| `next/headers` | `vi.mock`（`cookies()` の戻り値を差し替え） | 10.5-E の loadDiscoverSearch 用 |
| rAF / タイマー | `vi.useFakeTimers()`（既存 `parseRetryAfterMs.test.ts` に前例あり） | useCountUp / HeroRotator / scroll throttle |
| GSAP | mock せず実 DOM で動かす | 既存 CustomDropdown テストが gsap なしで 84% を達成している実績に倣う |

---

## 5. 完了条件 (DoD)

1. **`pnpm test:coverage` が exit 0**（全 threshold: global + per-module 全 pass）。
2. テスト数が 376 → **420 以上**に増加している。
3. §3 のサブフェーズ A〜C が実施済み（D/E は実施した場合のみカウント）。
4. 各サブフェーズ commit で §3.1 の 4 検証 pass（typecheck / biome lint / test:unit / build）。
5. `coverage.exclude` の追加は `app/**/layout.tsx` のみ（§0-2 の方針遵守を `git diff` で確認）。
6. E2E は変更しない（unit 追加のみ。既存 E2E 8 spec は CI で担保）。

---

## 6. リスク & はまりどころ

| リスク | 影響 | 対策 |
|---|---|---|
| jsdom 未実装 API（matchMedia / IntersectionObserver） | テスト全体が落ちる | 10.5-A で stub 基盤を先に作り、以降のサブフェーズで再利用 |
| anime.js v4 の `animate()` 戻り値 shape | mock 不一致で BottomSheet が落ちる | 実装の呼び出し箇所（完了 callback / Promise）を確認して mock 設計。10.5-D で先に spike |
| fake timers と rAF の組み合わせ | throttle テストが固まる | `vi.useFakeTimers({ toFake: [...] })` で対象を限定する選択肢 |
| BottomSheet drag の物理（velocity / しきい値） | user-event での再現困難 | pointer 座標系列をヘルパ化。再現困難な分岐は無理せず 10.5-D の到達目標を 80% とし、閾値は B で担保済み |
| カバレッジ数値の Breathing（実装変更で変動） | ギャップ計算のずれ | 各サブフェーズ完了時に coverage を再測定し、残ギャップを再計算する |
| テスト追加による実行時間増 | CI 時間増 | 現状 43 秒（376 tests）→ +50 件でも 1 分強の見込み。許容 |

**ロールバック方針**: 各サブフェーズが独立 commit のため、問題あれば当該 commit のみ revert。
vitest 4 自体（`ccd5f98`）は rollback しない。

---

## 7. 次のフェーズ (完了後)

- **Phase 11-A**（`PHASE11_PLAN.md`）: データモデル基盤（ProjectItem 化 + Dexie v2 migration）に着手。
- Phase 10.5-E を実施した場合、`lib/server/project-detail.ts` の型変更は Phase 11-A のリネーム対象と
  競合する可能性がある → **Phase 11 着手前の実施を推奨**（テストが regression 検出器になる）。
