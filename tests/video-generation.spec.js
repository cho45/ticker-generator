import { test, expect } from '@playwright/test';

test.describe('動画生成フロー', () => {
  test('動画を生成してダウンロードできること', async ({ page }) => {
    // タイムアウトを 60 秒に延長（ffmpeg の変換処理に時間がかかるため）
    test.setTimeout(60000);

    await page.goto('/');

    // テキストを入力
    const textarea = page.locator('textarea');
    await textarea.fill('Playwright Test Scroller');

    // 動画の長さを最短の 1 秒に設定してテスト時間を短縮
    const durationSlider = page.locator('input[type="range"]').nth(1);
    await durationSlider.fill('1');

    // 「動画を生成」ボタンをクリック
    const generateButton = page.getByRole('button', { name: '動画を生成', exact: true });
    await generateButton.click();

    // 生成中のプログレス表示を確認
    const progressSection = page.locator('.progress-section');
    await expect(progressSection).toBeVisible();

    // ダウンロードイベントを待機
    const downloadPromise = page.waitForEvent('download');

    // ステータスが「準備完了」に戻るか、ダウンロードが開始されるのを待つ
    // 内部で a.click() が呼ばれるため、downloadPromise が解決されるはず
    const download = await downloadPromise;

    // ファイル名が期待通りか確認
    expect(download.suggestedFilename()).toMatch(/^scrolling-text-\d+\.mp4$/);

    // 完了後のステータスを確認
    await expect(page.locator('.status')).toContainText('準備完了');
  });
});
