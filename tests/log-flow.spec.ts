import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_EMAIL || "tortawan@gmail.com";
const TEST_PASSWORD = process.env.PLAYWRIGHT_PASSWORD || "password123";

async function ensureLoggedIn(page: Page) {
  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign in")');
  }
}

async function stubLogFood(page: Page) {
  await page.route("**/api/log-food", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        food_name: "Mock Chicken Bowl",
        consumed_at: new Date().toISOString(),
      }),
    }),
  );
}

test("image draft to confirmed log flow", async ({ page }) => {
  await page.goto("/");

  // Handle login if redirected
  await ensureLoggedIn(page);

  // Mock the API response to avoid hitting real Gemini/Supabase
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: [
          {
            food_name: "Mock Chicken Bowl",
            quantity_estimate: "200g",
            search_term: "chicken bowl",
            weight: 200,
            match: {
              description: "Grilled chicken breast",
              kcal_100g: 165,
              protein_100g: 31,
              carbs_100g: 0,
              fat_100g: 3.6,
              similarity: 0.92,
            },
          },
        ],
      }),
    }),
  );
  await stubLogFood(page);

  // Upload the dummy image
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);

  // Verify UI and Confirm
  await expect(page.getByText("Draft entries")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  
  // Verify Success
  await expect(page.getByText("Entry added").or(page.getByText("Food log saved"))).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mock Chicken Bowl" })).toBeVisible();
});

test("manual search fallback flow", async ({ page }) => {
  await page.goto("/");

  // Login if needed
  await ensureLoggedIn(page);
  await stubLogFood(page);

  // 1. Switch to Manual Mode
  await page.click('button:has-text("Text / Manual")');

  // 2. Enter a search term
  await page.fill('input[placeholder="Oreo cookie"]', "Greek Yogurt");
  await page.fill('input[type="number"]', "120"); // Calories

  // 3. Quick Add
  await page.click('button:has-text("Quick add entry")');

  // 4. Verify Toast and List
  await expect(page.getByText("Entry added")).toBeVisible();
  await expect(page.getByText("Greek Yogurt")).toBeVisible();
});

test("logs a correction when weight changes before confirm", async ({ page }) => {
  await page.goto("/");
  await ensureLoggedIn(page);

  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: [
          {
            food_name: "Mock Chicken Bowl",
            quantity_estimate: "200g",
            search_term: "chicken bowl",
            weight: 200,
            match: {
              description: "Grilled chicken breast",
              kcal_100g: 165,
              protein_100g: 31,
              carbs_100g: 0,
              fat_100g: 3.6,
              similarity: 0.75,
            },
          },
        ],
      }),
    }),
  );
  await stubLogFood(page);

  let correctionTriggered = false;
  await page.route("**/api/log-correction", (route) => {
    correctionTriggered = true;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);

  await expect(page.getByText("Draft entries")).toBeVisible();
  await page.getByRole("button", { name: "Adjust weight" }).click();
  await page.getByLabel(/Adjust weight/).fill("250");
  await page.getByRole("button", { name: "Done" }).click();

  const [logCorrectionRequest] = await Promise.all([
    page.waitForRequest("**/api/log-correction"),
    page.getByRole("button", { name: "Confirm" }).click(),
  ]);

  expect(logCorrectionRequest).toBeTruthy();
  expect(correctionTriggered).toBeTruthy();
});
