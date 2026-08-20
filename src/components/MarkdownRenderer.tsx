import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

interface MarkdownRendererProps {
  content: string;
}

// iframe やスタイルタグを安全に許可するカスタムサニタイズ設定
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'iframe', 'div', 'span', 'details', 'summary', 'video', 'source', 'picture', 'center', 'font'
  ],
  attributes: {
    ...defaultSchema.attributes,
    iframe: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title', 'className', 'style'],
    div: ['className', 'style', 'align'],
    span: ['className', 'style'],
    img: ['src', 'alt', 'title', 'width', 'height', 'className', 'style', 'loading'],
    a: ['href', 'title', 'target', 'rel', 'className']
  }
};

function getYouTubeVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
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
                rel="noreferrer"
                className="theme-text-brand font-semibold underline hover:opacity-80 transition inline-flex items-center gap-1"
                {...props}
              >
                {children}
                <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
              </a>
            );
          },
          // iframe タグのスタイリング
          iframe: ({ node, src, title, ...props }) => {
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
          // 画像スタイリング
          img: ({ node, src, alt, ...props }) => {
            return (
              <img
                src={src}
                alt={alt || ''}
                className="my-3 rounded-2xl max-w-full h-auto shadow-md border border-slate-500/20 hover:opacity-95 transition"
                loading="lazy"
                {...props}
              />
            );
          },
          // 見出し
          h1: ({ node, children, ...props }) => (
            <h1 className="text-xl sm:text-2xl font-black mt-6 mb-3 theme-text-primary border-b-2 border-emerald-500/40 pb-1.5" {...props}>
              {children}
            </h1>
          ),
          h2: ({ node, children, ...props }) => (
            <h2 className="text-lg sm:text-xl font-extrabold mt-5 mb-2 theme-text-primary border-b border-slate-500/30 pb-1" {...props}>
              {children}
            </h2>
          ),
          h3: ({ node, children, ...props }) => (
            <h3 className="text-base sm:text-lg font-bold mt-4 mb-2 theme-text-brand border-b border-slate-500/20 pb-1" {...props}>
              {children}
            </h3>
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
          // コードブロック & インラインコード
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-xs border border-slate-700/40" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-3 p-3.5 rounded-xl bg-slate-900/90 text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-700/50">
                <code {...props}>{children}</code>
              </pre>
            );
          },
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