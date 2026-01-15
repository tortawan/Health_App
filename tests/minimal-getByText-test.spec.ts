import { test } from '@playwright/test';

test('Verify getByText + waitFor on static HTML', async ({ page }) => {
  // Inject HTML with exact text
  await page.setContent(`
    <html>
      <body>
        <h1>Mock Chicken Bowl</h1>
        <p>Food log saved</p>
        <div id="logs">Today logs here</div>
      </body>
    </html>
  `);

  // Test 1: Your exact syntax
  await page.getByText("Mock Chicken Bowl").waitFor({ timeout: 20000 });
  console.log('✅ Your syntax works on static "Mock Chicken Bowl"');

  // Test 2: expect version
  await expect(page.getByText("Food log saved")).toBeVisible();
  console.log('✅ expect + toBeVisible works');

  // Test 3: Multiple + first()
  await page.setContent('<div><h1>Test</h1><p>Test</p></div>');
  await page.getByText('Test').first().waitFor({ timeout: 5000 });
  console.log('✅ Multiple matches + first() OK');

  // Test 4: Timeout fail (expected)
  await page.getByText('Missing').waitFor({ timeout: 1000 }).catch(() => {
    console.log('✅ Timeout on absent text (correct)');
  });

  console.log('🎉 getByText + waitFor PERFECT');
});
