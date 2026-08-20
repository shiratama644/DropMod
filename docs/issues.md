# DropMod バグ・課題 完全リスト

> **調査日:** 2026-08-21 (JST)
> **対象コミット:** `arena/01a01fcf-dropmod` (Vite 6 + Hono 4 + React 18 + TS 5.7)
> **調査手法:** `tsc --noEmit` / `vite build` / 全ソース目視レビュー / Modrinth API 公式仕様照合 / react-markdown v9 破壊的変更確認 / セキュリティ観点静的解析
> **総件数:** 32件 (Critical: 4 / High: 7 / Medium: 11 / Low: 10)
>
> ## ✅ 修正完了ステータス (2026-08-21 更新)
>
> **全 32 件の修正が完了しました。**
>
> - 🔴 Critical: **4/4** ✅
> - 🟠 High: **7/7** ✅
> - 🟡 Medium: **11/11** ✅
> - 🟢 Low: **10/10** ✅
>
> **検証:**
> - `pnpm exec tsc --noEmit` → **エラー 0 件**
> - `pnpm exec vite build` → **成功**
>
> **主な副次改善:**
> - `useModalA11y` 共通フックの新設で全モーダルのa11y統一
> - `ConfirmDialog` + `useConfirm` フックで `window.confirm()` を全廃
> - `services/api.ts` 全書き換え (LRU/TTL + 429 リトライ + キー安定化)
> - `downloadAsBlob` ヘルパーで クロスオリジン .jar DL を確実に

**重大度定義**
- 🔴 **Critical**: 本番でユーザー影響を確実に引き起こす。修正必須。
- 🟠 **High**: 特定条件下で明確に壊れる / セキュリティ/性能/UXに大きな影響。
- 🟡 **Medium**: エッジケースで発現するバグ、TS型不整合、a11y、UXの劣化。
- 🟢 **Low**: コードスメル、将来的なメンテ負債、些細な UI 不整合。

---

## 🔴 Critical (4件)

### C-1. `types.ts` に存在しない `Mod` を import している (TypeScript コンパイルエラー)
- **箇所:** `src/hooks/useZipExport.ts:3`, `src/components/DependencyCheckModal.tsx:2`
- **症状:** `tsc --noEmit` で `TS2305: Module '"../types"' has no exported member 'Mod'` が発生。`types.ts` の実際の型名は **`ModItem`**。
- **影響:** `tsc` を CI に組み込むと即座にビルド失敗。現状は Vite の SWC がゆるいため `vite build` は通ってしまうが、型安全性が完全に崩れている（`Mod` は `any` 相当で解決される）。`DependencyCheckModal` の `missingRequired[]` / `conflicts[]` / `optionalAvailable[]` / `verifiedOK[]` すべてが型チェックを受けていない。
- **修正:** `Mod` → `ModItem` に変更。

### C-2. `AutoFix` が同一依存を持つ複数Modを追加中に自分自身をトグルで削除
- **箇所:** `src/components/DependencyCheckModal.tsx:250-262` (`handleAutoFix`)
- **症状:** `data.missingRequired` は「(sourceMod, targetProjectId) のペア」のリスト。**同じ `targetProjectId` が複数の source から重複登場**（例: 5つの Mod が Fabric API に依存 → `targetProjectId='fabric-api'` が5回入る）。`handleAutoFix` はループで `onToggleMod(targetProjectId, ..., true)` を順次呼ぶが、`onToggleMod` はトグル動作なので **2回目以降で追加したばかりの Mod を即削除**してしまう。
- **影響:** ユーザーが「一括解決」ボタンを押すと、依存Modが**追加されないか、片っ端から追加⇔削除を繰り返して最終的に奇数回だけ追加された状態**になる。実質AutoFix機能が壊れている。
- **修正:** `handleAutoFix` 内で `new Set(data.missingRequired.map(x => x.targetProjectId))` により重複除去してから、`getState` 系で「現在プロファイルに未追加」だけをトグルする。

### C-3. `useProfiles.handleToggleMod` の stale closure による多重呼出しでの不整合
- **箇所:** `src/hooks/useProfiles.ts:121-176`
- **症状:** `handleToggleMod` はクロージャ内で `currentProfile.mods.findIndex(...)` を参照する。しかし関数は `useCallback` でラップされておらず、AutoFixの様な**短時間連続呼出し時、setState 反映前に次の呼出しが古い `currentProfile` を見る** → 「未追加」と判定されて重複追加、または「追加済み」と判定されて削除。
- **影響:** C-2 と組み合わさり、依存関係の一括解決が予測不能な結果になる。バックグラウンド処理から並列に呼び出された場合も同様。
- **修正:** `setProfiles((prev) => …)` の functional updater 内で `find` を行うか、`profileRef` パターン（useRefで最新値を保持）に統一する。

