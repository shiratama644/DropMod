'use client';

// -----------------------------------------------------------------------------
// H4-6 修正: app/global-error.tsx (Root Layout 自体が壊れた時の最終フォールバック)
//
// app/error.tsx は Root Layout 内で発生した例外を boundary するが、
// Root Layout (app/layout.tsx) の <html>/<body> レンダー自体が失敗した場合は
// app/error.tsx にも到達できない。global-error.tsx は <html>/<body> を含む
// 独自ドキュメントを返す必要がある。
//
// Tailwind CSS もロードされていない前提の inline style で最低限の UI を出す。
// -----------------------------------------------------------------------------

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[DropMod] Fatal error caught by global-error.tsx:', error);
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: 560,
            width: '100%',
            padding: '1.75rem',
            borderRadius: '1.5rem',
            background: 'rgba(15,23,42,0.85)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)'
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 12px' }}>
            致命的なエラーが発生しました
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.8, margin: '0 0 12px' }}>
            アプリの初期化中に問題が発生し、画面全体が停止しました。ブラウザをリロードしてください。
          </p>
          {error && (
            <details style={{ marginBottom: 16 }}>
              <summary
                style={{
                  fontSize: 11,
                  cursor: 'pointer',
                  opacity: 0.7,
                  fontFamily: 'monospace'
                }}
              >
                エラー詳細を表示
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  fontSize: 11,
                  background: 'rgba(15,23,42,0.9)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  overflow: 'auto',
                  maxHeight: 200,
                  fontFamily: 'monospace',
                  color: '#f87171'
                }}
              >
                {String(error.message)}
                {error.digest ? `\n\nDigest: ${error.digest}` : ''}
                {error.stack ? `\n\n${error.stack}` : ''}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('dropmod_state_v2');
                  localStorage.removeItem('craftforge_state_v2');
                } catch {
                  /* noop */
                }
                if (typeof window !== 'undefined') window.location.reload();
              }}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 12,
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                cursor: 'pointer'
              }}
            >
              データを削除してリロード
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  reset();
                } catch {
                  if (typeof window !== 'undefined') window.location.reload();
                }
              }}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 12,
                border: 'none',
                background: '#059669',
                color: '#0f172a',
                cursor: 'pointer'
              }}
            >
              リロード
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
