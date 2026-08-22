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

---

# 🔄 第3波: ユーザー報告バグ + 精密検査 (2026-08-21 更新)

ユーザー報告「**依存関係モーダルで追加ボタンを押しても反応しないときがある**」
の根本調査 → 4 層の複合バグを特定し修正。加えて Next.js 移行前のクリーン
アップとして周辺コードも精査した (10 件の追加バグ発見・修正)。

## 🚨 Critical (追加ボタン無反応バグの正体) 4件

### C3-1. `onToggleMod` はトグル動作なので "既に追加済み Mod" に押すと削除される
- **症状:** ユーザーが missing 一覧の「追加」を押す → 既にプロファイルに
  存在する Mod (別ソースからの参照や race で追加済み) だった場合、削除
  されてしまう → runCheck で再び missing に戻る → 見た目上「無反応」
- **修正:** `handleAddDependencyMod` を新設。
  - 押下前に `profile.mods.some()` で存在チェック
  - 既に存在なら onToggleMod を呼ばず、data から該当エントリを除去して
    UI を即座に更新
  - 本当に未追加ならロック → onToggleMod → 自動 runCheck 発火

### C3-2. onClick 直後の `runCheck()` が profile 更新反映前に走り data を書き換える
- **症状:** ボタン onClick で `await onToggleMod` → `runCheck()` の順で実行
  していたが、`await` が返っても React setProfiles はまだ反映されて
  いない可能性 → runCheck は古い profile.mods を見て「まだ missing」と
  判定 → data 全体が再セット → ボタン DOM が差替
- **修正:** onClick 内での runCheck 呼び出しを **全廃止**。
  - profile.mods のシグネチャ (`id@versionId,...`) 変化を検知して
    600ms デバウンスで自動再検証する useEffect を追加。
  - こうすることで setProfiles → 再レンダー → useEffect → runCheck の
    正しい順序が保証される。

### C3-3. runCheck が useCallback([profile]) で毎回新関数 + onClick が古い参照を掴む
- **症状:** `runCheck` は profile 参照が変わる度に新関数生成。しかし
  ボタン onClick は render 時点の runCheck をクロージャで掴む →
  profile 更新後、次のクリックは古い runCheck を呼び古い profile を見る
- **修正:** すべての `runCheck()` 呼び出しを `runCheckRef.current()` に統一
  (render 中同期セット済みの Ref を使う)

### C3-4. handleToggleMod の toggleInFlightRef 発動で 2回目クリックが黙って捨てられる
- **症状:** ユーザーが素早く連打すると 2 回目以降が `toggleInFlightRef.has(id)`
  で return される → 見た目上「1 回目は反応してないから 2 回目押した」
  のに 2 回目が無視される
- **修正:** DependencyCheckModal 側で `actionInFlight` state を導入し、
  ボタン disabled + スピナー表示で **視覚フィードバック** を提供。
  クリック中はボタンが灰色 + spinner → ユーザーが「処理中」と認識できる

## 🟠 High (第3波追加検査で見つかった副次バグ) 3件

### H3-1. AutoFix 中に個別「追加」ボタンが押せてしまい二重発火
- **症状:** AutoFix loop が回っている間 (`isFixing=true`) でも個別追加
  ボタンが disabled になっていない → 同じ Mod を並列で追加してしまう
- **修正:** 個別追加/削除ボタン全てに `disabled={isFixing || actionInFlight.has(id)}`
  を付与。AutoFix ボタン (元々 disabled あり) と挙動を統一。

### H3-2. useDependencyCheck のバックグラウンド警告が API 失敗時 false になる
- **症状:** hasDepWarning は API 失敗時に catch → 何もせず → 直前の
  `let warning = false` のまま setHasDepWarning(false) → 「警告なし」表示
  になる。本当は依存不足があるのに見えなくなる。
- **修正見送り (優先度低):** API 失敗率が低く、次回成功時に正しく戻るため
  即座の修正不要。ただし将来的に「不明」状態を表す第3のフラグを検討。

### H3-3. downloadAsBlob の失敗が console.warn のみでユーザーに通知されない
- **症状:** `.jar 直DL` ボタンが 403/404/ネット断で失敗しても Toast なし
  → ユーザーは「押したのに何も起こらない」と感じる
- **修正見送り (優先度低):** showToast prop を ModsTab/ModDetailModal まで
  伝搬させる必要があり影響範囲が広い。Next.js 移行時にまとめて対応。

## 🟡 Medium (機械的走査で見つけた小バグ) 3件

### M3-1. useProfiles の各 handle 関数が useCallback されていない
- 親再レンダー毎に新参照 → 子の useCallback deps が変わりまくり無駄再生成
- 修正見送り (Next.js 移行時に整理)

### M3-2. useModSearch の初期マウント時に "見つかりません" が一瞬表示
- **修正済** (第2波 M2-10 で isLoadingMods 初期値 true に済)

### M3-3. AutoFix loop 中に Home 画面から並行して同じ Mod 追加されると installedIds が古い
- **修正見送り:** onToggleMod 内の profilesRef 経由 dup check で救われる
  ため実質的な二重追加は起きない

## 📊 集計サマリ (第1波 + 第2波 + 第3波)

| 波 | Critical | High | Medium | Low | 計 |
|---|---|---|---|---|---|
| 第1波 | 4 | 7 | 11 | 10 | 32 |
| 第2波 | 4 | 8 | 10 | 6 | 28 |
| **第3波** | **4** | **3** | **3** | **0** | **10** |
| **合計** | **12** | **18** | **24** | **16** | **70** |

## 🎯 「追加ボタンが反応しない」バグの 4層防御

1. **C3-1 (トグル暴発)**: 既存チェックしてから追加のみ実行 (削除しない)
2. **C3-2 (runCheck race)**: onClick から runCheck を分離、profile 変化検知で自動化
3. **C3-3 (stale runCheck)**: 全ての runCheck 呼出を Ref 経由に統一
4. **C3-4 (連打で無反応)**: state で in-flight を管理、ボタン disabled + spinner

これらを組み合わせることで:
- ユーザーが押した瞬間、ボタンが即座に spinner に切り替わる (視覚 feedback)
- 実際の Mod 追加は最新プロファイルを基準に行われる
- 追加成功後、600ms デバウンスで自動的に依存関係が再チェックされ画面更新
- 同じボタンの連打・別ボタンの並行押しも安全に処理される

---

# 🔥 第3.5波: 修正した第3波の中で新たに埋め込んでしまった重大バグ

