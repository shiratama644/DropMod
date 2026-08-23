# Phase 13: CurseForge 完全対応

**ステータス**: 骨子計画中（Phase 12 完了後に詳細設計）
**優先度**: 🟡 中 — CurseForge ユーザー向けの拡張
**見積工数**: 2〜3 週間（1 人フルタイム換算）
**着手前提**: Phase 12 (Sync + Modrinth Modpack) 完了

---

## 1. 概要と目的

Phase 12 で Provider 抽象化 (`ModrinthProvider` / `CurseForgeProvider` stub) を
準備済み。Phase 13 では **`CurseForgeProvider` を完全実装** し、以下 3 つの機能を
提供する:

1. **CurseForge Mod / RP / Shader の Import** (fingerprint 照合)
2. **CurseForge Modpack (.zip) の完全 Import**
3. **CurseForge Modpack の更新検知 + Sync**

**Phase 12 の原則を継承**: 不正確な推測による誤マッチングは絶対に行わない。
CurseForge API と Murmur2 fingerprint による正確な照合のみ。

---

## 2. 前提: Phase 12 で外した理由の再確認

ユーザー方針 (2026-08-24):
> Phase 12ではCurseForge完全対応を行わず、Phase 13へ延期する。
> 不正確な推測による自動マッチングより、未対応として安全に止めることを優先する。

**危険パターンの例** (Phase 12 でやらない):
- 同名 Mod で違う project (例: Modrinth "Sodium" vs CurseForge "Sodium Extra")
- 別 version が入る (例: 0.5.9 のつもりが 0.6.0 になる)

Profile 管理ソフトとして誤紐付けは致命的なので、Phase 13 で **CurseForge API +
Murmur2 fingerprint** を実装するまで、CurseForge 由来のファイルは
「未対応」として扱う。

---

## 3. CurseForge API の使用

### 3.1 API 認証