### C-4. **Modrinth API レートリミット (300 req/min) 完全無視 → BAN リスク**
- **箇所:** 全 `fetchModrinth` 呼出し (`src/services/api.ts`, `src/hooks/useDependencyCheck.ts` の5秒ポーリング等)
- **症状:** Modrinth 公式ドキュメントは 300 req/min のレートリミットと `429 Too Many Requests` + `Retry-After` ヘッダーの尊重を要求 [Modrinth API rate limit policy](https://docs.modrinth.com/api/#ratelimits)。DropModは:
  - `useDependencyCheck` が **5秒ごとに `/versions` バッチを叩き続ける** (アプリを開きっぱなしで1時間 = 720 req、複数Modで加算)。
  - `useModSearch` のデバウンス350ms + `IntersectionObserver` (rootMargin: 800px) で無限スクロール中に多重リクエスト可能。
  - `429` レスポンスを一切ハンドリングしていない（`res.ok` チェックのみで catch も無く、`Retry-After` を無視）。
  - `apiCache` は無制限に成長するのでキャッシュヒットで多少軽減されるが、`noCache: true` の呼出しや異なるパラメータでミスすると即リクエスト。
- **影響:** ユーザーの IP が Modrinth から 1〜5分の一時BANを受ける。ヘビーユーザーは常時使用不能状態になる。長期的な IP 恒久ban のリスク。
- **修正:**
  1. `useDependencyCheck` のポーリングを廃止し、`profile.mods` の変更時のみ実行する。
  2. `fetchModrinth` で `429` を検出したら `Retry-After` を尊重した exponential backoff。
  3. `apiCache` に TTL と LRU サイズ上限を設定。

---

## 🟠 High (7件)

### H-1. `ModsTab` が Mod追加/削除の度に「プロファイル全 Mod のバージョンを直列で再フェッチ」
- **箇所:** `src/components/ModsTab.tsx:29-48`
- **症状:** `useEffect` の deps に `[profile.mods, profile.mcVersion, profile.loader]` を指定し、`for (const mod of profile.mods) await fetchStableModVersion(mod.id, profile)` で**直列に**全 Mod のバージョン一覧を取得。`profile.mods` は `handleToggleMod` などで新配列に置き換わるため、Modを1つ追加/削除する度に **N 個の直列APIコール**が発生（N = プロファイル内 Mod 数）。50 Mod のプロファイルで 1 個追加 → 51 API 呼出し・数秒間のフリーズ。
- **影響:** 大規模プロファイルで顕著な UX 劣化 + Modrinth レートリミット即抵触 (C-4)。
- **修正:**
  1. deps を `[profile.mods.length, profile.mcVersion, profile.loader]` にし、追加/削除でトリガーしても新規Modのみ差分取得する。
  2. `Promise.all` で並列化。
  3. 既に `modVersionsMap` にあるMod IDはスキップ。

### H-2. **`crypto.subtle` は HTTPS/localhost 限定** — HTTP 配信時 ZIPインポート機能不全
- **箇所:** `src/utils/hash.ts:2` (`calculateSha1`)
- **症状:** `crypto.subtle.digest` は **Secure Context** (HTTPS または `localhost`) でのみ動作。カスタムドメインを HTTP で提供したり、社内 LAN の非HTTPSでホストすると `.jar` 詰め合わせ ZIP インポートが完全に失敗し、エラーメッセージも不明瞭（"ZIPの解析に失敗しました" とだけ表示）。
- **影響:** 一般的なホスティング(Vercel/Netlify)は HTTPS 自動なので実運用リスクは限定的だが、ユーザーが self-host すると気付けない。
- **修正:** 事前に `if (!window.isSecureContext) showToast('HTTPS環境でのみ .jar 詰めZIPインポートが可能です', 'warning')` を出す。または pure-JS SHA-1 実装にフォールバック。

### H-3. **`.mrpack` ファイルが input[type=file] で選択できない** (accept 属性から漏れ)
- **箇所:** `src/components/Header.tsx:128,187`, `src/components/SettingsTab.tsx:87`
- **症状:** すべてのファイル入力が `accept=".zip"` のみ指定。しかし `useZipImport.ts:24` は `modrinth.index.json` の存在で `.mrpack` を判定する処理を持っている。**ユーザーが `.mrpack` ファイルを選択しようとしてもファイルピッカーでグレーアウトされ選ばせてもらえない**。
- **影響:** 説明文にある「.mrpack インポート」機能が事実上、ドラッグアンドドロップ経由でしか使えない。宣伝されている機能の重要な入口が閉じている。
- **修正:** `accept=".zip,.mrpack,application/zip"` に変更。

### H-4. **Modrinth CDN 直リンクの `download` 属性は無視される** (クロスオリジン仕様)
- **箇所:** `src/components/ModsTab.tsx:175-180, 245-250`, `src/components/ModDetailModal.tsx:255-262`
- **症状:** `<a href={mod.fileUrl} download={filename} target="_blank">` は同一オリジンでしか `download` 属性が効かない。`cdn.modrinth.com` は別オリジンのため、**指定したファイル名にならず、ブラウザによっては `.jar` が新タブで開かれるだけ（ダウンロードダイアログが出ない）**。
- **影響:** ユーザーが「直DL」を期待しても、リネームが効かない・そもそもダウンロード扱いにならないケースが発生。
- **修正:** `fetch(fileUrl).then(r => r.blob())` → `URL.createObjectURL` → `<a download>` パターンで同一オリジン Blob 化。もしくはUIで「Modrinth CDNで開く」と明示。

### H-5. `apiCache` に上限がなくメモリリーク
- **箇所:** `src/services/api.ts:3` (`const apiCache = new Map<string, any>();`)
- **症状:** `fetchModrinth` の結果を全て永続的に `Map` に保持。無限スクロール検索を続けると、`cacheKey = endpoint + params のシリアライズ` で膨大なキーが蓄積される。
- **影響:** SPAを長時間開いたままにするとブラウザメモリが数百MB〜GB規模まで肥大化する可能性。
- **修正:** LRU (最大200件など) にする。または結果サイズが大きいレスポンス(bodyを含む/project)は個別上限。

### H-6. `ModDetailModal` の deps に `profile` オブジェクト全体 → 意図しない再フェッチ
- **箇所:** `src/components/ModDetailModal.tsx:35-54`
- **症状:** `useEffect` deps に `[isOpen, projectId, profile]`。**プロファイル状態が更新される度**（他のModを追加/削除しただけでも）詳細モーダルが開いている限り再フェッチ。プロファイル切替時ならまだしも、Mod追加/削除時にも走るのは無駄。
- **影響:** 詳細モーダルを開いた状態で追加ボタンを押す → その瞬間に本文/バージョン一覧が再ロード → チカつく UX + APIコール増加 (C-4 に寄与)。
- **修正:** deps を `[isOpen, projectId, profile.mcVersion, profile.loader]` に絞る。

### H-7. **検索結果の競合状態** (Race Condition) — AbortController 未使用
- **箇所:** `src/hooks/useModSearch.ts:29-71` (`executeSearch`)
- **症状:** 検索中にカテゴリ・ソート・キーワードを変更 → 新旧のリクエストが並列で in-flight。**後着のレスポンスが古い方だと、UIが古い結果で上書きされる**。特にネットワーク不安定時に顕著。
- **影響:** ユーザーが「1.20.1で検索」→「1.21で検索」と切り替えたら 1.20.1 の結果が表示される、といった予測不能な UI 状態。
- **修正:** `AbortController` を導入し、次の `executeSearch` 時に前のリクエストを abort。

---

## 🟡 Medium (11件)

### M-1. `HTMLIElement` 型が存在しない
- **箇所:** `src/components/CustomDropdown.tsx:25` (`useRef<HTMLIElement>(null)`)
- **症状:** `HTMLIElement` は存在しない型名。正しくは `HTMLElement`(`<i>` は `HTMLElement`)。`tsc --noEmit` で `TS2552`。
- **影響:** 型安全性喪失。実行時は問題ないが CI 通らない。
- **修正:** `useRef<HTMLElement>(null)` に変更。

### M-2. `HomeTab` の `sentinelRef` 型不整合
- **箇所:** `src/components/HomeTab.tsx:26` (props 型) / `303` (使用箇所)
- **症状:** props で `React.RefObject<HTMLDivElement | null>` を受け取り、そのまま `<div ref={sentinelRef}>` に渡す。React 18 の `Ref` 型は `HTMLDivElement | null` を許容しない (legacy ref 定義)。`tsc --noEmit` で `TS2322`。
- **影響:** 型エラー。実行時無害。
- **修正:** `useRef<HTMLDivElement>(null)` を `useModSearch` 側で `useRef<HTMLDivElement | null>(null)` に切り替えるか、props 型を `MutableRefObject<HTMLDivElement | null>` にする。

### M-3. **react-markdown v9 で `inline` プロップは削除済み** → 全コードブロックが `<pre>` になる
- **箇所:** `src/components/MarkdownRenderer.tsx:143` (`code: ({ node, inline, className, ... })`)
- **症状:** react-markdown v9 で **`inline` プロップは廃止**され、`className` の有無や `node.tagName` で判定する必要がある [remarkjs/react-markdown Issue #834](https://github.com/remarkjs/react-markdown/issues/834)。現状 `inline` は常に `undefined` → `if (inline)` は常に false → **Modrinth 本文中のインラインコード `` `hoge` `` が巨大な `<pre>` ブロックとして描画される**。
- **影響:** Mod 詳細モーダルの本文表示品質が大きく劣化。
- **修正:** ``` code: ({ node, className, children, ...props }) => { const isInline = !className?.startsWith('language-'); ... } ``` のように書き換え。

### M-4. `CustomDropdown` がドロップダウン内スクロールでも閉じてしまう
- **箇所:** `src/components/CustomDropdown.tsx:122-128` (`window.addEventListener('scroll', handleWindowChange, true)`)
- **症状:** capture-phase で全スクロールを補足しているため、**ドロップダウンメニュー自身が overflow-y:auto を持ち max-height:240px でスクロール可能なのに、その中をスクロールした瞬間閉じる**。
- **影響:** バージョン一覧など長いドロップダウンで、下側の項目を見ようとするたびに閉じてしまう。
- **修正:** `handleWindowChange` の中で `menuRef.current?.contains(e.target)` の場合は無視 (ただしscrollイベントのtargetはメニュー自身になる)、または再位置決めして開いたままにする。

### M-5. `.mrpack` インポート時に Quilt loader を判定できていない
- **箇所:** `src/hooks/useZipImport.ts:30-33`
- **症状:** `if (mrpackData.dependencies?.forge) loader = 'Forge'; if (mrpackData.dependencies?.neoforge) loader = 'NeoForge';` の分岐に **Quilt (`quilt-loader`) が抜けている**。デフォルトの `Fabric` にフォールバックされる。
- **影響:** Quilt モジュラーパックを .mrpack でインポートすると Fabric として扱われ、以降の互換版検索で誤マッチする。
- **修正:** `if (mrpackData.dependencies?.['quilt-loader']) loader = 'Quilt';` を追加。

### M-6. `useProfiles` の初回 useEffect が2つ同時発火 → 一瞬デフォルト値を LocalStorage に書き戻す
- **箇所:** `src/hooks/useProfiles.ts:19-46`
- **症状:** 復元 useEffect と保存 useEffect が両方マウント時に走る。順序上、**保存 useEffect が「初期state (default-profile)」を先に localStorage へ書く可能性**があるが、実際は React が全 useEffect を同期的に順次実行→ 復元 setState → 再レンダー → 保存で復元後の値を上書き。**現状は無害だが、race condition の余地あり**。
- **影響:** 通常時は問題なし。ただしユーザーが極端に高速にリロードすると想定外の書き込みが起きうる。
- **修正:** 復元完了フラグを持ち、`hasHydrated` が true になるまで保存を抑制する。

### M-7. 検索エフェクトの二重発火 (マウント直後)
- **箇所:** `src/hooks/useModSearch.ts:74-84`
- **症状:** 
  - `useEffect [mcVersion, loader, category, sortBy]` がマウント時即発火
  - `useEffect [searchInput]` が 350ms 後に発火 (空文字での検索)
  - → **マウント直後に検索リクエストが2回飛ぶ**。
- **影響:** 初期ロード時の APIコール数増加(C-4 レートリミットに寄与)、無駄なちらつき。
- **修正:** `useRef<boolean>(true)` で isInitialMount フラグを立て、`searchInput` の useEffect を初回スキップ。

### M-8. 主要モーダルで `role="dialog"` / `aria-modal` / フォーカストラップが未実装
- **箇所:** `src/components/ModDetailModal.tsx`, `src/components/NewProfileModal.tsx`, `src/components/ZipProgressModal.tsx`
- **症状:** `EditProfileModal` と `DependencyCheckModal` には `role="dialog"` / `aria-modal="true"` / `aria-labelledby` が付与されているが、他モーダルには**未付与**。フォーカストラップも全モーダル未実装 (Tab キーで背景要素にフォーカスが抜ける)。
- **影響:** スクリーンリーダー使用者・キーボード操作ユーザーがモーダル外にフォーカスを失う。WCAG 2.1 違反。
- **修正:** 全モーダルに `role` / `aria` 属性、およびフォーカストラップライブラリ (`focus-trap-react` 等) を導入。

### M-9. `NewProfileModal` / `ModDetailModal` / `ZipProgressModal` に Escape キー close 未実装
- **箇所:** 上記3モーダル
- **症状:** `EditProfileModal:46` と `DependencyCheckModal:232` には `keydown` Escape ハンドラがあるが、他モーダルは背景クリックでしか閉じられない。
- **影響:** UX の一貫性欠如。特に `ZipProgressModal` は「進行中に Esc で止めたい」というユーザー期待に反する。
- **修正:** 共通の `useEscapeKey(onClose)` フックを作って全モーダルに適用。

### M-10. `body { user-select: none; }` により、Mod タイトル・説明文がコピー不能
- **箇所:** `src/index.css:61`
- **症状:** `user-select: none` を `body` に付与しているため、**Mod タイトル、説明文、バージョン番号、コード等が一切選択・コピーできない**。ユーザーが Mod 情報を検索したい時に不便。
- **影響:** UX 悪化。特にサポート問い合わせで Mod 名やバージョン番号をコピペしたい場面。
- **修正:** `user-select: none` は特定のクリック要素 (`button`, `.tab-btn`, `.custom-dropdown-trigger` 等) に限定し、テキストコンテンツには適用しない。

### M-11. `viewport meta` の `user-scalable=no` が WCAG 違反
- **箇所:** `index.html:5`
- **症状:** `<meta name="viewport" content="... user-scalable=no ...">` はモバイルでのピンチズームを禁止。**WCAG 2.1 SC 1.4.4 (Resize Text) 違反**。
- **影響:** 視覚障害者・弱視ユーザーが拡大表示できない。iOS では強制的にズーム可能にする設定もあるが、Android/デスクトップでは効いてしまう。
- **修正:** `user-scalable=no, maximum-scale=1.0` を削除する。フォームフォーカス時の自動ズームが気になる場合は `<input>` の `font-size: 16px` 以上で対応。

---

## 🟢 Low (10件)

### L-1. Server プロキシで path traversal が理論上可能
- **箇所:** `server/index.ts:9-11` (`app.all('/api/modrinth/*', ...)`)
- **症状:** `path.replace(/^\/api\/modrinth/, '')` の後 `MODRINTH_API_BASE + path` を作る。`/api/modrinth/../admin` のようなリクエストは fetch が URL 正規化する時に `https://api.modrinth.com/admin` に到達しうる。Modrinth ドメイン外には行かないので **SSRF リスクは限定的**だが、意図しないエンドポイントへの中継は好ましくない。
- **影響:** ほぼ理論上のみ。Modrinth に管理エンドポイントを開かれれば実害。
- **修正:** path を allowlist 化するか、少なくとも `..` を含むパスを 400 で reject。

### L-2. サーバーが全 HTTP メソッドを透過 (`app.all`)
- **箇所:** `server/index.ts:9`
- **症状:** `all()` で GET/POST/PUT/DELETE/PATCH/OPTIONS 全部を通す。DropMod が使うのは GET / POST のみ。
- **影響:** 不要なメソッドが開いているのは最小権限の原則違反。実害は Modrinth 側の認証が無いため無し。
- **修正:** `app.on(['GET', 'POST'], '/api/modrinth/*', handler)` に限定。

### L-3. `Server` レスポンスで `arrayBuffer()` に全ロード
- **箇所:** `server/index.ts:32`
- **症状:** Modrinth からのレスポンスを `arrayBuffer()` で全量メモリに載せてから返す。大きなレスポンス (project detail の body が長い等) でメモリピーク。
- **影響:** サーバーのメモリ使用量増加。ストリーミングにすれば軽量化可能。
- **修正:** `return new Response(res.body, { status: res.status, headers: responseHeaders });` (Web Streams パススルー)。

### L-4. `services/api.ts` の `errorMsg` は集められるが未使用
- **箇所:** `src/services/api.ts:37, 55, 59` (`let errorMsg = ''`)
- **症状:** proxy 失敗時に `errorMsg` を書き込むが、その値は最終的にどこにも使われていない。dead code。
- **影響:** メンテ性の低下。デバッグ困難。
- **修正:** `console.warn(errorMsg)` を追加するか、変数を削除。

### L-5. `apiCache` のキーが params オブジェクトの順序に依存
- **箇所:** `src/services/api.ts:12-17`
- **症状:** `JSON.stringify({a:1,b:2})` と `JSON.stringify({b:2,a:1})` は別文字列 → 同じリクエストなのに 2つのキャッシュエントリ。
- **影響:** キャッシュヒット率低下 (H-5 の肥大化にも寄与)。
- **修正:** `Object.keys(params).sort()` してから stringify。

### L-6. Modrinth Version レスポンスの `filename` 重複を考慮せず JSZip に追加
- **箇所:** `src/hooks/useZipExport.ts:210`
- **症状:** 2つ以上の Mod が同一 `filename` (例: `mod.jar`) を持つ場合、JSZip は同名エントリを **静かに上書き**。取得成功件数は増えるがZIP内には1つしか入らない。
- **影響:** 稀ケースだが、mrpack由来のプロファイルで発生しうる。
- **修正:** `getModFileName` で重複検出時に `-N` サフィックスを付与。

### L-7. `<a target="_blank">` に `rel="noopener"` が明示されていない
- **箇所:** `src/components/MarkdownRenderer.tsx:65`, `src/components/ModDetailModal.tsx:258`, `src/components/ModsTab.tsx:178, 249`
- **症状:** `rel="noreferrer"` のみ。ほとんどのブラウザで暗黙的に `noopener` は含まれるが、明示するのが標準。
- **影響:** 古いブラウザで tabnabbing 攻撃の理論的リスク。
- **修正:** `rel="noopener noreferrer"` に統一。

### L-8. `MarkdownRenderer.sanitizeSchema` が `iframe.src` / `img.src` の URL 制約なし
- **箇所:** `src/components/MarkdownRenderer.tsx:20`
- **症状:** `iframe: ['src', 'width', ...]` で `src` を許可するが URL スキームの制約なし。理論上 `javascript:` / `data:` は rehype-sanitize がデフォルトで弾くが、任意ドメインの iframe (例: 悪意ある .com) は Modrinth 本文に貼り付けられれば表示される。style 属性も許可 → CSS injection でオーバーレイ attack。
- **影響:** Modrinth 本文の投稿者を信頼する前提の設計になっている。Modrinth 側で本文審査があるので実害は低いが、脅威モデル的にはリスク。
- **修正:** `iframe.src` を allowlist (`youtube.com`, `youtu.be`, `player.vimeo.com` 等) で制限。`style` 属性は削除。

### L-9. `confirm()` ネイティブダイアログを使用
- **箇所:** `src/hooks/useProfiles.ts:111, 217`, `src/App.tsx:141`
- **症状:** プロファイル削除・全Mod削除・データ初期化で `window.confirm()`。デザインシステム(glass-panel)と乖離、iOS で意図しない挙動、モバイル UX 劣化。
- **影響:** UX の一貫性欠如。
- **修正:** 既存のモーダルシステムを使った確認ダイアログコンポーネントを作る。

### L-10. `ModCard` の画像失敗時に代替アイコンにフォールバックしない
- **箇所:** `src/components/ModCard.tsx:38-40`
- **症状:** `onError={(e) => { (e.target).style.display = 'none' }}` で画像を隠すだけ → その場所が **空白**になる。else 分岐で用意した「Emerald の `fa-cube` プレースホルダー」に切り替わらない。
- **影響:** アイコン取得失敗の Mod カードで見た目が乱れる。
- **修正:** state で `imgFailed` を持ち、失敗時にプレースホルダー要素をレンダリング。

---

## 📊 集計サマリ

| 重大度 | 件数 | 代表的な影響領域 |
|---|---|---|
| 🔴 Critical | 4 | 型エラー、AutoFix破損、Modrinth BAN、状態不整合 |
| 🟠 High | 7 | 性能、機能不全 (.mrpack, 直DL, HTTPS)、レースコンディション |
| 🟡 Medium | 11 | a11y、UX、TS型不整合、Markdown描画 |
| 🟢 Low | 10 | セキュリティ潜在、コードスメル、メンテ性 |
| **合計** | **32** | |

## 🎯 優先修正推奨順序

1. **C-1 (型 import ミス)** — 5分で修正、CI 通す。
2. **C-2 + C-3 (AutoFix + トグル)** — 依存関係一括解決の中核機能を復活させる。
3. **C-4 (レートリミット)** — Modrinth BAN を招く前に対処。特に `useDependencyCheck` のポーリング停止。
4. **H-3 (.mrpack accept)** — 1行修正で機能開放。
5. **H-1 (ModsTab の N+1 fetch)** — 大規模プロファイルの UX を守る。
6. **M-3 (react-markdown v9 対応)** — 本文表示の見栄え。
7. **H-2, H-7, H-4** — 環境依存 / 競合状態 / 直DL 動作。
8. その他 M/L は個別のリファクタリングで順次。

---

## 📚 参考文献

- [Modrinth API Ratelimits (公式)](https://docs.modrinth.com/api/#ratelimits)
- [react-markdown v9 breaking change: inline prop removed (Issue #834)](https://github.com/remarkjs/react-markdown/issues/834)
- [MDN: Web Crypto API Secure Context Requirement](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API#interfaces)
- [WCAG 2.1 SC 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html)
- [HTML spec: `<a download>` cross-origin restriction](https://html.spec.whatwg.org/multipage/links.html#downloading-hyperlinks)

---

# 🔄 第2波: 実運用時の再発バグ調査 (2026-08-21 更新)

ユーザーから「**真っ暗になる**」「**Mod一覧が表示されない**」との報告を受け、
更に深く精査。以下 28件の追加バグを発見・修正した。

## 🚨 Critical (真っ暗の直接/潜在原因) 4件

### C2-1. `ModDetailModal` — Rules of Hooks 違反 (真っ暗の直接原因)
- `if (!isOpen || !projectId) return null;` の**後**に `useRef`, `useId`,
  `useModalA11y` を呼んでいた。isOpen トグルで React が「レンダー毎のフック
  呼び出し数の変化」を検知し `Rendered fewer/more hooks than expected`
  エラーを throw。ErrorBoundary が無かったため React root が完全アンマウント
  → 画面全体が真っ暗になる。
- **修正**: すべてのフックを早期 return より前に移動。

### C2-2. `App.tsx handleSwitchTab` — GSAP タブフェード
- `gsap.to(#tab-xxx, {opacity:0}, onComplete: setActiveTab)` の
  onComplete 未発火や DOM 差替時の inline style 残留で
  タブ全体が `opacity: 0` のまま表示される。→ 真っ暗
- **修正**: GSAP を廃止し純粋な CSS `@keyframes tab-fade-in` に置換。

### C2-3. `HomeTab` — GSAP カードアニメの style 残留
- `gsap.fromTo({opacity:0}, ...)` を絞り込み高速切替中に `killTweensOf`
  すると inline style が半端な値で残る。React が同一 key で DOM を
  再利用するとその半透明が新しい hit にも引き継がれる → **Mod カードが
  半透明のまま表示** = 「Mod一覧が見えない」現象。
- **修正**: GSAP を廃止し CSS `@keyframes mod-card-appear` (nth-child
  delay で stagger 模倣) に置換。

### C2-4. `useModSearch` — stale executeSearch closure
- useEffect が `useCallback(executeSearch, [...])` を deps 外していた
  ため、sortBy/カテゴリ変更が反映されない古い関数を呼び続け、
  「絞り込み変更しても結果が変わらない」バグ。
- **修正**: `executeSearchRef.current(...)` パターンで常に最新関数を呼ぶ。

## 🟠 High (機能不全 / データ破損) 8件

### H2-1. `useProfiles` — profiles が空配列でクラッシュ
- 破損 LocalStorage 復元や race で `profiles=[]` になると
  `currentProfile = profiles.find(...) || profiles[0]` が undefined、
  `currentProfile.mods.length` などで TypeError → 真っ暗。
- **修正**: LocalStorage 復元時に schema sanitize、profiles=[] を
  検出したら既定プロファイル自動復旧、`currentProfile` は常に
  transient-fallback で非 undefined を保証。

### H2-2. `ErrorBoundary` 未実装 → どこかで throw されると全画面消失
- **修正**: `src/components/ErrorBoundary.tsx` を新設、`main.tsx` で
  App を wrap。エラー時はリロード / データ削除の選択肢を提示。

### H2-3. `NewProfileModal` / `EditProfileModal` — 開いてる最中の
    profile 更新で入力中の値が突然リセット
- useEffect deps に `[isOpen, profile, mcVersions]` 全部入れていたため、
  親側の Mod 追加/削除で profile 参照が変わる度にフォームリセット。
- **修正**: `wasOpenRef` パターンで「閉→開」遷移時のみ初期化。

### H2-4. `ToastContainer` — トーストが永遠に消えない
- `useEffect deps=[toast.id, onDismiss]` で親再レンダーの度に onDismiss が
  新参照 → タイマーが 3秒毎にリセット → トーストが永遠に消えない。
- **修正**: `onDismissRef` で ref 化し deps から除外、`toast.id` のみ。

### H2-5. `useModSearch` — API失敗時に「見つかりません」誤表示
- ネットワーク完全失敗 → hits=[] → HomeTab は「Modrinthに条件に一致する
  Modが見つかりませんでした」を表示 → 「Mod一覧が出ない」に見える。
- **修正**: `searchError` state を追加、エラー時は「Modrinthから取得
  できませんでした + 再試行」ボタンを表示。

### H2-6. `useModSearch` — sentinel が useRef のためタブ切替でobserver再attachされない
- 別タブに切り替え → HomeTab アンマウント → refがnull → observer.disconnect
  → homeに戻る → HomeTab再マウント → refに新しいdom set されるがuseEffectは
  発火せず observer 未attach → **無限スクロールが動かない**
- **修正**: sentinelRef を callback ref (`setSentinelEl`) に変え、
  useEffect の deps に `sentinelEl` を入れる。

### H2-7. `useDependencyCheck` — profile変化で無限に再フェッチ
- deps に profile 全体 → Mod追加/削除の度に API 叩く → レートリミット。
- **修正**: profile.id / mcVersion / loader / modsSignature のみ deps。

### H2-8. `useZipExport` — README.txt と実ZIP内ファイル名の不一致
- README には dedup 前のファイル名を書く一方、ZIP内は dedup後 (`-2.jar`)
  のためユーザーが README を見ても「その名前のファイルが無い」となる。
- **修正**: worker 内で `actualFilenames` Map に実書込み名を記録、
  README 生成時に参照。

## 🟡 Medium (UX / race condition) 10件

### M2-1. `useModalA11y` — モーダル+ドロップダウンの Escape 二重発火
- Escape でモーダル内 CustomDropdown が閉じた後、window keydown で
  モーダル本体も閉じてしまう。**修正**: モーダルスタック導入 + 開いてる
  dropdown-portal 検出で Escape を消費。

### M2-2. `useModalA11y` — 初期フォーカスが「閉じるボタン」に飛ぶ
- Enter で誤って閉じる UX。**修正**: input/textarea/select を最優先、
  次に combobox/tabindex=0、最後に container 自身。

### M2-3. `DependencyCheckModal` — profile 変化で runCheck が
    毎回再発火 (無限API)
- **修正**: profile.id のみ deps、runCheckRef で常に最新関数。

### M2-4. `ConfirmDialog` の背景スクロールロック抜け
- isAnyModalOpen に含まれておらず、確認ダイアログ中でも背景スクロール可能。
- **修正**: `confirmDialogProps.isOpen` を isAnyModalOpen に加算。

### M2-5. `BottomNav` — `pb-safe` は未定義クラス
- iPhone のホームバー領域にコンテンツが被る。
- **修正**: `style={{paddingBottom: 'env(safe-area-inset-bottom)'}}`。

### M2-6. `Ref 更新の 1レンダー遅延 race`
- profilesRef 等を useEffect で更新 → setState 直後の非同期処理が
  古い ref を掴む可能性。
- **修正**: 全 Ref を render 中に同期代入に変更。

### M2-7. ID 衝突可能性
- `'profile-' + Date.now()` は高速連打で同一msでID衝突する。
- **修正**: `generateId(prefix)` ユーティリティ (crypto.randomUUID
  fallback with timestamp+random)。

### M2-8. `useProfiles.handleToggleMod` — 同一Modへの並列トグル
- 連打で toast 二重表示、fetch 二重発火。
- **修正**: `toggleInFlightRef: Set<string>` で同一 projectId の並列
  呼び出しを block。

### M2-9. `useProfiles.handleSaveEditedProfile` — MC/loader変更で
    既存 Mod のバージョン互換性警告なし
- **修正**: 変更検知で警告 toast「バージョン再選択を推奨」を追加。

### M2-10. `useModSearch` — 初期 isLoadingMods=false で「見つかりません」
    一瞬表示
- マウント直後 useEffect 発火前の 1フレームで空リスト UI。
- **修正**: 初期値 true にしてスケルトンを表示させる。

## 🟢 Low (品質改善) 6件

### L2-1. `useModSearch` — hits の重複 project_id
- race で古いページと重複する可能性、React key 衝突。
- **修正**: append / initial 両方で重複を除去。

### L2-2. `MarkdownRenderer` — 改行含む language- なしコードが inline 扱い
- **修正**: children に改行含む場合もブロック判定に。

### L2-3. `ModCard` — icon_url 変化時に iconFailed 引き継ぎ
- **修正**: useEffect で `[hit.icon_url]` 変化検知でリセット。

### L2-4. `useZipExport.handleCancelZip` — 完了直後の cancel toast 誤表示
- 完了→400ms 後にモーダル閉じの間に押されると toast 二重。
- **修正**: activeZipAbortRef を完了時にクリア、cancel は wasActive
  時のみ toast。

### L2-5. `ModsTab` — バージョン選択で「現在選択中」が options に無いと
    表示ずれ
- **修正**: `buildVersionOptions` で無い場合に「現在」ダミーを先頭挿入。

### L2-6. `useProfiles` — hydration ゲート + `LocalStorage.setItem` の
    Quota 例外を握りつぶし
- **修正**: try/catch で `console.warn`、アプリはクラッシュさせない。

---

## 📊 集計サマリ (第1波 + 第2波)

| 波 | Critical | High | Medium | Low | 計 |
|---|---|---|---|---|---|
| 第1波 | 4 | 7 | 11 | 10 | 32 |
| 第2波 | 4 | 8 | 10 | 6 | 28 |
| **合計** | **8** | **15** | **21** | **16** | **60** |

## 🎯 「真っ暗になる」の根本原因まとめ

1. **C2-1 (Hooks 違反)**: 最も直接的な原因。`ModDetailModal` で
   isOpen トグル時に「Rendered fewer hooks」エラー → React ツリー破壊
2. **C2-2 (GSAP タブ)**: onComplete 未発火や DOM 差替で opacity:0 残留
3. **H2-1 (profiles空)**: `currentProfile.mods.length` の TypeError
4. **H2-2 (ErrorBoundary無)**: 上記の任意が発生した際、フォールバックUI
   が無いため画面全体が消える (背景dark#090d14のみ = 真っ暗)

これら 4層防御を全て施したことで、単一障害点が消え、以後は同種の
「真っ暗」現象は理論上発生しない。

## 🎯 「Mod一覧が表示されない」の根本原因まとめ

1. **C2-3 (GSAP カード style 残留)**: opacity半端値でカードが薄く表示
2. **C2-4 (stale closure)**: 絞り込み変更が反映されず古い結果のまま
3. **H2-5 (誤エラー表示)**: API失敗時に「見つかりません」と誤表示
4. **H2-6 (sentinel未attach)**: タブ切替後の無限スクロール停止

これらも全て解決済み。
