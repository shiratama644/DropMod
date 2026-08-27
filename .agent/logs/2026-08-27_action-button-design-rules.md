# アクションボタン デザインルール登録 + Mod 詳細 UI 適用

> Date: 2026-08-27 (JST) / Branch: `arena/01a0337c-dropmod`

## 1. 指示内容 (Task Summary)

ユーザー指定のモバイル UI デザインルールを**以降の恒久ルールとして登録**し、既存 UI に適用する:
1. 主操作 (プライマリ) を行の右端に配置 (iOS/Android 共通標準)。並び順: 閉じる (グレー) → 補助 (枠線) → 主操作 (緑塗り、右端)
2. 高さ統一 (44-48px)・主要ボタン等幅・色数削減 (緑は主操作 1 つのみ)・テキスト簡潔化 (詳細/DL/追加)

## 2. 実行内容 (Executed Actions)

| 変更 | 内容 |
| :--- | :--- |
| `.agent/skills/ui-layout.md` | **🎨 アクションボタン デザインルール** を恒久セクションとして冒頭に登録 (並び順・高さ幅・色・テキストの 4 ルール + aria-label 方針)。index.md の概要も更新 |
| `components/ModDetailModalShell.tsx` (プレビューモーダルのフッター) | 並び順は既存の 閉じる→詳細→DL→追加 を維持しつつ、**詳細ページ (緑塗り) →「詳細」(glass-card 枠線)**、**.jar 直DL (青塗り) →「DL」(枠線)** に変更。追加/削除は緑/赤のまま右端。全ボタン **h-11 (44px) 統一**、主要 3 ボタンは **flex-1 等幅** (max-w-48 キャップ)。flex-wrap 廃止 (短文言で 1 行に収まる)。**aria-label に正式名称** (詳細ページ / .jar ファイルをダウンロード / プロファイルに追加/から削除) を付与 |
| `components/ModDetailPageView.tsx` (詳細フルページの CTA) | 並び順を **追加 (左端) → DL → Modrinth** から **Modrinth (グレー) → ダウンロード (枠線) → 追加 (緑・右端)** に変更。**h-12 (48px) 統一・flex-1 等幅** (max-w-56)。「.jar 直DL」→「ダウンロード」。aria-label 付与 |

検証: typecheck 0 error / biome 0 warning (212 files) / test:unit 548 passed / build exit 0。
E2E `mod-detail-modal.spec.ts` の `getByRole('link', { name: /詳細ページ/ })` は aria-label="詳細ページ" で一致するため更新不要 (確認済み)。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **既存の ConfirmDialog / NewProfileModal は既にルール準拠** (キャンセル=グレー左、主操作=緑右)。モーダル系は元々「補助左・主操作右」で作られており、外れていたのは Mod 詳細のアクション行のみ (詳細=緑、DL=青の複数塗りボタン)。
- **視覚テキスト短縮 + aria-label 正式名称**の組は E2E の locator も壊さない (accessible name は aria-label が優先されるため /詳細ページ/ が一致し続ける)。テキスト変更時は aria-label で後方互換を保つのが定石。
- `variant="page"` の ModDetailModalShell 分岐は実行時に使われない (詳細フルページは ModDetailPageView を使用) ため、モーダル側の修正はフッター共通部 1 箇所で完結した。

## 4. 次にすべきこと (Next Actions)

1. ユーザー環境でモーダル/詳細ページの見た目を確認 (追加ボタンが右端・緑 1 色になったか)。
2. 以降の UI 追加・修正では skills/ui-layout.md の 🎨 ルールを必ず適用する。
3. 他のアクション行 (DependencyCheckModal の項目ごとの 追加 ボタン等) は現状簡潔で単色のため対応不要。
