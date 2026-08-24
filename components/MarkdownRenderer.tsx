'use client';

import React from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { isAnimatedImageUrl } from '@/lib/utils/image';

// -----------------------------------------------------------------------
// Phase 10-C: Markdown 内 <img> の next/image 最適化対象ホスト。
//
// これらの origin (Modrinth CDN 等、next.config.ts の remotePatterns に
// 登録済みのホスト) を持つ画像は <Image> で描画され、Vercel の Image
// Optimization / AVIF/WebP 自動変換 / lazy loading / srcset 生成の恩恵
// を受ける。
//
// それ以外の origin (ユーザー自己 host / 未登録 CDN) は従来通り <img>
// フォールバック描画。
// -----------------------------------------------------------------------
const OPTIMIZED_IMAGE_HOSTS = new Set<string>([
  'cdn.modrinth.com',
  'raw.githubusercontent.com',
]);

function isOptimizableImageSrc(src: string | undefined): boolean {
  if (!src) return false;
  try {
    const u = new URL(src);
    if (u.protocol !== 'https:') return false;
    return OPTIMIZED_IMAGE_HOSTS.has(u.host);
  } catch {
    return false;
  }
}

interface MarkdownRendererProps {
  content: string;
}

// -----------------------------------------------------------------------
// カスタムサニタイズ設定 (L-8 対応強化)
//
// 変更点:
//   - iframe / img / a などは許可するが、CSS injection や
//     overlay attack を防ぐため `style` 属性は全タグで削除。
//   - iframe.src はホワイトリスト検証をコンポーネント側で追加で実施。
//     (rehype-sanitize は URL のプロトコルは http/https に既に制限)
// -----------------------------------------------------------------------
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'iframe',
    'div',
    'span',
    'details',
    'summary',
    'video',
    'source',
    'picture',
    'center',
    'font'
  ],
  // defaultSchema.attributes をタグ単位でも spread して継承。
  //   以前は各タグを完全上書きしていたため、将来 rehype-sanitize の
  //   defaultSchema にセキュリティ属性 (例: aria-*, id, referrerpolicy 等) が
  //   追加された際に喪失するリスクがあった。
  //   spread により defaultSchema 側の属性を残しつつ、本アプリで追加が必要な
  //   属性 (iframe の allowfullscreen 等) を上乗せする形にする。
  attributes: {
    ...defaultSchema.attributes,
    iframe: [
      ...((defaultSchema.attributes?.iframe as (string | [string, ...unknown[]])[]) || []),
      'src',
      'width',
      'height',
      'frameborder',
      'allow',
      'allowfullscreen',
      'title',
      'className'
    ],
    div: [
      ...((defaultSchema.attributes?.div as (string | [string, ...unknown[]])[]) || []),
      'className',
      'align'
    ],
    span: [
      ...((defaultSchema.attributes?.span as (string | [string, ...unknown[]])[]) || []),
      'className'
    ],
    img: [
      ...((defaultSchema.attributes?.img as (string | [string, ...unknown[]])[]) || []),
      'src',
      'alt',
      'title',
      'width',
      'height',
      'className',
      'loading'
    ],
    a: [
      ...((defaultSchema.attributes?.a as (string | [string, ...unknown[]])[]) || []),
      'href',
      'title',
      'target',
      'rel',
      'className'
    ]
  }
};

// iframe embed を許可する動画プラットフォームのホスト allowlist
const ALLOWED_IFRAME_HOSTS = new Set<string>([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
  'vimeo.com',
  'player.twitch.tv',
  'clips.twitch.tv',
  'streamable.com'
]);

function isAllowedIframeSrc(src: string | undefined): boolean {
  if (!src) return false;
  try {
    const u = new URL(src);
    // HTTPS のみ許可 (http: は HTTPS ページで mixed content ブロック
    // されるため実際は動かない → 明示的に拒否してセキュリティ姿勢を強化)
    if (u.protocol !== 'https:') return false;
    return ALLOWED_IFRAME_HOSTS.has(u.host);
  } catch {
    return false;
  }
}

function getYouTubeVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  // match[2] は可能性として undefined
  const videoId = match?.[2];
  return videoId && videoId.length === 11 ? videoId : null;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content) return null;

  return (
    <div className="markdown-body space-y-3 text-xs sm:text-sm leading-relaxed theme-text-secondary overflow-hidden break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          // YouTube リンク検出 ➔ 埋め込みプレイヤー変換
          a: ({ node, href, children, ...props }) => {
            if (href) {
              const videoId = getYouTubeVideoId(href);
              if (videoId) {
                return (
                  <div className="my-4 aspect-video w-full rounded-2xl overflow-hidden shadow-lg border border-slate-700/50 bg-slate-900">
                    <iframe
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full"
                    ></iframe>
                  </div>
                );
              }
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="theme-text-brand font-semibold underline hover:opacity-80 transition inline-flex items-center gap-1"
                {...props}
              >
                {children}
                <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
              </a>
            );
          },
          // iframe タグのスタイリング (src はホワイトリストのみ許可)
          iframe: ({ node, src, title, ...props }) => {
            if (!isAllowedIframeSrc(src)) {
              return (
                <div className="my-3 p-3 text-xs rounded-xl border border-red-500/40 bg-red-500/10 theme-text-red">
                  <i className="fa-solid fa-shield-halved mr-1.5" aria-hidden="true" />
                  <span>安全上の理由により埋め込みをブロックしました: </span>
                  <code className="font-mono break-all">{String(src || '(no src)')}</code>
                </div>
              );
            }
            return (
              <div className="my-4 aspect-video w-full rounded-2xl overflow-hidden shadow-lg border border-slate-700/50 bg-slate-900">
                <iframe
                  src={src}
                  title={title || 'Embedded video'}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full"
                  {...props}
                ></iframe>
              </div>
            );
          },
          // 画像スタイリング (Phase 10-C: Modrinth CDN 経由の画像は <Image> 最適化)
          //
          // 【方針】
          //   - src の origin が OPTIMIZED_IMAGE_HOSTS (Modrinth CDN /
          //     raw.githubusercontent.com) なら next/image 使用
          //     → Vercel Image Optimization / AVIF/WebP 変換 / lazy /
          //        srcset 生成の恩恵で LCP 100〜300 ms 改善見込み
          //   - width/height 不定なので暫定値 (1200x675 = 16:9) を渡し、
          //     style={{ height: 'auto', width: '100%' }} でブラウザに
          //     aspect ratio 保持任せ + sizes で最適サイズ選択
          //   - それ以外の origin (自己 host / 未登録 CDN) は従来通り <img>
          img: ({ node: _node, src, alt, ...props }) => {
            const srcStr = typeof src === 'string' ? src : undefined;
            if (isOptimizableImageSrc(srcStr)) {
              return (
                <span className="block my-3 rounded-2xl overflow-hidden shadow-md border border-slate-500/20">
                  <Image
                    src={srcStr as string}
                    alt={alt || ''}
                    width={1200}
                    height={675}
                    sizes="(max-width: 640px) 100vw, 720px"
                    style={{ height: 'auto', width: '100%' }}
                    className="hover:opacity-95 transition"
                    loading="lazy"
                    unoptimized={isAnimatedImageUrl(srcStr)}
                  />
                </span>
              );
            }
            return (
              // Modrinth CDN 外 origin (ユーザー自己 host 等) は width/height 事前取得不可 → <img> 維持。
              // biome-ignore lint/performance/noImgElement: Markdown 内画像 (未登録 origin) は width/height 不定
              <img
                src={srcStr}
                alt={alt || ''}
                className="my-3 rounded-2xl max-w-full h-auto shadow-md border border-slate-500/20 hover:opacity-95 transition"
                loading="lazy"
                decoding="async"
                {...props}
              />
            );
          },
          // 見出し
          // Header の <h1>DropMod</h1> と重複しないよう、
          // Markdown 本文の見出しは h1 → h2, h2 → h3, h3 → h4 と一段ずつ降格。
          // (SEO/A11y: 1 ページに h1 は 1 個が原則)
          h1: ({ node, children, ...props }) => (
            <h2 className="text-xl sm:text-2xl font-black mt-6 mb-3 theme-text-primary border-b-2 border-emerald-500/40 pb-1.5" {...props}>
              {children}
            </h2>
          ),
          h2: ({ node, children, ...props }) => (
            <h3 className="text-lg sm:text-xl font-extrabold mt-5 mb-2 theme-text-primary border-b border-slate-500/30 pb-1" {...props}>
              {children}
            </h3>
          ),
          h3: ({ node, children, ...props }) => (
            <h4 className="text-base sm:text-lg font-bold mt-4 mb-2 theme-text-brand border-b border-slate-500/20 pb-1" {...props}>
              {children}
            </h4>
          ),
          // GFM テーブル
          table: ({ node, children, ...props }) => (
            <div className="overflow-x-auto my-4 rounded-xl border border-slate-700/50 shadow">
              <table className="w-full text-left border-collapse text-xs sm:text-sm" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ node, children, ...props }) => (
            <thead className="theme-sub-box font-bold border-b border-slate-700/50" {...props}>
              {children}
            </thead>
          ),
          th: ({ node, children, ...props }) => (
            <th className="py-2.5 px-3.5 font-bold" {...props}>
              {children}
            </th>
          ),
          td: ({ node, children, ...props }) => (
            <td className="py-2 px-3.5 border-t border-slate-700/30" {...props}>
              {children}
            </td>
          ),
          // ------------------------------------------------------------------
          // コードブロック & インラインコード (react-markdown v9 対応)
          //
          // v9 で `inline` プロップは廃止されたため、
          //   - `<pre><code>...</code></pre>` の <code> はブロック用
          //   - それ以外の <code> はインライン用
          // という HTML 意味論で判定する。
          //
          // 実装: `<pre>` コンポーネントをオーバーライドしてブロックスタイルを
          //       与え、`<code>` は基本インライン扱い、ただし親が `<pre>` の
          //       場合はスタイル無しで通してブロック側の <pre> にゆだねる。
          // Ref: https://github.com/remarkjs/react-markdown/issues/834
          // ------------------------------------------------------------------
          // Phase 10-P5 (noExplicitAny): react-markdown の Components 型を使い、
          //   node 引数 (unified AST) を無視しつつ残り props を pre/code element に流す。
          pre: (({ node: _node, children, ...props }) => (
            <pre
              className="my-3 p-3.5 rounded-xl bg-slate-900/90 text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-700/50"
              {...props}
            >
              {children}
            </pre>
          )) satisfies Components['pre'],
          code: (({ node: _node, className, children, ...props }) => {
            // ブロックコードは className="language-xxx" が付与されるか、
            // 中身に改行を含むことが多い。
            // どちらでもない場合はインラインとしてスタイリングする。
            const childStr = React.Children.toArray(children).join('');
            const hasNewline = typeof childStr === 'string' && childStr.includes('\n');
            const isBlock = /^language-/.test(className || '') || hasNewline;
            if (isBlock) {
              // <pre> 側のスタイルがあるので、<code> 自体はそのまま出力
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-xs border border-slate-700/40"
                {...props}
              >
                {children}
              </code>
            );
          }) satisfies Components['code'],
          // 引用
          blockquote: ({ node, children, ...props }) => (
            <blockquote className="border-l-4 border-emerald-500 pl-3.5 py-1 my-3 bg-emerald-500/10 rounded-r-xl italic theme-text-secondary" {...props}>
              {children}
            </blockquote>
          ),
          // リスト
          ul: ({ node, children, ...props }) => (
            <ul className="list-disc pl-5 my-2 space-y-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ node, children, ...props }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1" {...props}>
              {children}
            </ol>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};