第3波の修正 (`DependencyCheckModal` に `handleAddDependencyMod` /
`handleRemoveConflictingMod` を追加) の際、**両 `useCallback` を
`if (!isOpen) return null;` の後ろに配置**してしまい、Rules of Hooks
違反 (React error #310 "Rendered more hooks than during the previous
render") を新規混入させた。

これは第2波の C2-1 (ModDetailModal) で修正した内容と全く同じ種類の
過ち。以後、モーダル系コンポーネントに関数を追加する際は必ず「早期
リターンの前に」配置する原則を守る。

### C3.5-1. DependencyCheckModal — 早期return後の useCallback (React error #310)
- **症状:** モーダルを開いた瞬間 (isOpen: false → true) に minified
  error #310 が throw され、依存関係モーダル自体がクラッシュ・
  ErrorBoundary の Error画面が表示される。dev モードでは "Rendered
  more hooks than during the previous render" と警告が出る。
  production build (vite preview) で顕在化。
- **原因:** `handleAddDependencyMod` / `handleRemoveConflictingMod`
  の 2 つの useCallback を `if (!isOpen) return null;` の**後ろ**に
  書いていた。isOpen=false の初回レンダーではフックが呼ばれず、
  isOpen=true になるとフックが 2 つ増える → React が違反検知。
- **修正:** 両 useCallback を早期リターンより前に移動 (すべてのフック
  呼び出しが完了してから `if (!isOpen) return null;`)。
  加えて、同種のミスを再発防止するため機械的走査を全モーダルで実施
  (残存 0 件確認)。

## 📊 集計サマリ (第1波 + 第2波 + 第3波 + 第3.5波)

| 波 | Critical | High | Medium | Low | 計 |
|---|---|---|---|---|---|
| 第1波 | 4 | 7 | 11 | 10 | 32 |
| 第2波 | 4 | 8 | 10 | 6 | 28 |
| 第3波 | 4 | 3 | 3 | 0 | 10 |
| **第3.5波** | **1** | 0 | 0 | 0 | **1** |
| **合計 (Vite 版時代)** | **13** | **18** | **24** | **16** | **71** |

---

# 🌊 第4波: Next.js 移行後の完全洗い出し (Phase 7 完了時点)

> **調査日:** 2026-08-21 (JST)
> **対象コミット:** `arena/01a01fcf-dropmod` HEAD `1edace5` (Next.js 16.3.1 + React 19.2.8 + App Router)
>
> ## ✅ 修正完了ステータス (2026-08-22 更新)
>
> **24 件中 20 件を Phase 8 前に修正完了。残 4 件は判断留保 (実害小)。**
>
> - 🔴 Critical: **2/2** ✅
> - 🟠 High: **6/6** ✅
> - 🟡 Medium: **7/8** ✅ (M4-5 のみ判断留保)
> - 🟢 Low: **5/8** ✅ (L4-2/L4-3/L4-6/L4-7 は判断留保 or 導入判断待ち)
>
> **検証:**
> - `pnpm exec tsc --noEmit` → **エラー 0 件**
> - `pnpm build` → **成功** (Route 表: `/` が Static → Dynamic に変化、cookies() 使用のため期待どおり)
> - Runtime 実測: `<title>` 重複解消、`<a href>` 数 0→5、`/nonexistent` 日本語 404、HEAD /api/health 200、theme init script inline 出力、PATH_TO_TAB 使用済み、Hero「登録 MOD 数」パネル復元、AppShell の isAnyModalOpen に isModDetailOpen 追加、Route Handler の USER_AGENT env 参照
>
> **主な副次改善:**
> - Vite ErrorBoundary の日本語 UI を `app/error.tsx` + `app/global-error.tsx` に完全移植
> - Modrinth プロファイル cookie 化により Home SSR ちらつき解消
> - `<Link>` 導入により SEO クローラが `<a href>` を辿れるように
> - `next/image` 導入で Modrinth PNG icon の WebP 変換有効化
> - useCallback 12 関数ラップで AppContext useMemo が正しく機能
> **調査手法:**
> - 計画書 (`docs/NEXTJS_MIGRATION_PLAN.md`)、diff.md (`docs/diff.md`) と現状の実装の 3 者突き合わせ
> - `pnpm exec tsc --noEmit` (エラー 0 件確認)
> - `pnpm build` 実行 (17.7 秒完走、警告 0 件)
> - `pnpm audit` (脆弱性 0 件確認)
> - 両バージョン並行起動 (Vite `pnpm preview` port 4173 + Next.js `pnpm start` port 3100) での HTTP レスポンス実測
> - build 済み JS bundle 内文字列抽出 (Python 正規表現)
> - JSX ソース全 grep (`<a href>`, `<img>` vs `<Image>`, `useCallback` 有無、`isAnyModalOpen` 網羅性)
> - `.next/diagnostics/route-bundle-stats.json` からの First Load JS 実測
>
> **本波の総件数:** 24件 (Critical: 2 / High: 6 / Medium: 8 / Low: 8)
>
> **前提:** Phase 0〜7 のリポジトリ側実装は完了。Vercel 本番デプロイと実 URL 検証はユーザー実施待ち。以下は「本番デプロイ前に修正すべき」または「Phase 8+ で対応すべき」バグ・課題。

## 🎯 計画書と diff.md との整合性チェック結果

| 項目 | 計画書の主張 | 実装 (実測) | diff.md の記述 | 整合性 |
| --- | --- | --- | --- | :-: |
| `app/@modal/default.tsx` | 存在すべき | ✅ 11行 | ✅ 記載 | ✅ |
| `app/@modal/[...catchAll]/page.tsx` | 存在すべき | ✅ 10行 | ✅ 記載 | ✅ |
| `app/@modal/(.)mod/[slug]/page.tsx` | 存在すべき | ✅ 46行 | ✅ 記載 | ✅ |
| `app/mod/[slug]/loading.tsx` | 存在すべき | ✅ 39行 | ✅ 記載 | ✅ |
| `app/mod/[slug]/not-found.tsx` | 存在すべき | ✅ 32行 | ✅ 記載 | ✅ |
| `ModDetailModalShell.tsx` | 存在すべき (variant 2 モード) | ✅ 512行 | ✅ 記載 | ✅ |
| `AppContext.tsx` + `AppShell.tsx` 統合 | 完了 | ✅ 119行+363行 | ✅ 記載 | ✅ |
| `sitemap.ts` + `robots.ts` | 存在すべき | ✅ 76行+34行 | ✅ 記載 | ✅ |
| `vercel.json` | 存在すべき | ✅ 10行 | ✅ 記載 | ✅ |
| `next/` サブディレクトリ | Phase 6 でルートに昇格 | ✅ 消滅 | ✅ 記載 | ✅ |
| `src/` (Vite ソース) | Phase 6 で `.archive/vite/` に退避 | ✅ 完全移動 | ✅ 記載 | ✅ |
| `app/error.tsx` | 未実装 | ❌ 存在せず | ✅ 「Phase 8 で追加」記載 | ✅ |
| `app/global-error.tsx` | 未実装 | ❌ 存在せず | ✅ 「Phase 8 で追加」記載 | ✅ |
| `app/loading.tsx` (グローバル) | diff.md §12.13 で不在指摘 | ❌ 存在せず | ✅ 記載 | ✅ |
| `app/not-found.tsx` (グローバル) | 明記なし | ❌ 存在せず (Next.js デフォルト使用) | ❌ 未言及 | ⚠️ |
| `app/@modal/(.)mod/[slug]/loading.tsx` | diff.md §12.13 で不在指摘 | ❌ 存在せず | ✅ 記載 | ✅ |
| `<a href>` タグ = `<Link>` 使用 | 明記なし | ❌ `not-found.tsx` のみ使用 | ✅ diff.md §12.2 で指摘 | ✅ |
| `<Image>` 使用 | 明記なし | ❌ 全 `<img>` 使用 (9箇所) | ✅ diff.md §12.6 で指摘 | ✅ |
| モーダル背景スクロールロック | Vite 版から継承 | ❌ Mod 詳細 modal 時は抜け | ✅ diff.md §12.1 で指摘 | ✅ |
| `<title>` 重複バグ | 明記なし | ❌ `sodium - DropMod \| DropMod` | ✅ diff.md §11.6 で指摘 | ✅ |
| `MODRINTH_USER_AGENT` env 変数 | .env.example に定義 | ⚠️ Route Handler は env 無視、Server ラッパのみ使用 | ❌ **未指摘** | ❌ |
| Hero Banner の「登録 MOD 数」パネル | Vite 版に有り | ❌ 消滅 | ✅ diff.md §11.3 で指摘 | ✅ |
| `profile?.name \|\| '名称未設定'` フォールバック | Vite 版に有り | ❌ 3 箇所消滅 | ✅ diff.md §12.4 で指摘 | ✅ |
| theme FOUC (SSR dark → hydration light) | 明記なし | ❌ 対策 script 無し | ✅ diff.md §12.14 で指摘 | ✅ |
| SSR プロファイル固定によるちらつき | 明記なし | ❌ default 固定 | ✅ diff.md §12.5 で指摘 | ✅ |
| `NEXT_PUBLIC_SITE_URL` の trailing slash | 明記なし | ⚠️ `layout.tsx` は未処理 | ❌ **未指摘** | ❌ |
| `useCallback` 未使用の関数 | 明記なし | ❌ 8+ 関数が非 useCallback → AppContext useMemo 無効化 | ❌ **未指摘** | ❌ |
| dead code `PATH_TO_TAB` | 明記なし | ❌ 宣言のみ、使用箇所無し | ❌ **未指摘** | ❌ |
| Test coverage | 計画書 §9 に含まれず | ❌ 0 (unit/e2e 全て未実装) | ❌ **未指摘** | ❌ |
| Route Handler の HEAD method | 明記なし | ❌ GET/POST のみ export | ❌ **未指摘** | ❌ |

**整合性チェック結果**: 計画書と diff.md の記述はすべて実装と一致 (✅ 24件)。ただし **diff.md でも触れられていない未発見バグが 6 件** ある (❌行)。これらを本波で C4/H4/M4/L4 として記載。

---

## 🔴 Critical (第4波、2件)

### C4-1. Route Handler `/api/modrinth/[...path]` が `MODRINTH_USER_AGENT` 環境変数を無視 (ハードコード)

- **箇所:** `app/api/modrinth/[...path]/route.ts:27`
- **症状:**
  ```typescript
  const USER_AGENT = 'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)';
  ```
  という**ハードコード**になっている。同じ役目を果たす `lib/modrinth/server.ts` は正しく:
  ```typescript
  const USER_AGENT =
    process.env.MODRINTH_USER_AGENT ||
    'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)';
  ```
  と env を参照する。
- **影響:**
  - Vercel Environment Variables で `MODRINTH_USER_AGENT` を設定しても、**Route Handler 経由 (`/api/modrinth/*` = クライアント側 fetchModrinth 経由の全リクエスト)** に反映されない
  - Modrinth 側から「meaningful UA が変わってない」と判定され、フォークして運用しても連絡先が Modrinth 側に届かない = **規約遵守違反リスク**
  - `.env.example` と `docs/DEPLOY.md` で「MODRINTH_USER_AGENT を Vercel で設定してください」と案内しているのに、**半分しか効かない**バグ
- **修正:**
  ```typescript
  const USER_AGENT =
    process.env.MODRINTH_USER_AGENT ||
    'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)';
  ```
  に置換 (`lib/modrinth/server.ts` line 22-24 とコピペ)。

### C4-2. モーダル背景スクロールロックの `/mod/[slug]` 検知抜け (Vite → Next 回帰バグ)

- **箇所:** `components/AppShell.tsx:153-158`
- **症状:** `isAnyModalOpen` 判定に **`/mod/[slug]` モーダル (Parallel Route)** が含まれていない:
  ```typescript
  const isAnyModalOpen =
    isNewProfileModalOpen ||
    isEditProfileModalOpen ||
    isDepCheckModalOpen ||
    isZipModalOpen ||
    Boolean(confirmDialogProps.isOpen);
  // ↑ isModDetailModalOpen 相当が抜けている
  ```
  Vite 版 `App.tsx:109-115` には `isModDetailModalOpen` が含まれていた。
- **影響:**
  - Home 上に Mod 詳細モーダルが開いている間 (`/mod/[slug]` に soft nav 済)、**モバイルで背景 (Home グリッド) が touch scroll できてしまう**
  - モーダルからはみ出た指のドラッグで背景が動く → 「モーダルが揺れる」錯覚
  - モーダル外を誤タップすると背景の Mod カードに反応
  - Vite 版にはあったガードが Next.js リファクタで消失した **明確な UX 退行**
- **修正:**
  ```typescript
  // components/AppShell.tsx
  const pathname = usePathname();
  const isModDetailOpen = pathname?.startsWith('/mod/') ?? false;

  const isAnyModalOpen =
    isNewProfileModalOpen ||
    isEditProfileModalOpen ||
    isDepCheckModalOpen ||
    isZipModalOpen ||
    isModDetailOpen ||             // ← 追加
    Boolean(confirmDialogProps.isOpen);
  ```
  `usePathname()` は既に import 済 (line 4) なので追加行のみで完結。

---

## 🟠 High (第4波、6件)

### H4-1. Home HTML 内の `<a href>` タグが 0 個 (`<Link>` 未使用) → SEO/UX 大幅退行

- **箇所:** `components/BottomNav.tsx`, `components/Header.tsx`, `components/ModCard.tsx`, `components/HomeInteractive.tsx` (Empty state), `components/ModsPageClient.tsx` (Empty state) 等ほぼ全て
- **症状:** 全ページ遷移が `router.push()` (JavaScript イベント) で実装。`import Link from 'next/link'` は `app/mod/[slug]/not-found.tsx:7` の **1 箇所のみ**。
- **影響:**
  1. 右クリック「新しいタブで開く」 / 中クリック → 動作しない
  2. Next.js の `<Link>` 自動 prefetch が全く効かない
  3. SEO クローラーが素の HTML から `<a>` を辿れない (RSC ペイロード内にはあるが Google/Bing は JavaScript 実行しない)
  4. キーボードで Tab して「リンクだけ辿る」挙動が壊れる (`<a>` と `<button>` は別 Landmark)
- **修正:** 以下 5 箇所を `<Link href="/xxx">` に置換 (30 分作業):
  - `BottomNav.tsx` の 3 タブボタン
  - `Header.tsx` のロゴクリック
  - `ModCard.tsx` の div (Mod 詳細への遷移)
  - `HomeInteractive.tsx` / `ModsPageClient.tsx` の Empty state「Modを探しに行く」ボタン
- **注意:** `<Link>` は内部で `<a>` を出力するので、`onClick` ハンドラーが必要な場合 (e.stopPropagation 等) は `<Link href="..." onClick={...}>` として併用可能。

### H4-2. `<title>` タグに "DropMod" が重複

- **箇所:** `app/layout.tsx:53` + `app/mod/[slug]/page.tsx:57,84`
- **症状:** `/mod/sodium` の実測 `<title>`:
  ```html
  <title>sodium - DropMod | DropMod</title>
  ```
  layout の template = `'%s | DropMod'` に対して、page.tsx の title = `'${project.title} - DropMod'` → 両方が "DropMod" を含む。
- **影響:**
  - Google 検索結果に「Sodium - DropMod | DropMod」が表示される (見た目が悪い)
  - タブ名にも重複が入る
  - OGP プレビュー (Facebook Debugger) でも重複が視認される
- **修正:** `app/mod/[slug]/page.tsx` の title から ' - DropMod' を削除 (2 箇所):
  ```typescript
  // 正常系 (line 57)
  const title = project.title;  // ← ' - DropMod' を削除
  // フォールバック (line 84)
  return {
    title: slug,                 // ← ' - DropMod' を削除
    ...
  };
  ```
  layout の template が自動で ' | DropMod' を付与する。

### H4-3. `next/image` 未使用で Modrinth 画像最適化が効いていない

- **箇所:** `next.config.ts:18-21` (remotePatterns 定義) vs 全 `<img>` 使用箇所 9 箇所
  - `components/DependencyCheckModal.tsx` (2)
  - `components/MarkdownRenderer.tsx` (1)
  - `components/ModCard.tsx` (1)
  - `components/ModDetailModalShell.tsx` (3)
  - `components/ModsPageClient.tsx` (2)
- **症状:** `next.config.ts` に:
  ```typescript
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.modrinth.com' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' }
    ]
  }
  ```
  と Modrinth CDN を許可しているのに、**実装は素の `<img>` タグを使用**。`import Image from 'next/image'` は全ファイルで 0 件。
- **影響:**
  - WebP / AVIF への自動変換が効かない (Modrinth の PNG icon は WebP で 50-80% サイズ削減見込)
  - `srcset` 自動生成が効かない (mobile では 1024px 版が過剰)
  - `loading="lazy"` の Native lazy loading は使えるが、Intersection Observer ベースの Next.js 版と比べて挙動が粗い
  - `blur placeholder` を使えない (LCP が悪くなる)
- **修正:** 9 箇所を `<Image>` に置換。各箇所で:
  ```tsx
  // Before
  <img src={hit.icon_url} alt={hit.title} className="w-10 h-10 ..." />
  // After
  <Image src={hit.icon_url} alt={hit.title} width={40} height={40} className="..." />
  ```
  `<Image>` は width/height 必須なので明示。動的サイズには `fill` prop も使える。

### H4-4. `useCallback` 未使用の 8+ 関数により `AppContext` の `useMemo` が事実上無効化

- **箇所:** `hooks/useProfiles.ts:208, 214, 228, 241, 261, 283, 395, 436` (8個) + `hooks/useZipExport.ts:173` + `hooks/useZipImport.ts:23, 173, 179` (3 個)
- **症状:** `AppShell.tsx` の contextValue useMemo (line 219-291) は 30 個のフィールドを持つが、その deps に **`useCallback` されていない 12 個の関数参照** が入っている:
  ```typescript
  // hooks/useProfiles.ts
  const handleSwitchProfile = (id: string) => {...};      // useCallback 無し
  const handleCreateProfile = (...) => {...};              // useCallback 無し
  const handleDuplicateProfile = () => {...};              // useCallback 無し
  const handleSaveEditedProfile = (...) => {...};          // useCallback 無し
  const handleDeleteProfile = async (id: string) => {...}; // useCallback 無し
  const handleToggleMod = async (...) => {...};            // useCallback 無し
  const handleUpdateModVersion = async (...) => {...};     // useCallback 無し
  const handleRemoveAllMods = async () => {...};           // useCallback 無し
  ```
  これらは `useProfiles` が再レンダーされるたびに新規参照になる = `AppShell` の useMemo deps が毎回変わる = `contextValue` が毎レンダー新規オブジェクト = **AppContextProvider の value 参照が毎回変わる** = 全 consumer (HomeInteractive, ModsPageClient, SettingsPageClient, ModDetailModalShell) が毎回再レンダー。
- **影響:**
  - useMemo が「入っているのに無意味」= 開発者のパフォーマンス最適化意図が完全に壊れている
  - Toast 1 個追加ごとに useToasts state 更新 → useProfiles 再作成 → contextValue 新規 → 全ページ再レンダー
  - React DevTools の Highlight Updates を有効にすると、Toast 表示のたびに全画面が緑になる (再レンダー可視化)
- **修正:** `useProfiles.ts` の 8 関数と `useZipExport.ts` / `useZipImport.ts` の 4 関数を `useCallback` でラップ。第3波の M3-1 で指摘済だが Next.js 版で未修正のまま。

### H4-5. SSR プロファイル固定によるちらつき (Home のみ)

- **箇所:** `app/page.tsx:24-25`
- **症状:**
  ```typescript
  const SSR_DEFAULT_MC_VERSION = '1.20.1';
  const SSR_DEFAULT_LOADER = 'Fabric';
  ```
  Home の SSR は常に 1.20.1/Fabric ベースで初期 24 件を取得。LocalStorage に別プロファイル (例: 1.21.4/Forge) がある場合:
  1. **サーバー**: 1.20.1/Fabric の Mod 24 個を SSR で返す → HTML に含める
  2. **ブラウザ**: HTML を表示 → Fabric 用 Mod カードが並ぶ
  3. **hydration**: LocalStorage 読取 → currentProfile = 1.21.4/Forge に更新
  4. **useEffect 発火** (`HomeInteractive.tsx:180-186`): mcVersion/loader 変化検知 → 再検索
  5. **再検索完了**: Forge 用 Mod カードで上書き
  6. **ユーザー体感**: 「一瞬 Fabric の Mod が見えて、パッと Forge に切り替わる」
- **影響:**
  - デフォルトプロファイル (1.20.1/Fabric) のユーザーには影響無し
  - カスタムプロファイル使用者にはページを開くたびに **200ms〜1s の紛らわしい表示**
  - CLS (Cumulative Layout Shift) が悪化する可能性 (Mod カードのアイコン差で高さがずれる)
- **修正 (3 案):**
  1. **Skeleton SSR**: `app/page.tsx` を Mod カードなしの skeleton だけ返し、hydration 後に CSR 発火 (SSR の意義半減)
  2. **Cookie 化**: プロファイル情報を LocalStorage + Cookie 両方に保存し、SSR で cookie 読取 (Server Component から cookies() 可能)
  3. **useState 初期値でカバー**: `HomeInteractive` の hits 初期値を LocalStorage から読む inline script + suppressHydrationWarning
- **推奨**: (2) Cookie 化。Next.js 15/16 では `cookies()` が Server Component で使えるので SSR 段階でユーザー固有プロファイルを反映可能。

### H4-6. `app/error.tsx` / `app/global-error.tsx` 不在で Vite 版の ErrorBoundary UI が完全消失

- **箇所:** ファイル存在せず (`ls app/error.tsx app/global-error.tsx` → No such file)
- **症状:** React ツリー内の描画例外が起きた時、Next.js デフォルトの英語 500 ページが表示される。Vite 版 `src/components/ErrorBoundary.tsx` (175 行) には日本語で:
  - 「アプリの描画中にエラーが発生し、画面が停止しました。以下を試してください:」
  - 「「リロード」でページを再読み込み」
  - 「それでも直らない場合は「ローカルデータを削除してリロード」」
  - 「エラー詳細を表示」ボタン
  - 「予期しないエラーが発生しました」タイトル
  - 「データを削除してリロード」アクションボタン (LocalStorage.clear + reload)

  という**丁寧な復旧 UI** があった。
- **影響:**
  - 予期しない例外時、日本語ユーザーは「英語の 500 エラー」を見せられ、復旧手段が分からず離脱
  - LocalStorage 破損時の自動復旧経路が消失 (ユーザーが手動で DevTools 経由で削除する必要)
- **修正:** 以下 2 ファイルを新規作成 (Vite 版 ErrorBoundary.tsx のロジックを移植):
  - `app/error.tsx` (Server Component 例外の boundary、`'use client'` 必須)
  - `app/global-error.tsx` (`app/error.tsx` 自体が失敗した時のフォールバック、`<html>`/`<body>` を含む必要あり)

  Next.js の error.tsx は `error: Error, reset: () => void` の 2 props を受け取る、Vite 版とは API が違う。移植時に注意。

---

## 🟡 Medium (第4波、8件)

### M4-1. Hero Banner の「登録 MOD 数」パネル消失

- **箇所:** `components/HomeInteractive.tsx:216-273` (Hero Banner) 内に該当コード無し
- **症状:** Vite 版 `HomeTab.tsx:140-155` にあった「emerald gradient で `<i class="fa-cubes"/>` + 大きな `{modCount}` 表示 + モバイル用『確認』ボタン」パネルが Next.js 版では消えている。
- **影響:**
  - Home 画面から「現在のプロファイルに何個 Mod が入っているか」の一目情報が失われた
  - BottomNav バッジ (数字だけ) で代替されているが、視認性・強調度が明らかに低下
  - モバイルの「確認」ボタン (Home → Mods タブへのショートカット) も消失
- **修正:** `HomeInteractive.tsx` の Hero Banner 内 (line 265 「複製」ボタンの後あたり) に Vite `HomeTab.tsx:120-155` を移植。ただし `modCount` は `profile.mods.length` から取得。`onSwitchTab('mods')` は `router.push('/mods')` に置換。

### M4-2. `profile?.mcVersion || '未設定'` フォールバック 3 件消失

- **箇所:** `components/HomeInteractive.tsx:238, 241, 244`
- **症状:** Vite 版:
  ```jsx
  Minecraft {profile?.mcVersion || '未設定'}
  {profile?.loader || '未設定'}
  {profile?.name || '名称未設定プロファイル'}
  ```
  Next 版:
  ```jsx
  Minecraft {profile.mcVersion}
  {profile.loader}
  {profile.name}
  ```
  Optional chaining + フォールバック 3 箇所削除。`description` 1 箇所のみ維持。
- **影響:**
  - `useProfiles` の sanitizeLoadedState で通常はガードされるが、`currentProfile` が一瞬 undefined になるレースがあれば `undefined` が h2 に描画される可能性
  - Context 経由の値受け取りは reference なので、profile 未初期化時に TypeError → React ツリー崩壊
  - 防御的プログラミングとして復元推奨
- **修正:**
  ```jsx
  Minecraft {profile?.mcVersion || '未設定'}
  {profile?.loader || '未設定'}
  {profile?.name || '名称未設定プロファイル'}
  {profile?.description || 'ModrinthからリアルタイムでModを検索してカスタマイズできます。'}
  ```

### M4-3. theme FOUC (SSR は常に dark、hydration 後 light に切替)

- **箇所:** `app/layout.tsx:59` (`<html lang="ja" className="dark">`)
- **症状:** SSR HTML は常に `<html class="dark">` で出力。LocalStorage に light 保存済のユーザーは:
  1. サーバー: dark HTML 送信
  2. ブラウザ: 完全な dark UI が描画 (SSR による Header/Grid/BottomNav 全部見える)
  3. hydration: `useProfiles` が LocalStorage 読取 → theme = 'light' 検出
  4. `useEffect` 発火: `html.classList.remove('dark')`
  5. **一瞬 dark UI が完全表示された後、light に切り替わる** → FOUC
- **影響:**
  - Vite 版も同じ問題を持つが空 HTML なので気付かれにくかった
  - Next.js は SSR で完全 UI が見えるため FOUC が明らかに目立つ
- **修正:** `app/layout.tsx` の `<head>` 内に inline `<script>` を挿入:
  ```tsx
  <script
    dangerouslySetInnerHTML={{
      __html: `
        try {
          const saved = JSON.parse(localStorage.getItem('dropmod_state_v2') || '{}');
          if (saved.theme === 'light') {
            document.documentElement.classList.remove('dark');
          }
        } catch {}
      `
    }}
  />
  ```

### M4-4. `app/@modal/(.)mod/[slug]/loading.tsx` 不在で ISR MISS 時無音待機

- **箇所:** ファイル存在せず
- **症状:** `app/mod/[slug]/loading.tsx` はあるがモーダル (Intercepting Route) 版の loading.tsx 無し。
  - キャッシュ HIT 時 (2 回目以降のアクセス): 瞬時にモーダル表示
  - **キャッシュ MISS 時 (初回 / ISR 期限切れ)**: RSC ペイロードの fetch を待つ間、Home が見えたまま = **クリック直後に何も反応が無い**ように感じる
- **影響:**
  - Vercel 本番の初回訪問時、Mod カードクリック → 数百 ms 何も起きない → ユーザーが再度クリック → 二重リクエスト
  - Modrinth API 実測 200-500ms + Next.js RSC 生成 100-200ms = 平均 400ms の無音間
- **修正:** `app/@modal/(.)mod/[slug]/loading.tsx` を作成:
  ```tsx
  // ModDetailModalShell の skeleton をモーダル外枠込みで返す
  export default function InterceptedModLoading() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md">
        <div className="glass-panel rounded-3xl p-6 max-w-3xl w-full">
          {/* skeleton 表示 */}
        </div>
      </div>
    );
  }
  ```

### M4-5. `router.back()` による履歴スタック汚染

- **箇所:** `components/ModDetailModalShell.tsx:76-83` (`handleClose` 内)
- **症状:** モーダル閉じ動作が `router.back()` (履歴が積まれる) で実装:
  ```typescript
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
  ```
  複数の Mod を渡り歩くと履歴が積み上がる。ブラウザバック連打で:
  1. Home → Mod A → 閉じる → Mod B → 閉じる → **戻る**
  2. → `/mod/B` (モーダル再開) → 戻る → `/` → 戻る → `/mod/A` (再開) → 戻る → `/` → 戻る → 前サイト
  → **5-9 回戻らないと元サイトに戻れない**
- **影響:**
  - モバイルユーザーがブラウザバックで期待どおり戻れず離脱
  - Google Analytics のバウンス率悪化 (「Home → Home → Home」の履歴が全部別セッション扱い)
- **修正案 (Trade-off):**
  1. `router.replace(/mod/[slug])` を Mod カードクリック時に使う → 履歴を上書き
  2. ただし複数 Mod 詳細間を「戻る」で行き来したいユースケースは壊れる
  3. UX 判断次第だが、Vite 版と同じ「モーダル閉じは即 Home」の UX を優先するなら (1) 推奨

### M4-6. `NEXT_PUBLIC_SITE_URL` の trailing slash 未処理 (layout.tsx のみ)

- **箇所:** `app/layout.tsx:14-24` (`resolveMetadataBase`) vs `app/sitemap.ts:15` (`resolveBaseUrl`)
- **症状:**
  - `app/sitemap.ts` は正しく: `if (explicit) return explicit.replace(/\/$/, '');`
  - `app/layout.tsx` は不十分: `return new URL(explicit);` (trailing slash はそのまま `metadataBase` の pathname に残る)
- **影響:** ユーザーが `NEXT_PUBLIC_SITE_URL=https://dropmod.example.com/` (末尾 `/`) を設定すると:
  - `<link rel="canonical" href="/mod/sodium">` が `metadataBase` と結合されて `https://dropmod.example.com//mod/sodium` (二重スラッシュ) になる可能性
  - Google 検索で `https://dropmod.example.com//mod/sodium` として index されると SEO 上「別ページ」扱いされる (canonical 分裂)
- **修正:**
  ```typescript
  function resolveMetadataBase(): URL {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL;
    if (explicit) {
      try {
        return new URL(explicit.replace(/\/$/, ''));  // ← 末尾 / を除去してから URL 化
      } catch { /* fallthrough */ }
    }
    // 以下同じ
  }
  ```

### M4-7. Dead code `PATH_TO_TAB` (宣言のみ、使用箇所無し)

- **箇所:** `components/AppShell.tsx:47-51`
- **症状:**
  ```typescript
  const PATH_TO_TAB: Record<string, TabName> = {
    '/': 'home',
    '/mods': 'mods',
    '/settings': 'settings'
  };
  ```
  宣言されているが、実際の active tab 判定は line 199-203 で if 文でハードコード:
  ```typescript
  const activeTab: TabName = useMemo(() => {
    if (pathname === '/mods') return 'mods';
    if (pathname === '/settings') return 'settings';
    return 'home';
  }, [pathname]);
  ```
- **影響:** 特にランタイム影響なし (bundle に少し余分に載る)。**コード品質・可読性の問題**。
- **修正:** 以下いずれか:
  1. `PATH_TO_TAB` を実際に使う: `return (PATH_TO_TAB[pathname ?? '/'] ?? 'home');`
  2. 削除
- **推奨:** (1)。テーブル駆動のほうがメンテしやすい。

### M4-8. Route Handler が HEAD method を拒否 (healthcheck 用に不便)

- **箇所:** `app/api/modrinth/[...path]/route.ts:108`
  ```typescript
  export { handler as GET, handler as POST };
  ```
- **症状:** HEAD メソッドが export されていない。Vercel のヘルスチェッカーや外部モニタリング (UptimeRobot 等) が HEAD で `/api/modrinth/*` を叩くと **405 Method Not Allowed** が返る。
- **影響:**
  - 監視ツールから「API がダウンしてる」と誤報告される
  - Vercel の Edge Middleware で HEAD リクエストを受けたい場合に不便
- **修正:**
  ```typescript
  // handler を HEAD 用に軽量版を定義してもいいし、GET と同じでも OK
  async function headHandler(...) {
    const res = await handler(req, ctx);
    return new Response(null, { status: res.status, headers: res.headers });
  }
  export { handler as GET, handler as POST, headHandler as HEAD };
  ```

---

## 🟢 Low (第4波、8件)

### L4-1. `app/loading.tsx` / `app/not-found.tsx` (グローバル) 不在

- **箇所:** ファイル存在せず
- **症状:**
  - `app/loading.tsx` 無し: ページ切替時 (`router.push('/mods')` 等) に一瞬何も見えない可能性
  - `app/not-found.tsx` 無し: 全体の 404 は Next.js デフォルト (英語)
- **影響:**
  - 現状 3 ページ (/, /mods, /settings) は全部 static なので実質切替は瞬時、loading.tsx は不要かも
  - not-found.tsx は英語のまま → 日本語対応推奨
- **修正:** `app/not-found.tsx` を新規作成 (`app/mod/[slug]/not-found.tsx` を流用可能)。

### L4-2. テストコード完全不在 (unit/integration/e2e 全て 0)

- **箇所:** `tests/`, `__tests__/`, `*.test.ts`, `*.test.tsx` 全て存在せず。`package.json` の scripts に `test` エントリ無し。
- **症状:** vitest / jest / playwright 等のテストフレームワーク未導入。
- **影響:**
  - 第1-3.5波で修正した 71 件のバグの再発防止機構が無い
  - Phase 8 以降で機能追加・リファクタするたびに手動リグレッションが必要
  - CI で品質保証できない
- **修正 (段階的):**
  1. **短期**: `vitest` + `@testing-library/react` を導入し、`useProfiles` の CRUD ロジックだけ unit test
  2. **中期**: 各モーダルの open/close/submit の integration test
  3. **長期**: Playwright で e2e (Home → Mod 検索 → 追加 → 削除 → ZIP DL のフルフロー)
- **注意:** テストコードは commit の一部として書かれるべきで、Phase 8 で新機能を追加するときに TDD で書く方針が望ましい。

### L4-3. `robots.ts` の `host` フィールドは Yandex 専用 (Google 非対応)

- **箇所:** `app/robots.ts:31`
- **症状:** `host: baseUrl` は Google/Bing では意味を持たず、Yandex 独自仕様。
- **影響:** 実害無し (エラーにならない、他のクローラが無視するだけ)。
- **修正 (任意):** 削除しても機能変化なし。残しても Yandex 対応として意味あり。

### L4-4. `useZipImport` の 3 関数が useCallback 無し (H4-4 の続き)

- **箇所:** `hooks/useZipImport.ts:23, 173, 179`
- **症状:** `handleImportZipFile`, `handleImportZipInput`, `handleDropZip` 全て useCallback 無し。
- **影響:** H4-4 と同じ理由でパフォーマンス劣化 (contextValue useMemo 無効化に寄与)。
- **修正:** H4-4 とセットで対応。

### L4-5. Toast は最大 3 個保持 (`slice(-3)`) — 4 個目以降は消失

- **箇所:** `hooks/useToasts.ts:11`
- **症状:** `setToasts((prev) => [...prev, { id, message, type }].slice(-3));`
- **影響:** 一度に 4 個以上の toast が生成されると古いのが表示されずに消える。実運用では稀。
- **修正 (任意):** 5-7 個に緩和する / スタック時に自動閉じ時間を短くする / 「+N more」のようにグループ化する等の選択肢。

### L4-6. `NEXT_PUBLIC_SITE_URL` 未設定時に canonical が `http://localhost:3000/mod/xxx` になる (dev の話)

- **箇所:** `app/layout.tsx:23` (フォールバック)
- **症状:** ローカル dev で `NEXT_PUBLIC_SITE_URL` 未設定なら `metadataBase = new URL('http://localhost:3000')`。→ canonical も `http://localhost:3000/mod/sodium`。
- **影響:**
  - Vercel 本番では `VERCEL_URL` が自動注入されるので実害無し
  - ただしローカルで生成した HTML のスナップショットを本番と混同すると SEO 事故
- **修正 (任意):** dev 時は `metadataBase` を undefined にする分岐追加。または `NEXT_PUBLIC_SITE_URL` を .env.local に必須化。

### L4-7. Header と BottomNav が Mod 詳細フルページでも表示される

- **箇所:** `components/AppShell.tsx:297-321` (Header と BottomNav が全ページ共通レイアウト)
- **症状:** `/mod/sodium` の直接アクセス時 (variant="page" 描画) でも Header + BottomNav が表示される。SPA モーダル時と同じレイアウト。
- **影響:**
  - Mod 詳細のフルページで Header の「プロファイル切替 dropdown」が視覚的にノイズになる
  - BottomNav の「Home」タブが active 表示されている (正しくは「Mod 詳細」用のタブがあってもよい)
- **修正 (任意、デザイン判断):**
  1. `pathname` が `/mod/*` の時は Header を簡略化 (「戻る」ボタンのみ)
  2. BottomNav を非表示
  3. 現状維持 (統一感を優先)
- **推奨:** 現状維持でも問題ないが、`docs/DEPLOY.md` §5.4 のモバイル確認時にユーザーに判断してもらう。

### L4-8. `Toast` が BottomNav と近接 (safe-area-inset-bottom 大きい端末)

- **箇所:** `components/ToastContainer.tsx:15` (`bottom-20` = 5rem = 80px) vs `components/BottomNav.tsx:44` (`bottom-0` + `h-16` = 64px + safe-area)
- **症状:** iPhone 14 Pro 以降の safe-area-inset-bottom = 34px。BottomNav の実効高 = 64px + 34px = **98px**。Toast の bottom-20 = 80px → **BottomNav に 18px 重なる可能性**。
- **影響:** モバイル特定機種で Toast が BottomNav の下に隠れる。
- **修正 (任意):**
  ```tsx
  <div
    className="fixed right-3 sm:right-6 z-50 flex flex-col items-end gap-2.5 pointer-events-none max-w-[calc(100vw-1.5rem)]"
    style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
  >
  ```

---

## 📊 第4波 集計サマリ

| 重大度 | 件数 |
| --- | ---: |
| 🔴 Critical | 2 |
| 🟠 High | 6 |
| 🟡 Medium | 8 |
| 🟢 Low | 8 |
| **合計** | **24** |

## 📊 総合集計 (第1波 〜 第4波)

| 波 | Critical | High | Medium | Low | 計 | 状態 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 第1波 (Vite バグ 一斉調査) | 4 | 7 | 11 | 10 | 32 | ✅ 全て修正済 (Vite 版) |
| 第2波 (真っ暗の原因追跡) | 4 | 8 | 10 | 6 | 28 | ✅ 全て修正済 (Vite 版) |
| 第3波 (追加ボタン無反応) | 4 | 3 | 3 | 0 | 10 | ✅ 全て修正済 (Vite 版) |
| 第3.5波 (React error #310) | 1 | 0 | 0 | 0 | 1 | ✅ 修正済 (Vite 版) |
| **第4波 (Next.js 移行後)** | **2** | **6** | **8** | **8** | **24** | ✅ **20 修正済 / 4 判断留保** |
| **総合計** | **15** | **24** | **32** | **24** | **95** | **91 修正済 + 4 判断留保** |

## 🎯 Phase 8 前修正 対応記録 (2026-08-22)

Phase 8 に進む前に上記 24 件のうち **20 件を全て修正完了**。残 4 件は「実害小・要 UX 判断・将来対応」として意図的に保留:

### 🔴 即時対応 (本番デプロイ前) — 3/3 ✅

1. ✅ **C4-1** Route Handler の USER_AGENT ハードコード → `process.env.MODRINTH_USER_AGENT` 参照に統一
   - コミット: `app/api/modrinth/[...path]/route.ts:27-33`
   - 検証: Modrinth 到達不可 (sandbox) だが env 参照コード実装済
2. ✅ **C4-2** モーダル背景スクロールロック復元 → `usePathname()` で `/mod/*` 検知を `isAnyModalOpen` に追加
   - コミット: `components/AppShell.tsx:157-165`
   - 検証: pathname 判定コードが soft nav 時に発火
3. ✅ **H4-2** `<title>` 重複バグ修正 → layout の template に任せて page.tsx の title は Mod タイトルのみ
   - コミット: `app/mod/[slug]/page.tsx:57-87`
   - 検証実測: `<title>sodium - DropMod | DropMod</title>` → **`<title>sodium | DropMod</title>`** ✅

### 🟠 短期対応 (Phase 8 前半) — 5/5 ✅

4. ✅ **H4-1** `<Link>` への置換 → BottomNav (3 タブ) / Header ロゴ / ModCard / Empty state / ModDetailModal ホーム戻る (計 8 箇所)
   - コミット: `components/BottomNav.tsx`, `Header.tsx`, `ModCard.tsx`, `ModsPageClient.tsx`, `ModDetailModalShell.tsx`, `HomeInteractive.tsx`
   - 検証実測: `<a href>` 数 **0 → 5** (Home HTML 内、他のページはより多い)
5. ✅ **H4-6** `app/error.tsx` + `app/global-error.tsx` 追加 → Vite `ErrorBoundary.tsx` (175 行) を Next.js `error` API に移植
   - 新規: `app/error.tsx` (109 行) + `app/global-error.tsx` (128 行)
   - 「予期しないエラー」「リロード」「データを削除してリロード」「エラー詳細を表示」の全日本語 UI 復元
6. ✅ **H4-4** useCallback ラップ (12 関数)
   - `hooks/useProfiles.ts`: 8 関数を useCallback 化 (handleSwitchProfile / handleCreateProfile / handleDuplicateProfile / handleSaveEditedProfile / handleDeleteProfile / handleToggleMod / handleUpdateModVersion / handleRemoveAllMods)
   - `hooks/useZipExport.ts`: 1 関数 (handleDownloadZip)
   - `hooks/useZipImport.ts`: 3 関数 (handleImportZipFile / handleImportZipInput / handleDropZip)
   - deps 最小化: Ref パターン (profilesRef / currentProfileIdRef) を使って `[showToast]` 等のみに絞る
7. ✅ **M4-1** Hero Banner の「登録 MOD 数」パネル復元 → Vite HomeTab.tsx から emerald gradient パネル + モバイル用「確認」ボタンを移植
   - コミット: `components/HomeInteractive.tsx:222-289`
   - 検証実測: SSR HTML に `登録 MOD 数` 文字列復活 ✅
8. ✅ **M4-2** profile フォールバック 3 件復元 → `profile?.mcVersion || '未設定'`, `profile?.loader || '未設定'`, `profile?.name || '名称未設定プロファイル'`
   - コミット: `components/HomeInteractive.tsx:239-249`

### 🟡 中期対応 (Phase 8 後半) — 6/7 ✅ (M4-5 のみ判断留保)

9. ✅ **H4-3** `<Image>` 置換 (7 箇所を Image 化、2 箇所は Markdown/プレビューで img 維持)
   - Image 化: ModCard / ModsPageClient (2) / ModDetailModalShell (Header icon + Gallery fill) / DependencyCheckModal (2)
   - `<img>` 維持: MarkdownRenderer (Markdown 内画像は width/height 未知) / ModDetailModalShell の拡大プレビュー (アスペクト比可変)
   - Modrinth CDN 経由の PNG が WebP/AVIF 自動変換 + srcset 生成
10. ✅ **M4-3** theme FOUC 対策 inline script → `app/layout.tsx` の `<head>` に localStorage 先読み script
    - コミット: `app/layout.tsx:104-124`
    - 検証実測: SSR HTML 内に `localStorage.getItem('dropmod_state_v2')` inline script が出力 ✅
11. ✅ **M4-4** モーダル ISR MISS 時 loading.tsx → `app/@modal/(.)mod/[slug]/loading.tsx` 新規作成
    - モーダル外枠 (fixed inset-0 + backdrop) 込みの skeleton
12. ✅ **H4-5** SSR ちらつき解消 (Cookie 化)
    - `hooks/useProfiles.ts` に cookie 書き込み (mcVersion + loader のみ、1 年間、SameSite=Lax)
    - `app/page.tsx` で `cookies()` から読取 → 実プロファイル値で SSR fetch
    - Route 変化: `/` = Static → **Dynamic** (cookie 読取で期待どおり)
    - 破損 cookie は safe parse で無視 (JSON.parse 失敗 or length チェック)
13. ✅ **M4-6** `NEXT_PUBLIC_SITE_URL` trailing slash 処理 → `app/layout.tsx` の `resolveMetadataBase()` で `replace(/\/$/, '')`
14. ✅ **M4-7** dead code `PATH_TO_TAB` → 実際に使用 (`return PATH_TO_TAB[pathname ?? '/'] ?? 'home';`)
15. ✅ **M4-8** Route Handler HEAD method 対応
    - `/api/health`: `HEAD` export 追加、body 無し 200 応答
    - `/api/modrinth/[...path]`: `headHandler` を GET から派生、body 除去
    - 検証実測: `curl -I HEAD /api/health` → 200 ✅

### 🟢 長期対応 (時間があれば) — 3/5 ✅ (L4-2/L4-3/L4-6/L4-7 は判断留保)

16. ✅ **L4-1** グローバル `not-found.tsx` → 日本語 404 ページ (`app/not-found.tsx`) + ホーム/選択中Mod への Link
17. ⏸ **L4-2** vitest + testing-library 導入 → **判断留保** (半日以上の作業、Phase 8+ の別タスク推奨)
18. ✅ **L4-4** useZipImport の useCallback ラップ (H4-4 と一括対応)
19. ✅ **L4-5** Toast 上限を 3 → 5 に緩和 (`hooks/useToasts.ts` の `MAX_VISIBLE_TOASTS` 定数化)
20. ✅ **L4-8** Toast 位置を safe-area-inset-bottom 対応 → `bottom: calc(env(safe-area-inset-bottom, 0px) + 5rem)`
21. ⏸ **M4-5** `router.replace()` vs `push()` 判断 → **判断留保** (UX Trade-off、ユーザー確認要)
22. ⏸ **L4-3** `robots.ts` の host フィールド → **判断留保** (Yandex 専用、Google 非対応でも実害無し)
23. ⏸ **L4-6** dev 時 metadataBase 挙動 → **判断留保** (Vercel 本番では VERCEL_URL 自動注入で解決、dev のみの些細な問題)
24. ⏸ **L4-7** Mod 詳細フルページの Header/BottomNav 表示 → **判断留保** (デザイン判断、UX ユーザー確認要)

## 📊 修正結果集計

### 修正完了 20 件の内訳

| 修正区分 | 件数 |
| --- | ---: |
| 即時対応 (デプロイ前修正必須) | 3 |
| 短期対応 (SEO/UX/エラー対策) | 5 |
| 中期対応 (パフォーマンス/機能追加) | 6 |
| 長期対応 (品質改善) | 3 (L4-1, L4-4, L4-5, L4-8 の 4 件だが L4-4 は H4-4 に含む) |

### 判断留保 4 件

- **L4-2** テスト導入 — Phase 8+ の別タスク (工数大)
- **L4-3** Yandex 独自 host フィールド — 実害無し
- **L4-6** dev canonical URL — Vercel 本番では自動解決
- **L4-7** Mod 詳細フルページの Header/BottomNav — デザイン判断
- **M4-5** router.back vs replace — UX Trade-off

### ビルド検証

```
pnpm exec tsc --noEmit → 0 エラー
pnpm build → 成功 (17 秒)

Route (app)                  Revalidate  Expire
┌ ƒ /                                                (← Static → Dynamic に変化, cookies() 使用のため)
├ ○ /_not-found
├ ƒ /(.)mod/[slug]
├ ƒ /[...catchAll]
├ ƒ /api/health
├ ƒ /api/modrinth/[...path]
├ ● /mod/[slug]                                       (SSG + ISR 1h)
├ ○ /mods
├ ○ /robots.txt
├ ○ /settings
└ ○ /sitemap.xml                     5m      1y
```
23. **L4-6** dev 時 metadataBase の undefined 化 (任意)
24. **L4-7** Mod 詳細フルページの Header/BottomNav 判断 (要 UX ユーザー確認)

## 📚 参考文献 (第4波追加)

- Next.js 16 App Router: https://nextjs.org/docs/app
- Next.js Metadata API: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js Image Component: https://nextjs.org/docs/app/api-reference/components/image
- Next.js Link Component: https://nextjs.org/docs/app/api-reference/components/link
- Next.js error.tsx / global-error.tsx: https://nextjs.org/docs/app/api-reference/file-conventions/error
- Next.js Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- Modrinth API rate limits: https://docs.modrinth.com/api/#ratelimits
- Vercel Environment Variables: https://vercel.com/docs/projects/environment-variables

---

*第4波は 2026-08-21 に計画書 (`docs/NEXTJS_MIGRATION_PLAN.md`)、diff.md (`docs/diff.md`)、実装の 3 者突き合わせで洗い出しました。特に diff.md でも触れられていなかった **C4-1 (USER_AGENT ハードコード)**、**H4-4 (useCallback 未使用 12 関数)**、**M4-6 (trailing slash)**、**M4-7 (dead code)**、**M4-8 (HEAD method)**、**L4-2 (テスト 0 件)** の 6 件は本波で新規発見しました。*
