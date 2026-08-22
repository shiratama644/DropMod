# Phase 9 実装と計画書 (PHASE9_PLAN.md) の差分

> **監査開始日:** 2026-08-23 (JST)
> **対象:** `docs/PHASE9_PLAN.md` (計画書 v1) vs. 実装
> **記録方針:** Phase 8 と同じく、意図的な設計変更・順序変更・未実装項目をここに記録。バグは `docs/issues.md` の該当波で管理。

## 🎯 差分サマリ

| ID | 該当章 | 差分の性質 | 影響 | 対応方針 |
|---|---|---|---|---|
| D1 | §4 Sub-Phase 順序 | **順序変更** (9-B → 9-A) | Server Component 経由の props 渡し不能問題を回避 | 9-B (operationsStore) を先に実施、9-A (AppContext 撤去) が実現可能に |

---

## D1. Sub-Phase 順序の変更: 9-B を 9-A の前に実施

### 計画書の想定 (§4.1)

```
9-A → 9-B → 9-C → 9-D → 9-E
```

理由:「AppContext 撤去で hooks/components がどの store から何を取っているか明確化。テスト側も store を直接扱う方が書きやすい」

### 実装で判明した問題

Phase 9-A.1 (SettingsPageClient) の実装を開始した時点で以下の構造制約を発見:

- `SettingsPageClient` は **Server Component (`app/settings/page.tsx`) から `<SettingsPageClient />` として呼ばれている**
- Server Component から Client Component への **関数 props 渡しは Next.js の仕様上不可能** (シリアライズできない)
- つまり `handleDownloadZip / handleImportZipInput / handleDropZip` などの `useZipExport / useZipImport` 由来の関数を `SettingsPageClient` に届ける経路は:
  1. Server Component 経由の props 渡し (**不可**)
  2. `React.cloneElement` で children に inject (不自然、動的)
  3. **Context 経由** (現状の useAppContext がまさにこれ)
  4. **Zustand store 経由** (Client Component 間なら OK)

つまり **Zustand store 化されていない関数は Context を撤去できない**。

### 計画書の設計との齟齬

計画書 §5.3 では「AppShell 局所 state 由来 (openNewProfileModal 等) は props に」と書いたが、Server Component 経由では props 渡し自体ができない。

実は AppShell は **`children` の親** ではなく、**Root Layout の Client 直下の Provider** に過ぎず、`children` は Server 側から Next.js のルーティングツリーで挿入される。

### 対応: 順序を 9-B → 9-A に入れ替え

**変更後の順序:**

```
9-B (operationsStore 3 分割) → 9-A (AppContext 撤去) → 9-C → 9-D → 9-E
```

**新しい理由:**
1. 9-B で `useZipExportStore / useZipImportStore / useDepCheckStore` が揃う
2. これで **SettingsPageClient は Zustand 経由で `handleDownloadZip` 等を取れる**
3. 9-A で AppContext を撤去する際、**Zustand 直接参照だけで完結**する
4. props 渡しは AppShell → 局所 Modal (NewProfileModal 等) の限定的なケースのみ残る

### 影響範囲

- **DoD 実現性**: 順序変更で計画書 §5.6 の DoD (useAppContext 呼び出し 0 件) が達成可能に
- **工数**: 変わらず (~7 日、順序のみ)
- **リスク**: **むしろ低減** (9-A 実施前に必要な store が全て揃うため)
- **依存関係グラフ**: `9-B → 9-A` に矢印反転、他は変化なし

### 計画書 §5 の書き換え箇所

計画書に対する具体的な訂正:

- §4.1「順序の理由」→ 「9-B を先に: operationsStore が揃ってから 9-A で参照できるように」
- §5.3「AppShell 局所 state 由来 (openNewProfileModal 等) は props に」→ 「AppShell 局所 useState 由来のうち、Zustand 化されていないものは AppShell 内モーダル (NewProfileModal 等) の限定的な props 渡しのみ」
- §12「依存関係グラフ」→ mermaid 図の矢印を `9-B → 9-A` に反転

---

*本 diff/phase9.md は Phase 9 実装中に発見された「計画書との齟齬」を全て記録するものです。バグ (実装ミスや潜在的不具合) は `docs/issues.md` の第8波 (Phase 9 レビュー) セクションに別途記載予定。*
