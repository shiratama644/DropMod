# UI/UX 修正第 2 弾: 白フラッシュ完全解消 + テーマ cookie + 表示形式刷新

> Date: 2026-08-27 (JST) / Branch: `arena/01a0337c-dropmod`

## 1. 指示内容 (Task Summary)

ユーザー報告 5 件への対応:
1. まだ白くなるときがある → モーダルオーバーレイ等に残っていた backdrop-blur を全廃
2. 追加/未追加でカードの大きさが少し変わる → ボタン寸法の統一
3. スマホ本体ダーク時にサイトをライトにしてもダークへ戻る → Secure cookie が http で拒否されるバグ
4. モバイルで 1/2/3 カラム切替が効かない (全部 1 カラム) → sm: prefix 起因。3 カラムは独自 compact UI に
5. 「自動」を削除 / 「最大」のヘッダー画像を大きく / Modrinth のような使い勝手へ

## 2. 実行内容 (Executed Actions)

| 変更 | 内容 |
| :--- | :--- |
| `backdrop-blur` 全廃 (9 ファイル) | BottomSheet / ConfirmDialog / DependencyCheckModal / EditProfileModal / ModDetailModalShell ×2 / NewProfileModal / OfflineBanner / ScreenshotGalleryModal / ZipProgressModal のオーバーレイから削除。オーバーレイは `--modal-overlay` の半透明黒で十分 |
| `hooks/useProfiles.ts` + `AppShell.tsx` | `cookieSecureSuffix()`: **Secure フラグを https のみ付与**。theme / active_profile cookie が http (LAN IP) で黙って拒否され、リロードのたびダークへ戻る原因を解消。削除時も同様 |
| `lib/constants/search.ts` | 「自動」廃止 (`autoCardSpanClass` / `autoBannerHeightClass` 削除)。`searchGridClass('2')` → `grid-cols-2`、`('3')` → `grid-cols-3` (**sm: prefix 撤去 = モバイルでもカラム指定が有効**)。「最大」は h-44/sm:h-60 |
| `app/globals.css` | `.search-grid-auto` CSS 削除 |
| `hooks/useMediaQuery.ts` (新規) | SSR/jsdom-safe な `useMediaQuery` / `useIsMobile` |
| `components/ModCard.tsx` | ①追加/追加済みボタンを **h-9 + min-w-[7rem] の同寸**に統一 (カード寸法不変)、「✕ 削除」サブラベル廃止 (title/aria-label で説明)。②**モバイル 3 カラムは compact カード** (aspect-square アイコン + line-clamp-2 タイトル + DL 数 + 全幅 h-7 ボタン)。③「最大」ヘッダーを h-44/sm:h-60 に拡大、フォールバックアイコンも拡大 |
| テスト | search.test (grid 期待値・auto 廃止) / ModCard.test (最大ヘッダー高さ・ボタン同寸 + compact カード 3 件、+5 tests) |

