# Image Strategy — 高速化・高画質化の方針 ⭐

> **直近（2026-08-24）で確立した重要知見。** 画像・アイコン・GIF・Markdown 画像を触る前に必読。

## 背景：かつての問題（すべて解決済）

1. **低画質** — `icon_url`/ギャラリー `url` は低解像度サムネイル（`_96.webp`=96px / `_350.webp`=350px）を使っていた。
2. **表示遅延・もっさり** — `next/image` が `sharp` 未導入環境（Sandbox/dev）で再エンコード超重い。Modrinth は既に WebP 最適化済みなのに二重処理。
3. **Markdown 画像/GIF 不表示・遅い** — `next/image` の `remotePatterns` 制限で任意ホストを弾く＋プロキシ重い。

## Modrinth CDN の画像 URL 仕様（実 API で確認済）

| API フィールド | 実体 | 用途 |
| :--- | :--- | :--- |
| `icon_url` | `.../data/<id>/<hash>_96.webp`（**96px** サムネ） | 小型表示（カード 40px・モーダル 48px 等） |
| `raw_icon_url` | `.../data/<id>/<hash>.png`（**オリジナル**） | 大型表示（詳細ヒーロー 112–128px） |
| gallery `url` | `.../data/<id>/images/<hash>_350.webp`（**350px**） | インラインギャラリーサムネ |
| gallery `raw_url` | `.../data/<id>/images/<hash>.png`（**オリジナル**） | 全画面ギャラリービュー |

> **オンデマンドサイズ（`_256`/`_512`/`_1024` 等）は 404 で存在しない**。使えるのは `_96`/`_350`（固定）と `raw_*`（オリジナル）のみ。

## 方針（3 本柱）

### 1. Modrinth CDN 画像 = `unoptimized`（直接 CDN 取得）

Modrinth CDN は既に最適化済み WebP をグローバル エッジキャッシュで配信。`next/image` の `/_next/image` プロキシ（sharp 未導入で超重い）を通すのは二重処理の無駄。**`unoptimized` でブラウザが CDN から直接取得** → 最速。

判定ヘルパ `src/lib/utils/image.ts`:
```ts
shouldUnoptimizeImage(src) = isAnimatedImageUrl(src) || isModrinthCdnUrl(src)
```
- `isAnimatedImageUrl`: `.gif` 判定（next/image は GIF 最適化不可）
- `isModrinthCdnUrl`: `host === 'cdn.modrinth.com'`

→ 全 `<Image>` で `unoptimized={shouldUnoptimizeImage(src)}`。適用済: ModCard / ModsPageClient / DependencyCheckModal / ModDetailPageView / ModDetailModalShell / ScreenshotGalleryModal / landing(PreviewCard, PopularMarquee)。

### 2. 大型表示 = `raw_icon_url` / `raw_url`（高画質）

- **詳細ページ ヒーローアイコン**（112–128px 表示）: `src={project.raw_icon_url || project.icon_url}`。`_96` ではぼやけるため。
- **ギャラリー全画面モーダル**（ScreenshotGalleryModal メインビュー）: `src={current.raw_url || current.url}`。
- 小型（カード 40px / モーダルヘッダ 48px / インラインサムネ）は `_96`/`_350` のままで十分高精細。
- `types.ts` に `ModrinthProject.raw_icon_url?` / `ModrinthGalleryImage.raw_url?` を追加済（API 応答に含まれる）。
- ※ `/search` の hit には `raw_*` が無い（`icon_url` のみ）。カードは `_96` で OK。

### 3. Markdown 本文画像 = ネイティブ `<img>`

本文画像は作者が imgur / GitHub raw / Modrinth CDN 等**任意ホスト**・不定サイズ。`next/image` だと `remotePatterns` 外ホストが 400 で**表示されない**＋プロキシ重い＋GIF 再生不可。よって `MarkdownRenderer` の `img` は **ネイティブ `<img>`（`loading="lazy"` + `decoding="async"`）** に統一。
- 任意ホスト表示可・GIF 再生・プロキシ無しだけ最速・Modrinth は既に WebP で品質問題なし。
- Biome `noImgElement` 警告は `<img>` 直前に `// biome-ignore lint/performance/noImgElement: ...` で抑制。

## Vercel デプロイ後の申し送り

- `unoptimized` により Modrinth 画像の AVIF 変換恩恵は失われるが、**Modrinth が既に WebP 配信**なので実質ロス無し。最速優先でこの方針維持。
- 非 Modrinth 静止画（GitHub raw 等）は最適化 ON のまま（Vercel で AVIF/WebP 変換の恩恵あり）。

## next.config.ts

- `images.remotePatterns`: `cdn.modrinth.com`（pathname 絞りなし: `/data/**`・`/data/cached_images/**` 等をカバー）+ `raw.githubusercontent.com`。
- 注: `unoptimized` 画像は remotePatterns 検査を受けない（プロキシ未使用のため）。上記は最適化経路用の防御設定。

## アイコン追加時（FontAwesome subset）

`<i className="fa-solid fa-xxx">` 追加後は **必ず `pnpm build:fa-subset`** で `src/styles/fontawesome-subset.css` 再生成（AGENT.md §6.7）。

## 関連

- コミット `d41cee5`（実装）/ [modrinth-integration.md](./modrinth-integration.md) / [sandbox-constraints.md](./sandbox-constraints.md)（sharp:false の理由）
