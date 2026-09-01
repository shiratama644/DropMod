/**
 * E2E: 詳細ページのギャラリー → ギャラリーモーダル (COV-4)
 *
 * 検証フロー (計画 §10.4):
 *   1. /mod/sodium (実 API) でギャラリー画像をタップ → その画像からモーダルが開く
 *   2. pointer イベント (マウス down/move/up) のスワイプで前後の画像へ移動
 *   3. 画像領域の高さがどの画像でも一定 (maxRatio で固定される #16)
 *
 * ※ 詳細ページのデータは RSC (サーバー側 fetch) のため実 Modrinth API に依存
 *   (既存 modDetailModal.spec と同じ前提)。CI はサーバー側アウトバウンドが
 *   通る環境で実行される。
 */

import { test, expect } from '@playwright/test';

test.describe('詳細ページ ギャラリーモーダル (COV-4)', () => {
  test('画像タップ → その画像から開く / スワイプで前後 / 高さ一定', async ({ page }) => {
    await page.goto('/mod/sodium');

    // ギャラリー見出し (件数付き) を待つ
    const galleryHeading = page.getByRole('heading', { name: /^ギャラリー/ });
    await galleryHeading.waitFor({ state: 'visible', timeout: 20_000 });
    const headingText = await galleryHeading.innerText();
    const match = headingText.match(/\((\d+)\)/);
    expect(match, `ギャラリー件数を読み取れません: "${headingText}"`).not.toBeNull();
    const count = Number(match?.[1] ?? '0');
    test.skip(!Number.isFinite(count) || count < 3, 'スワイプ検証には 3 枚以上のギャラリー画像が必要');

    // --- 3 枚目の画像をタップ → モーダルが「3 / N」から開く ---
    const galleryButtons = page.getByRole('button', { name: /拡大表示/ });
    await expect(galleryButtons.first()).toBeVisible();
    await galleryButtons.nth(2).click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    // カウンタ (画像に title がある場合は「title ・ 3 / N」表記になるため末尾一致)
    await expect(dialog.getByText(new RegExp(`3 / ${count}$`)).first()).toBeVisible();

    // 画像領域 (スワイプ対象)。高さプローブ完了まで少し待つ (#16 の maxRatio 反映)
    const imageArea = dialog.locator('.touch-pan-y');
    await expect(imageArea).toBeVisible();
    await page.waitForTimeout(800);

    const heightAt3 = (await imageArea.boundingBox())?.height;
    expect(heightAt3, '画像領域の高さを取得できません').toBeGreaterThan(0);

    // --- 左スワイプ (dx < -40) → 次の画像 (4 / N) ---
    const box = await imageArea.boundingBox();
    if (!box) throw new Error('画像領域の boundingBox を取得できません');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 90, cy, { steps: 6 });
    await page.mouse.up();

    await expect(dialog.getByText(new RegExp(`4 / ${count}$`)).first()).toBeVisible({
      timeout: 5_000
    });
    const heightAt4 = (await imageArea.boundingBox())?.height;
    expect(heightAt4).toBe(heightAt3);

    // --- 右スワイプ (dx > 40) → 前の画像 (3 / N) に戻る ---
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 90, cy, { steps: 6 });
    await page.mouse.up();

    await expect(dialog.getByText(new RegExp(`3 / ${count}$`)).first()).toBeVisible({
      timeout: 5_000
    });
    const heightAt3Again = (await imageArea.boundingBox())?.height;
    expect(heightAt3Again).toBe(heightAt3);

    // --- 閉じる ---
    await dialog.getByRole('button', { name: 'ギャラリーを閉じる' }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