検証: typecheck 0 error / biome 0 warning (213 files) / **test:unit 550 passed / 65 files** / build exit 0 / **coverage exit 0** (総計 stmt 84.27)。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **Secure cookie は http で「黙って」拒否される** (エラーすら出ない)。localhost は例外面の HTTPS 扱いだが、**LAN IP (http://192.168.x.x) は拒否**される。スマホから PC の開発サーバーに繋ぐ構成 (ユーザー環境) で顕在化しやすい。「設定が保存されない系」のバグはまず protocol を疑う。
- **モバイルでカラム切替が効かない原因は `sm:grid-cols-*`**: Tailwind の responsive prefix は 640px 未満で常に上書きされる。「ユーザーが明示的に選んだカラム数」に prefix を付けてはいけない。
- **追加/未追加でカードが伸縮する原因はボタン幅の違い**。両状態を同寸 (固定 min-width) にするだけで grid の行の高さが揃う。
- `useMediaQuery` は初期値 false (SSR 一致) → hydration 後に実測値へ更新、の 2 段階 render にすることで hydration mismatch を回避できる。jsdom は matchMedia 未実装なので typeof ガードが必須 (テストは stubGlobal で差し替え)。

## 4. 次にすべきこと (Next Actions)

1. ユーザー環境で (a) 白フラッシュ解消、(b) ライトテーマが維持される、(c) モバイル 2/3 カラムが機能、(d) compact カードの見た目を確認。
2. CI で E2E green 確認 (mod-detail-modal spec は aria-label 互換で影響なし、mods-page spec は表示形式「自動」参照が無いか要確認)。
3. 引き続き Modrinth 体験に近づける改善 (検索フィルタ UI 等) は要望に応じて。

---

## 追記: タグ折り返し + コントラスト微調整 (同日第 3 弾)

| 変更 | 内容 |
| :--- | :--- |
| `components/ModCard.tsx` | カテゴリバッジに `whitespace-nowrap shrink-0` + `px-2 py-0.5 text-[10px]`。「ライブラリ」等の日本語タグが 1 カラム幅カードで縦に崩れるのを解消 (常に横一列) |
| `app/globals.css` | `--text-muted` (説明文のグレー): **dark のみ #94a3b8 → #a9b7c9** (実効背景比 5.88:1 → 7.40:1)。light は #64748b のまま (4.55:1 で WCAG AA 限界ギリギりのため、明るくすると 4.5:1 を割る) |

検証: typecheck 0 / biome 0 / test:unit 550 passed / build exit 0。
コンントラストは Python で WCAG 比を計算して決定 (dark 改善・light AA 維持)。

---

## 追記: 第 4 弾 — カテゴリ英語化 + トースト設定 + タップ領域改善 (同日)

| 変更 | 内容 |
| :--- | :--- |
| `lib/constants/categories.ts` | カテゴリ表示を**すべて英語**に (Modrinth 準拠: Utility / Optimization / Library / World Gen 等)。`categoryLabel` 未設定時も 'Uncategorized' |
| `lib/store/toast.ts` | トースト通知の **ON/OFF 設定**を追加 (`enabled` state + localStorage `dropmod_toast_enabled`)。OFF 中は showToast が no-op、切替時に表示中トーストを消す |
| `components/SettingsPageClient.tsx` | 「通知設定 (Toast Notifications)」セクション + 表示する/オフにするボタン |
| `components/ModCard.tsx` | ①モバイル 2 カラムでのはみ出し対策: バッジ `min-w-0 truncate`、ボタン `shrink-0` + `h-8 sm:h-9 / min-w-0 sm:min-w-[7rem] / text-[10px] sm:text-xs` の小型化 (右寄せ維持)。②**追加済みボタンの赤 hover を削除** (モバイルで tap 時に赤く発光する問題) |
| `components/DependencyCheckModal.tsx` | 必須 (amber) / 推奨 (blue) の追加ボタンを**角丸正方形 w-10 h-10** (モバイル) に拡大、PC は h-9 テキスト付き |

検証: typecheck 0 / biome 0 / **test:unit 555 passed (+5: トースト ON/OFF)** / build exit 0。

## 再構築によるロス (教訓)

作業中に Sandbox 再構築が発生し、**未 commit の変更をすべて失った**ため再実装した。
以後、ある程度まとまった変更はこまめに commit する (§4.1.1 の精神)。

---

## 追記: 第 5 弾 — 全ファイル包括バグハント (同日)

体系的に全ソース (lib/ hooks/ components/ app/) を探索し、以下のバグを発見・修正:

### 発見・修正したバグ (重要度順)

| # | 重要度 | ファイル | バグ | 修正 |
|---|---|---|---|---|
| 34 | **HIGH** | `lib/env/zipSource.ts` | **JSZip の `folder()` で作ったサブ ZIP の `files` key はフルパスのまま** → `exists` / `listFiles` / `listDirectories` がすべて壊れ、`.minecraft/` re-root した ZIP で Detector が環境を検出できなかった (Phase 11-C からの潜在バグ) | `zip.folder()` を廃止し、**pathPrefix 方式**に変更: 元の zip を直接参照し `.minecraft/` 接頭辞を付けて走査 |
| 1 | **HIGH** | `lib/env/analyzer.ts` | 1 ファイルの `readFile` 失敗で解析全体が throw で落ちる | try-catch で該当ファイルをスキップして継続 (`readableScanned`) |
| 21 | **HIGH** | `components/ModsPageClient.tsx` | **`visibleMods` が `profile.mods` のみ参照** → Phase 11 で Import した resourcepacks / shaderpacks が RP/Shader タブに表示されない | `allContentItems` (mods + RP + Shader) を結合してフィルタ + tabCounts も統一 |
| 22/31 | **MED** | `hooks/useDependencyCheck.ts` | `profile.mods` のみ参照 → RP/Shader の依存がチェックされない | `allItems` (mods + RP + Shader) に統一 (signature も含む) |
| 33 | **MED** | `components/DependencyCheckModal.tsx` | 同上 + `handleAddAllMissing` 内の `allItems` が別スコープで未定義 | プロファイル参照を `allItems` に統一 + スコープ内で定義 |
| 3 | **MED** | `hooks/useProfiles.ts` | `handleDuplicateProfile` が `mods` のみ deep copy → RP/Shader/unknown は浅い参照共有 (複製側で編集すると元も変わる) | `structuredClone()` で全配列を deep copy |
| 2 | **MED** | `components/BottomSheet.tsx` | `transitionend` listener が cleanup されない場合がある (アニメーション中断時) | `setTimeout(cleanup, 200)` で強制 cleanup を追加 |
| 5 | **LOW** | `lib/utils/id.ts` | `crypto.randomUUID` が non-secure context (http LAN) で稀に throw | try-catch で fallback |

### 確認済み (問題なし)

- XSS: `dangerouslySetInnerHTML` は theme init script のみ (ハードコード、ユーザー入力なし)
- 外部リンク: すべて `rel="noopener noreferrer"` 付き
- `as any` の使用: なし
- LRU cache: 上限 200 件 + TTL 5 分でメモリリークなし
- IntersectionObserver / addEventListener: すべて cleanup あり
- key={index}: landing/AnimatedStats のみ (固定 3 要素、再順序化なし)
- API Route: path traversal チェック、ホスト検証、メソッド制限あり
- cookie: Secure flag は https 条件付き (前回修正済み)

検証: typecheck 0 / biome 0 / **test:unit 555 passed / 65 files** / build exit 0 / **coverage exit 0** (総計 stmt 84.23)。
