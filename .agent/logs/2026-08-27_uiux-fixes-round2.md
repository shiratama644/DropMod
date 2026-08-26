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
