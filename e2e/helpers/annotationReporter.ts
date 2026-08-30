/**
 * Playwright カスタムレポーター: 失敗テストを GitHub Actions アノテーションに出力
 * (2026-08-27 追加)
 *
 * 背景: Sandbox (エージェント環境) から GitHub Actions のログ blob ストレージに
 * ネットワーク到達できないため、失敗テストの詳細が API 経由で取得できなかった。
 * `::error` workflow command を stdout に出力すると GitHub がアノテーション化し、
 * check-runs API (annotations) から読めるようになる → 自主的なデバッグが可能。
 *
 * - GITHUB_ACTIONS 環境変数があるときだけ動作 (ローカル実行は無害)
 * - アノテーションは step あたり最大 10 件のため、超過分は件数のみ通知
 */

import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

interface Failure {
  title: string;
  message: string;
}

export default class GitHubAnnotationReporter implements Reporter {
  private failures: Failure[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed' || !process.env.GITHUB_ACTIONS) return;
    const err = result.error?.message ?? '(エラーメッセージなし)';
    // アノテーションは 1 行。ANSI カラーコードと改行を除去。
    const message = err
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI カラーコード (ESC) 除去のための意図的な制御文字
      .replace(/\u001b\[\d*m/g, '')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 200);
    this.failures.push({
      title: test.titlePath().slice(1).join(' › '),
      message
    });
  }

  onEnd(): void {
    if (!process.env.GITHUB_ACTIONS) return;
    for (const f of this.failures.slice(0, 10)) {
      // title に « » 等が入らないよう軽くサニタイズ
      const title = f.title.replace(/["%]/g, '').slice(0, 120);
      const message = f.message.replace(/["%]/g, '').slice(0, 200);
      console.log(`::error title=E2E 失敗::${title} — ${message}`);
    }
    if (this.failures.length > 10) {
      console.log(
        `::error title=E2E 失敗 (その他 ${this.failures.length - 10} 件)::アノテーション上限 (10) を超える失敗あり`
      );
    }
  }
}
