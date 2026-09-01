#!/usr/bin/env node
// -----------------------------------------------------------------------------
// buildFontawesomeSubset.mjs (Phase 10-A)
//
// @fortawesome/fontawesome-free の CSS から、DropMod で実際に使用している
// icon (fa-solid / fa-brands) だけを含む subset CSS を生成する。
//
// 【方針】
//   1. リポジトリ全体を grep して使用 icon 名を抽出 (fa-solid / fa-brands 別)
//   2. fontawesome.min.css から共通ルール (base .fa, sizing, animation, .fa-fw 等) を
//      正規表現でホワイトリスト抽出
//   3. solid.min.css / brands.min.css から @font-face + style 定義をコピー
//   4. 使用 icon の `.fa-xxx{--fa:"\fXXX"}` ルールを fontawesome.min.css / brands.min.css
//      から抽出して連結
//   5. 出力: styles/fontawesome-subset.css
//
// 【注意】
//   - 動的 icon (テンプレートリテラル `fa-chevron-${up|down}` 等) は grep で拾えないため
//     ALWAYS_INCLUDE リストに手動追加
//   - Font Awesome 本体のアップデート時は本スクリプト再実行 (`pnpm build:fa-subset`)
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const FA_ROOT = join(REPO_ROOT, 'node_modules/@fortawesome/fontawesome-free');
const FA_DIR = join(FA_ROOT, 'css');
const FA_WEBFONTS = join(FA_ROOT, 'webfonts');
// ORG-2 (src/ 移行) 以降、アプリコードは全て src/ 配下。
// 旧パス (app / components / hooks) は存在しないため、実際のコードをスキャンする。
const OUT_PATH = join(REPO_ROOT, 'src/styles/fontawesome-subset.css');
const PUBLIC_WEBFONTS = join(REPO_ROOT, 'public/webfonts');

const SCAN_DIRS = ['src/app', 'src/components', 'src/hooks', 'src/features', 'src/lib'];
const SCAN_EXTS = ['.ts', '.tsx'];

// ---- 動的 icon (テンプレートリテラルで生成されるため grep で拾えない) ----
// テンプレートリテラルで作られる icon はこちらに列挙
const ALWAYS_INCLUDE_SOLID = new Set([
  'fa-chevron-up',
  'fa-chevron-down',
  // lib/utils/versionOption.ts のチャネル icon (SCAN_DIRS 外)
  'fa-circle-check',
  'fa-flask',
  'fa-vial'
]);
const ALWAYS_INCLUDE_BRANDS = new Set();

// ---- 使用 icon を grep ----
function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      walkFiles(p, out);
    } else if (SCAN_EXTS.some((e) => p.endsWith(e))) {
      out.push(p);
    }
  }
  return out;
}

const solidIcons = new Set(ALWAYS_INCLUDE_SOLID);
const brandsIcons = new Set(ALWAYS_INCLUDE_BRANDS);

// 【1】明示的リテラル "fa-solid fa-xxx" / "fa-brands fa-xxx" を拾う
const litRe = /fa-(solid|brands|regular)\s+(fa-[a-z0-9-]+)/g;

