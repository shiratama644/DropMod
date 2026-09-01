/**
 * E2E: 詳細ページの「対応バージョン」フィルタ (COV-4)
 *
 * 検証フロー (計画 §10.4):
 *   詳細ページ (/mod/sodium) の「対応バージョン」一覧が、現在のプロファイル環境
 *   (既定プロファイル = Minecraft 1.20.1 / Fabric) に一致するものだけを表示する。
 *
 * 期待集合はテスト側で Modrinth API (Node fetch) から取得し、
 * versionsForProfile (MC 一致 + ローダー一致) と同じロジックで絞り込んで
 * 照合する。ページ側の snapshot は ISR キャッシュ由来のため「表示 ⊆ 期待」と
 * 「非一致バージョンが表示されない」を確認する (差分は常に片方向)。
 */

import { test, expect } from '@playwright/test';

const MODRINTH_BASE = 'https://api.modrinth.com/v2';

interface ApiVersion {
  version_number: string;
  game_versions?: string[];
  loaders?: string[];
}

/** プロファイル環境 (既定: MC 1.20.1 / Fabric) */
const MC = '1.20.1';
const LOADER = 'fabric';

test.describe('対応バージョン フィルタ (COV-4)', () => {
  test('プロファイル環境 (1.20.1 / Fabric) に一致するバージョンのみ表示される', async ({
    page
  }) => {
    // --- 期待集合を実 API から取得 (versionsForProfile と同じロジックで絞り込み) ---
    const res = await fetch(`${MODRINTH_BASE}/project/sodium/version`, {
      headers: { 'User-Agent': 'dropmod-e2e (coverage-check)' }
    });
    expect(res.ok, `Modrinth API が応答しません (${res.status})`).toBe(true);
    const versions = (await res.json()) as ApiVersion[];
    expect(versions.length).toBeGreaterThan(0);

    const expected = versions.filter((v) => {
      const mcOk = (v.game_versions ?? []).includes(MC);
      if (!mcOk) return false;
      const loaders = (v.loaders ?? []).map((l) => l.toLowerCase());
      return loaders.length === 0 || loaders.includes(LOADER);
    });
    expect(expected.length, '1.20.1 / Fabric に一致する sodium 版が API 上に存在するはず').toBeGreaterThan(0);
    const expectedNumbers = new Set(expected.map((v) => v.version_number));

    // 非一致のサンプル (1.20.1 を含まないバージョン) があれば、表示されないことも確認
    const nonMatching = versions.find((v) => !(v.game_versions ?? []).includes(MC));

    // --- 詳細ページを開く ---
    await page.goto('/mod/sodium');

    // 対応バージョンカード (SidebarCard = section > h3)
    const versionCard = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: '対応バージョン', level: 3 }) });
    await expect(versionCard).toBeVisible({ timeout: 20_000 });

    // バージョンチップ: 表示された version_number をすべて期待集合と照合
    const chips = versionCard.locator('.theme-badge');
    await expect(chips.first()).toBeVisible({ timeout: 10_000 });
    const chipTexts = await chips.allInnerTexts();
    const visibleNumbers = chipTexts
      .map((t) => t.trim().split(/\s+/)[0])
      .filter((s): s is string => Boolean(s));

    expect(visibleNumbers.length).toBeGreaterThan(0);
    for (const num of visibleNumbers) {
      expect(expectedNumbers.has(num), `非一致バージョンが表示されている: ${num}`).toBe(true);
    }

    // 非一致バージョン (MC 1.20.1 を含まないもの) が表示されていない
    if (nonMatching) {
      expect(visibleNumbers).not.toContain(nonMatching.version_number);
    }
  });
});
