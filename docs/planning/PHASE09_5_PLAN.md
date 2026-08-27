# Phase 9.5: ランディングページ全面刷新 + BottomNav 再設計 (Modrinth 風)

> 対応 task-list ID: `P95-A` 〜 `P95-D` / `P95-X` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 完了** (2026-08-24 実施 / 証拠: PR #2 `67e10b6`)

## 1. 開始前確認

- Phase 9 完了 (AppContext 撤去・テスト基盤) を確認
- `git status` clean / 依存タスク (`P9-A〜E`) 完了

## 2. 目的 (Why)

Phase 9-F の簡易ランディングを **Modrinth レベルの本格ランディング**に刷新し、
あわせて BottomNav を「ハンバーガーメニュー方式」に再設計して Phase 11 の
4 カテゴリ (Mods / Modpacks / ResourcePacks / Shaders) 対応の UI 土台を作る。

1. **DropMod のブランド価値を最初の 3 秒で伝える** (Hero + 数字)
2. **スクロールで進化を見せる** (段階的アニメーション)
3. **Phase 11 準備**: 「探す」ボタンで 4 カテゴリを選ばせる sheet UX を先行導入
4. **モバイル UX の Modrinth 準拠**: ハンバーガーで設定・テーマ・ZIP 操作を集約

## 3. 変更範囲 (Scope)

変更対象:
- `app/page.tsx` (LP 7 セクション)、`components/landing/` (Hero / Feature / Stats / Screenshots / Coming Soon / CTA / marquee)
- `components/BottomNav.tsx` / `BottomSheet.tsx` (共通化) / `BrowseBottomSheet.tsx` / `MenuBottomSheet.tsx`
- `AppShell.tsx` (Props 追加)、`hooks/useScrollReveal.ts` / `useCountUp.ts` / `useScrollDirection.ts`

変更しない (境界外):
- `.archive/vite/` 不変
- 検索・プロファイル機能のロジック (表示層のみ)

## 4. 禁止事項

- Three.js 等 3D ライブラリを入れない (**P95-X 対象外**: GSAP/Anime.js + CSS で十分、bundle 優先)
- 検索ロジック・store 周辺を本フェーズで書き換えない
- `backdrop-filter` を使わない (GPU 無し環境で白フラッシュ — 後日恒久ルール化)

## 5. 完了条件 (DoD)

- [x] LP が 7 セクション構成 (Hero / Feature grid / Stats / Screenshots / Coming Soon / CTA 等) で描画される
- [x] BottomNav が 3 主タブ + 「探す」sheet + ハンバーガー sheet 構成
- [x] `/` でのみ Header 非表示 (他ページは表示)
- [x] Reduced Motion 環境でアニメーションが無効化される
- [x] 4 検証全 pass・`.archive/vite/` 無変更

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Component (RTL) | △ (当時未実施 → Phase 10.5-B で追加) | landing components |
| 手動 | ✅ | 全ページの BottomNav 動作・レスポンシブ・Reduced Motion |
| Bundle | ✅ | dynamic import の効果確認 |

## 7. 停止条件

- BottomSheet 共通化で既存モーダルの a11y (Escape / focus trap) が維持できない場合
- LP リッチ化で bundle が逆に増える場合 (方針再協議)

## 8. 完了時に行うこと

各サブフェーズ: 4 検証 → コミット → task-list 更新。

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 状態 |
|---|---|---|---|---|
| P95-A | BottomSheet 共通化 + BottomNav 再設計 | 3 主タブ + sheet 2 種 | - | 完了 |
| P95-B | Header 条件付き非表示 + LP 骨組み | 7 セクションの容器 | P95-A | 完了 |
| P95-C | Hero + スクロール演出 | useScrollReveal / useCountUp | P95-B | 完了 |
| P95-D | コンテンツ充実 + a11y 総点検 | 文言・SS・CTA | P95-C | 完了 |
| P95-X | ~~Three.js 3D Hero~~ | - | - | 対象外 (軽量方針で不採用) |

## 10. 設計詳細・仕様 (継承)

- **BottomSheet**: 共通コンポーネント (drag-to-close / Escape / 背景クリック close /
  safe-area 対応)。Anime.js による translateY スライド。close 経路 1 本化
  (URL 変化は pathname watcher、それ以外は明示 `onClose()`)。
- **LP セクション**: Hero (検索フォーム直結) / Feature grid / AnimatedStats /
  Screenshots / Coming Soon (Phase 11+ 予告) / Final CTA。
- **データフロー**: BottomNav の sheet trigger は `sheetStack` (重ね順 z-[50]→[52]→[54])。
- **参考**: Modrinth トップページ・モバイル版 nav。

## 11. リスク・Gotchas (継承)

- `useModalA11y` を Sheet で再利用しない (Sheet 重ね対応で自前実装)
- `<input type=file>` に `onClick=inputRef.click()` は**無限ループ危険** (`<label>` 任せ)
- z-index 序列は skills/ui-layout.md 参照 (BottomNav z-[60] > Sheet z-[50..54])

## 12. 実績と証拠

| ID | コミット | テスト | 備考 |
|---|---|---|---|
| P95-A〜D | PR #2 (`67e10b6`, 2026-08-24 マージ) | 当時全 pass | landing components のテストは Phase 10.5-B で補強 |