// 【2】データオブジェクト内の `icon: 'fa-xxx'` / `activeIcon: 'fa-xxx'` /
//   `href: '...' icon: 'fa-xxx'` などの文字列リテラル。
//   単に "'fa-xxx'" or '"fa-xxx"' を拾い、それらは fa-solid 前提とみなす。
//   (DropMod では fa-brands の 2 icon は必ず明示的リテラル (fa-brands fa-github)
//    で書かれるので、この 2 段目に brands が混じる懸念はない)
const strRe = /['"](fa-[a-z0-9-]+)['"]/g;

for (const dir of SCAN_DIRS) {
  const abs = join(REPO_ROOT, dir);
  for (const file of walkFiles(abs)) {
    const src = readFileSync(file, 'utf8');
    // 1 段目
    litRe.lastIndex = 0;
    for (const m of src.matchAll(litRe)) {
      const style = m[1];
      const icon = m[2];
      if (icon.endsWith('-')) continue;
      if (style === 'brands') brandsIcons.add(icon);
      else solidIcons.add(icon);
    }
    // 2 段目 (fa-solid スタイル前提で追加)
    strRe.lastIndex = 0;
    for (const m of src.matchAll(strRe)) {
      const icon = m[1];
      if (icon.endsWith('-')) continue;
      // "fa-solid" / "fa-brands" / "fa-regular" 自体はスタイル指定なので除外
      if (['fa-solid', 'fa-brands', 'fa-regular'].includes(icon)) continue;
      solidIcons.add(icon);
    }
  }
}

console.log(`[fa-subset] solid icons: ${solidIcons.size}`);
console.log(`[fa-subset] brands icons: ${brandsIcons.size}`);

// ---- CSS 生成 ----
const fontawesomeCss = readFileSync(join(FA_DIR, 'fontawesome.min.css'), 'utf8');
const solidCss = readFileSync(join(FA_DIR, 'solid.min.css'), 'utf8');
const brandsCss = readFileSync(join(FA_DIR, 'brands.min.css'), 'utf8');

// fontawesome.min.css の「共通ルール」= 個別 icon 定義 `.fa-xxx{--fa:"\fXXX"}` 以外
// を抽出する。個別 icon ルールは `.fa-xxx{--fa:"\fXXXX"}` 形式なので、それを除いた
// 部分をそのまま流用する。
const ICON_RULE_RE = /\.[a-z0-9-,\s.]+\{--fa:"\\[a-f0-9]+"\}/g;
const baseCommon = fontawesomeCss.replace(ICON_RULE_RE, '');

// 使用 icon のルールだけ抽出する。エイリアス (,) を含むものもあるので、
// 対象名を含む rule 全体をマッチさせる。
function extractIconRules(css, iconSet) {
  const rules = [];
  ICON_RULE_RE.lastIndex = 0;
  for (const match of css.matchAll(ICON_RULE_RE)) {
    const rule = match[0];
    // rule は `.fa-a,.fa-b{--fa:"\fXXX"}` の形。セレクタ部を分解して
    // 1 つでも iconSet に含まれるなら残す。
    const selectors = rule.slice(0, rule.indexOf('{'));
    const list = selectors.split(',').map((s) => s.trim().replace(/^\./, ''));
    if (list.some((n) => iconSet.has(n))) {
      rules.push(rule);
    }
  }
  return rules;
}

const solidRules = extractIconRules(fontawesomeCss, solidIcons);
const brandsRules = extractIconRules(brandsCss, brandsIcons);

// brands.min.css の共通部 (=個別 icon 定義以外) を抽出
const brandsCommon = brandsCss.replace(ICON_RULE_RE, '');

// ---- webfonts を public/webfonts/ にコピー ----
// 元 CSS の url(../webfonts/xxx.woff2) を url(/webfonts/xxx.woff2) に書き換えるため、
// public/webfonts/ に必要な woff2 を配置。
// (DropMod で使用するのは solid と brands のみ、regular / v4compat は不要)
mkdirSync(PUBLIC_WEBFONTS, { recursive: true });
const REQUIRED_FONTS = ['fa-solid-900.woff2', 'fa-brands-400.woff2'];
for (const font of REQUIRED_FONTS) {
  const src = join(FA_WEBFONTS, font);
  const dst = join(PUBLIC_WEBFONTS, font);
  copyFileSync(src, dst);
}
console.log(`[fa-subset] copied ${REQUIRED_FONTS.length} webfonts to public/webfonts/`);

// CSS 内の相対パス url(../webfonts/...) を絶対パス url(/webfonts/...) に置換
function rewriteFontUrls(css) {
  return css.replaceAll(/url\(\.\.\/webfonts\//g, 'url(/webfonts/');
}
const solidCssRewritten = rewriteFontUrls(solidCss);
const brandsCommonRewritten = rewriteFontUrls(brandsCommon);

const header = `/* -----------------------------------------------------------------------------
 * DropMod Font Awesome subset (Phase 10-A で自動生成)
 *
 * 生成元: scripts/buildFontawesomeSubset.mjs
 * 元 CSS: @fortawesome/fontawesome-free (Font Awesome Free 7.x)
 * License: https://fontawesome.com/license/free
 *
 * 使用 icon 数:
 *   - fa-solid:  ${solidIcons.size}
 *   - fa-brands: ${brandsIcons.size}
 *
 * 追加/削除時は本ファイルを直接編集せず、リポジトリの JSX で
 *   <i className="fa-solid fa-xxx"> を追加した上で
 *   \`pnpm build:fa-subset\` を再実行してください。
 *
 * テンプレートリテラルで動的に組み立てる icon は
 *   scripts/buildFontawesomeSubset.mjs の ALWAYS_INCLUDE_SOLID に手動追加。
 * ----------------------------------------------------------------------------- */
`;

const out = [
  header,
  '/* Font Awesome base (共通ルール、個別 icon rule は除去済み) */',
  baseCommon.trim(),
  '',
  '/* Font Awesome Solid (@font-face + .fas/.fa-solid style) */',
  solidCssRewritten.trim(),
  '',
  `/* Solid icon rules (${solidRules.length} 個、DropMod で使用中のもののみ) */`,
  solidRules.join('\n'),
  '',
  '/* Font Awesome Brands (@font-face + .fa-brands style) */',
  brandsCommonRewritten.trim(),
  '',
  `/* Brands icon rules (${brandsRules.length} 個、DropMod で使用中のもののみ) */`,
  brandsRules.join('\n'),
  '',
].join('\n');

writeFileSync(OUT_PATH, out, 'utf8');
const sizeKB = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log(`[fa-subset] wrote ${OUT_PATH} (${sizeKB} KB)`);
