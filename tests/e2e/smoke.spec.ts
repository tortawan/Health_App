import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_EMAIL || "tortawan@gmail.com";
const TEST_PASSWORD = process.env.PLAYWRIGHT_PASSWORD || "password123";

async function ensureLoggedIn(page: Page) {
  await page.goto("/");
  try {
    await page.waitForURL(/.*\/login/, { timeout: 3000 });
  } catch {
    // Already logged in or on home
  }

  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/");
  }
}
async function stubAnalyze(page: Page) {
  await page.route("**/api/analyze", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: [
          {
            id: "draft-apple",
            food_name: "Apple",
            search_term: "apple",
            quantity_estimate: "1 medium",
            weight: 182,
            match: {
              description: "Apple",
              kcal_100g: 52,
              protein_100g: 0.3,
              carbs_100g: 14,
              fat_100g: 0.2,
            },
          },
        ],
        imagePath: "data:image/jpeg;base64,test",
        usedFallback: false,
      }),
    }),
  );
}

async function stubLogFood(page: Page) {
  await page.route("**/api/log-food", async (route) => {
    const postData = route.request().postDataJSON();
    const foodName = postData?.foodName || postData?.food_name || "Apple";
    const weight = postData?.weight || postData?.weight_g || 182;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "log-apple",
            food_name: foodName,
            weight_g: weight,
            calories: 95,
            protein: 0.5,
            carbs: 25,
            fat: 0.3,
            consumed_at: new Date().toISOString(),
          },
        ],
      }),
    });
  });
}

test("smoke: analyze image and see Apple in logs", async ({ page }) => {
  await ensureLoggedIn(page);
  await stubAnalyze(page);
  await stubLogFood(page);

  await page.getByRole("button", { name: "Add Log" }).click();

  const fileChooser = page.locator('input[type="file"]');
  const imageFixturePath = path.join(__dirname, "..", "fixtures", "sample.png");
  await fileChooser.setInputFiles(imageFixturePath);

  await expect(page.getByText("Draft entries")).toBeVisible();
  await expect(page.getByText("Apple")).toBeVisible();

  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByText("Apple")).toBeVisible();
});
