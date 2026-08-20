import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * React ErrorBoundary — ツリー内の描画/ライフサイクル例外を捕捉し、
 * root 全体がアンマウントして画面が真っ暗になるのを防ぐ。
 *
 * ユーザーは「リロード」または「ローカルデータを削除してリロード」の
 * どちらかで復旧できるようになる。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[DropMod] Unhandled error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleClearAndReload = (): void => {
    try {
      localStorage.removeItem('dropmod_state_v2');
      localStorage.removeItem('craftforge_state_v2');
    } catch {
      /* noop */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          backgroundColor: 'var(--bg-base, #090d14)',
          color: 'var(--text-primary, #f8fafc)',
          fontFamily: 'Inter, sans-serif'
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: '100%',
            padding: '1.75rem',
            borderRadius: '1.5rem',
            background: 'var(--bg-panel, rgba(15,23,42,0.85))',
            border: '1px solid var(--border-main, rgba(255,255,255,0.1))',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700
              }}
            >
              !
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
              予期しないエラーが発生しました
            </h1>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.8, margin: '0 0 12px' }}>
            アプリの描画中にエラーが発生し、画面が停止しました。以下を試してください:
          </p>
          <ul style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.75, margin: '0 0 16px 20px' }}>
            <li>「リロード」でページを再読み込み</li>
            <li>それでも直らない場合は「ローカルデータを削除してリロード」</li>
          </ul>
          {this.state.error && (
            <details style={{ marginBottom: 16 }}>
              <summary
                style={{
                  fontSize: 11,
                  cursor: 'pointer',
                  opacity: 0.7,
                  fontFamily: 'JetBrains Mono, monospace'
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
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#f87171'
                }}
              >
                {String(this.state.error.message)}
                {this.state.error.stack ? '\n\n' + this.state.error.stack : ''}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={this.handleClearAndReload}
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
              onClick={this.handleReload}
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
      </div>
    );
  }
}
