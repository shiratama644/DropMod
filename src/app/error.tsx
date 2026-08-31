'use client';

// -----------------------------------------------------------------------------
// app/error.tsx (React ツリー内例外の boundary)
//
// Next.js App Router 標準の error.tsx。ページ内 (RSC 含む) の描画/ライフサイクル
// 例外を捕捉して、Next.js デフォルトの英語 500 ページの代わりに日本語 UI を出す。
//
// Vite 版 src/components/ErrorBoundary.tsx (Class Component) の JSX/挙動を
// 関数コンポーネント + Next.js の `error` / `reset` props API に移植:
//   - error: Error & { digest?: string }  例外オブジェクト
//   - reset: () => void                   同じルートを再レンダーする関数
//
// 復旧手順:
//   1. 「リロード」ボタン         → reset() (再レンダー) → 失敗時は window.location.reload()
//   2. 「データを削除してリロード」 → localStorage を消去 → window.location.reload()
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    console.error('[DropMod] Unhandled error caught by app/error.tsx:', error);
  }, [error]);

  const handleClearAndReload = () => {
    try {
      localStorage.removeItem('dropmod_state_v2');
      localStorage.removeItem('craftforge_state_v2');
    } catch {
      /* noop */
    }
    if (typeof window !== 'undefined') window.location.reload();
  };

  const handleReload = () => {
    // まず Next.js の reset() で復旧を試み、失敗した場合はブラウザリロードにフォールバック。
    try {
      reset();
    } catch {
      if (typeof window !== 'undefined') window.location.reload();
    }
  };

  return (
    <div
      role="alert"
      className="min-h-[80vh] flex items-center justify-center p-6"
    >
      <div className="max-w-xl w-full p-7 rounded-3xl glass-panel border shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 theme-text-red flex items-center justify-center text-lg font-bold">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden />
          </div>
          <h1 className="text-lg font-extrabold m-0">予期しないエラーが発生しました</h1>
        </div>
        <p className="text-xs sm:text-sm theme-text-secondary leading-relaxed mb-3">
          アプリの描画中にエラーが発生し、画面が停止しました。以下を試してください:
        </p>
        <ul className="text-xs theme-text-muted leading-relaxed ml-5 list-disc mb-4 space-y-1">
          <li>「リロード」でページを再読み込み</li>
          <li>それでも直らない場合は「ローカルデータを削除してリロード」</li>
        </ul>

        {error && (
          <details
            className="mb-4"
            open={isDetailOpen}
            onToggle={(e) => setIsDetailOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="text-[11px] cursor-pointer theme-text-muted font-mono">
              エラー詳細を表示
            </summary>
            <pre className="mt-2 p-2.5 text-[11px] bg-slate-900/90 border border-white/10 rounded-lg overflow-auto max-h-52 font-mono theme-text-red whitespace-pre-wrap break-all">
              {String(error.message)}
              {error.digest ? `\n\nDigest: ${error.digest}` : ''}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>
        )}

        <div className="flex justify-end gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleClearAndReload}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-red-500/40 bg-red-500/10 theme-text-red hover:bg-red-500/20 transition"
          >
            データを削除してリロード
          </button>
          <button
            type="button"
            onClick={handleReload}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition shadow"
          >
            リロード
          </button>
        </div>
      </div>
    </div>
  );
}
