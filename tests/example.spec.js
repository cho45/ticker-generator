import { test, expect } from '@playwright/test';

test.describe('文字スクロール動画ジェネレーター', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ページが正しく読み込まれること', async ({ page }) => {
    await expect(page).toHaveTitle(/文字スクロール動画ジェネレーター/);
    await expect(page.locator('h1')).toContainText('文字スクロール動画ジェネレーター');
  });

  test('テキスト入力が正しく動作すること', async ({ page }) => {
    const textarea = page.locator('textarea');
    const initialText = await textarea.inputValue();
    expect(initialText).not.toBe('');

    const newText = 'Hello World';
    await textarea.fill(newText);
    await expect(textarea).toHaveValue(newText);
  });

  test('キャンバスが表示されていること', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('width', '720');
    await expect(canvas).toHaveAttribute('height', '720');
  });

  test('動画生成ボタンが有効であること', async ({ page }) => {
    const generateButton = page.getByRole('button', { name: '動画を生成', exact: true });
    await expect(generateButton).toBeVisible();
    await expect(generateButton).toBeEnabled();
  });
});
