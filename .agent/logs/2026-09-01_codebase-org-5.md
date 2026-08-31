# 2026-09-01 ORG-5 coverage threshold 回復

## 指示内容

- ユーザー「お願いします」→ ORG-5 (coverage threshold 未達の回復) を許可
- 完了条件: `pnpm test:coverage` exit 0 (threshold 全 pass)

## 実行内容

### 1. 現状確認 (baseline)

`pnpm test:coverage` 実行で 2 件の threshold 未達を確認 (移動前から存在する既存問題):

| 対象 | threshold | baseline | 主因 |
| :--- | ---: | ---: | :--- |
| `src/features/profiles/store/store.ts` | branches 80% | **76.47%** | 防御分岐・profile 不在系の未テスト |
| `src/hooks/**/*.ts` (4 ファイル) | branches 60% | **59.15%** | `useModalA11y.ts` 46.15% (テストファイルなし) |

絞り込み coverage (`--coverage.all=false --coverage.include=...`) で
useModalA11y の未カバーが L100-125 (Tab フォーカストラップ) と L159-160
(フォーカス復帰) であることを特定。

### 2. テスト追加 (21 件)

- `__tests__/hooks/useModalA11y.test.tsx` (**新規・14 件**):
  - Escape で onClose / portal (`custom-dropdown-menu-portal`) がある間は無視
  - スタック: 最上位のみ Escape 処理 → 上位を閉じると下位が処理
  - Tab / Shift+Tab フォーカストラップ (先頭⇄末尾ループ・コンテナ外からの復帰)
  - 自動フォーカス優先順: input → combobox → コンテナ自身 (tabindex=-1)
  - クローズ時のフォーカス復帰 / フォーカス可能要素なしモーダル
  - **jsdom は `offsetParent` が常に null** のため、`HTMLElement.prototype`
    に getter stub を設定 (beforeEach) / `Reflect.deleteProperty` で復元
    (afterEach)
- `__tests__/features/profiles/store/profiles.test.ts` (**追補 5 件**):
  - `updateModVersionInProfile`: profile 不在 → false
  - `clearProfileMods`: profile 不在 → false / mods が元々空 → true
  - `addModToProfile`: slug なし mod (projectId のみで重複判定 → falsy 分岐)
- `__tests__/features/profiles/store/devtools.test.ts` (**新規・2 件**):
  - `vi.resetModules()` + `vi.stubEnv('NODE_ENV', 'development'|'production')`
    で再 import し、devtools middleware 有無の両分岐を検証
    (独立ファイルにした理由: store はシングルトンのためモジュールキャッシュ
    リセットが他テストへ影響しないよう分離)

### 3. 結果

| 対象 | baseline | 最終 | threshold |
| :--- | ---: | ---: | ---: |
| store.ts branches | 76.47% | **84.31%** | 80% ✓ |
| src/hooks/**/*.ts branches | 59.15% | **87.32%** | 60% ✓ |
| src/hooks/**/*.ts statements / functions / lines | - | 96.43 / 92.31 / 99.16 | 70 / 70 / 70 ✓ |

- `pnpm test:coverage` **exit 0** (完了条件達成)
- 4 検証: typecheck 0 / biome 0 / test:unit **117 files 1264 tests pass** / build exit 0

### 4. 残っている未カバー (いずれも防御コード)

- store.ts L137-139 / L157-158: `!target` ガード (型上 `Profile[]` に undefined は
  入らない。テストで無理に通すと型を破る不自然なテストになるため据え置き)
- useModalA11y: Strict Mode double-invoke 時の二重 push 抑止分岐 (実運用で
  mountedUids.has が true になるケースは再現不能な防御)

## コミット

- `refactor(ORG-5)` (docs 更新含む) — push 済み