CurseForge API (https://docs.curseforge.com/) は **API key 必須**:
- 個人プロジェクトなら無料 (Free tier)
- Rate limit: TBD (Phase 13 開始時に最新確認)
- `x-api-key` ヘッダで送信

**認証方式の検討**:
- **オプション A**: DropMod プロジェクトが API key を発行、環境変数で保持
  - Vercel Env に `CURSEFORGE_API_KEY` を設定
  - Server Component 経由でのみ叩く
- **オプション B**: ユーザーが自分の API key を Settings 画面で入力
  - Dexie に保存
  - 各リクエストで localStorage 経由の key を使用
- **オプション C**: プロキシサーバー経由 (Vercel Route Handler)
  - `/api/curseforge/[...path]` で proxy
  - key は server side のみ

**推奨**: **オプション C** (Route Handler proxy) — Modrinth と同じ設計。Phase 13
開始時にセキュリティ・rate limit の観点で最終判断。

### 3.2 Murmur2 Fingerprint

CurseForge は Modrinth の SHA-1 とは違う **Murmur2** hash で照合する:
- CurseForge の各ファイルは Murmur2 値を持つ
- クライアント側で `computeMurmur2(file)` を計算 → API に問い合わせ

**Murmur2 実装**:
- JavaScript 実装: `murmurhash-js` npm パッケージ (小さい、依存少ない)
- Web Worker 化 (Phase 11 の SHA-1 worker と同じ pattern)

**API 例**:
```
POST https://api.curseforge.com/v1/fingerprints
Body: { fingerprints: [murmur2 array] }
→ 各 fingerprint に対応する CurseForge file/mod 情報を返す
```

### 3.3 Provider 実装

Phase 12 で用意した `Provider` interface を実装:

```typescript
// lib/env/provider/curseforge.ts
export const CurseForgeProvider: Provider = {
  id: 'curseforge',

  async resolveByHash(hashes: string[]) {
    // Phase 11/12 の SHA-1 とは別、Murmur2 が必要
    // ※ hashes は Murmur2 に変換して API に渡す (別 worker で計算済み想定)
    throw new Error('Phase 13 で実装');
  },

  async getProjectMetadata(projectIds: string[]) {
    throw new Error('Phase 13 で実装');
  },

  async checkForUpdate(projectId: string, currentVersionId: string) {
    throw new Error('Phase 13 で実装');
  }
};
```

---

## 4. CurseForge Modpack (.zip) 対応

### 4.1 Manifest 形式

CurseForge modpack `.zip` の中には `manifest.json` が入っている:

```json
{
  "minecraft": {
    "version": "1.20.1",
    "modLoaders": [
      { "id": "forge-47.2.0", "primary": true }
    ]
  },
  "manifestType": "minecraftModpack",
  "manifestVersion": 1,
  "name": "All the Mods 9",
  "version": "0.2.62",
  "author": "ATMTeam",
  "files": [
    {
      "projectID": 238222,
      "fileID": 5478941,
      "required": true
    },
    ...
  ],
  "overrides": "overrides"
}
```

### 4.2 Import フロー

```
CurseForge .zip 選択
     │
     ▼ JSZip でパース
manifest.json 抽出
     │
     ▼ Phase 12 の manifestType 検出はここで完了
     ▼ Phase 13: 実際に files[] を解決
CurseForge API に projectID + fileID で問い合わせ
     │
     ▼ 各 file の CDN URL / filename / sha1 を取得
     ▼ ContentItem[] 生成 (provider: 'curseforge')
     ▼ Profile.modpackSource セット (provider: 'curseforge')
     ▼ ManagedFileRecord に source: 'modpack' 記録
     │
     ▼ Sync Preview (Phase 12 の通常フローに合流)
```

### 4.3 CurseForge → Modrinth の cross-referencing (任意)

**やらないこと** (ユーザー方針):
> Modrinthへの変換・名前検索による自動代替は行わない
> CurseForge由来のModを推測でModrinth Projectへ紐付けない

**やること**:
- CurseForge Mod は完全に CurseForge Provider で管理
- UI では「CurseForge」バッジで区別
- ユーザーが手動で「Modrinth 版に置き換える」オプションは Phase 14+ で検討

---

## 5. Provider 混在時の Profile

Phase 13 完了時点で Profile は複数 provider の ContentItem を持てる:

```typescript
profile.mods = [
  { content: { provider: 'modrinth', projectId: '...' }, ... },
  { content: { provider: 'modrinth', projectId: '...' }, ... },
  { content: { provider: 'curseforge', projectId: '...' }, ... },  // ← 混在 OK
  ...
];
```

Sync 時、各 ContentItem の `provider` に応じて適切な Provider を使い分ける。
Diff Engine (Phase 12) は provider-agnostic で動作する (fingerprint 照合方式が
異なるだけ)。

---

## 6. UI / UX

### 6.1 CurseForge 検索 UI

Modrinth 検索 (`/mods`) と並列で:
- タブ: `[ Modrinth ] [ CurseForge ]`
- 検索方式は API 依存

### 6.2 CurseForge バッジ

各 ContentItem 表示に provider バッジ:
```text
Sodium [Modrinth]
Just Enough Items [CurseForge]  ← 色分け
```

### 6.3 Modpack Import タブ

Phase 12 の Modpack タブに CurseForge 対応を追加:
```text
Modpack から Profile を作成
[ .mrpack ] [ CurseForge .zip ]  ← Phase 13 で有効化
```

---

## 7. 実装フェーズ分割 (Phase 13 内、暫定)

### Phase 13-A: 基盤 + Provider 完成 (1〜2 週)
- CurseForge API proxy Route Handler
- Murmur2 計算 (Web Worker)
- `CurseForgeProvider` 実装
- 個別 CurseForge Mod / RP / Shader の Import

### Phase 13-B: Modpack + 更新検知 (1 週)
- CurseForge Modpack .zip の完全 Import
- Modpack 更新検知 + Sync
- Provider 混在 Profile の Sync 動作確認

**詳細計画は Phase 12 完了時 (Phase 11+12 の実装経験を踏まえて) 策定する**。

---

## 8. 未解決の設計論点 (Phase 12 完了時に確定)

- [ ] CurseForge API key 認証方式の最終決定 (オプション A/B/C)
- [ ] Murmur2 実装の選択 (`murmurhash-js` vs 自前実装)
- [ ] CurseForge の overrides フォルダの扱い (Modrinth の overrides と同じ policy?)
- [ ] Provider 混在時の依存関係チェックの一貫性 (Modrinth の dependency が
      CurseForge Mod を要求する場合)
- [ ] CurseForge の rate limit と DropMod 側 caching 戦略

---

## 9. Roadmap: Phase 13 以降

- **Phase 14+**:
  - Modrinth ↔ CurseForge 手動置換 UI
  - 追加 provider (GDLauncher local marketplace 等)
  - config/saves 同期 (Phase 11 の Roadmap 2 から昇格判断)

---

**関連ドキュメント**:
- `docs/planning/PHASE11_PLAN.md` — Phase 11 (Read-only Import)
- `docs/planning/PHASE12_PLAN.md` — Phase 12 (Sync + Modrinth Modpack)
- CurseForge API docs: https://docs.curseforge.com/
