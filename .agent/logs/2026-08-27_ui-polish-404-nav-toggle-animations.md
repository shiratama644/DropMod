# 2026-08-27 — UI 改善 4 件 (404 / BottomNav 非表示 / カードトグル / アニメーション)

ユーザー要望 4 件をそれぞれ独立コミットで実装。

## 1. 404 ページリニューアル (`603dac3`)

- Modrinth / GitHub 参考。Minecraft「missing texture」ブロック
  (conic-gradient 2×2 チェッカー、div 1 つ) + 大 404 + CTA 2 択
  (Mod を探す = 枠線、ホームに戻る = 緑 h-12 主操作)。
- nf-rise 3 段 stagger 入場 + nf-float 浮遊。reduced-motion で停止。
- 全ルートの notFound() がこの 1 ページを使用。

## 2. モーダル表示中の BottomNav 非表示 (`6b98a72`)

- lib/store/uiState.ts (Zustand openModalCount) + hooks/useModalUi.ts
  (useModalRegistration) を新設。7 モーダルが登録。
- BottomNav は .nav-modal-hidden で 280ms スライドアウト → visibility:hidden
  (遅延遷移)。pointer-events:none は即時 (アニメ中の誤タップ防止)。
- ModDetailModalShell の旧 body クラス方式 (mod-detail-modal) を廃止し統一。
- E2E toBeHidden 互換 (visibility:hidden)。BottomSheet は対象外 (トグルのため)。
- 注意: globals.css は Biome noDescendingSpecificity 対策で詳細度昇順
  (#bottom-nav (1,0,0) → .nav-modal-hidden (1,1,0) → body.mod-fullpage (1,1,1))
  を維持し、hidden 側は transition-delay のみ上書きする方式。

## 3. カード追加ボタンのトグル化 (`3ec7b5f`)

- ModCard (標準 + compact): 追加済み「追加済み」(緑枠 check) → 「削除」
  (赤枠 bg-red-500/20 + theme-text-red + trash)。詳細 UI の 削除 と統一。
- アイコン swap 演出: <i> を key={isAdded} で再マウント (ボタンは再マウント
  しない = focus 維持)。
- テスト: ModCard 18 tests。aria-label も「プロファイルから削除」に変更。

## 4. アニメーション強化 (`2d5b705`)

- .modal-card ポップイン + .modal-overlay フェード (7 モーダル 8 overlay)。
- .mod-card-item hover 浮遊 (@media (hover: hover))。fill-mode both → backwards
  (both は hover transform を上書きし続けるため — 重要な教訓)。
- .btn-hover-effect (旧・空クラス) に :active scale(0.97) を定義して既存
  付与ボタン全部に一括適用 + 詳細 CTA 9 ボタンにクラス追加。

## 検証

- typecheck 0 error / biome 0 warning / test:unit **624 passed / 69 files**
  (新規 25 tests: uiState 5 + useModalUi 4 + BottomNav 5 + ModCard 追加・改定 11)
- webpack build exit 0
- 実サーバー検証: /nonexistent が 404 + 新デザイン、CSS に 7 規則同梱、
  bottom-nav 初期レンダリングに nav-modal-hidden なし

## 未検証 (ユーザー環境 / CI で確認)

- E2E (mod-detail-modal.spec.ts の nav hidden/visible) — CI で要確認
- 実ブラウザでのアニメーション視認
