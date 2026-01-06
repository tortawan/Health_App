import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_EMAIL || "tortawan@gmail.com";
const TEST_PASSWORD = process.env.PLAYWRIGHT_PASSWORD || "password123";

async function ensureLoggedIn(page: Page) {
  // 1. Navigate to the app (Fix #1: The Navigation Issue)
  await page.goto("/");

  // Handle redirect to login if it happens
  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign in")');
    // Wait for the dashboard to load
    await page.waitForURL("**/");
  }
}

async function stubLogFood(page: Page) {
  await page.route("**/api/log-food", async (route) => {
    const postData = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        food_name: postData.foodName,
        weight_g: postData.weight,
        consumed_at: new Date().toISOString(),
      }),
    });
  });
}

async function stubStorage(page: Page) {
  await page.route("**/storage/v1/object/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ Key: "mock-image-url" }),
    }),
  );
}

test("image draft to confirmed log flow", async ({ page }) => {
  await ensureLoggedIn(page);

  // Stubbing
  await page.route("**/api/analyze", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        foods: [
          {
            food_name: "Mock Chicken Bowl",
            weight: 350,
            confidence: 0.95,
            match: { description: "Grilled chicken", kcal_100g: 165, similarity: 0.95 },
          },
        ],
      }),
    }),
  );
  await stubLogFood(page);
  await stubStorage(page);

  // --- FIX #2: Open the Scanner first ---
  // We must click this button to render the <input type="file">
  await page.getByRole("button", { name: "Add Log" }).click();

  // Upload
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  // Now this will work because the input is in the DOM
  await page.setInputFiles('input[type="file"]', imagePath);

  // Check Draft
  const modal = page.locator("section").filter({ hasText: "Capture" });
  await expect(modal.getByText("Draft entries")).toBeVisible();
  await expect(modal.getByRole("heading", { name: "Mock Chicken Bowl" })).toBeVisible();

  // Confirm
  await modal.getByRole("button", { name: "Confirm", exact: true }).click();

  // Verify Success
  await expect(page.getByText("Entry added").or(page.getByText("Food log saved"))).toBeVisible();
  await expect(page.getByText("Mock Chicken Bowl")).toBeVisible();
});

test("manual search fallback flow", async ({ page }) => {
  await ensureLoggedIn(page);
  await stubLogFood(page);

  // ... (Keep your mock search results stub here) ...
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ description: "Greek Yogurt Plain", score: 1.0 }]),
    }),
  );

  // This test also needs to open the menu
  await page.getByRole("button", { name: "Add Log" }).click();
  await page.getByRole("button", { name: "Manual Add" }).click();

  // Search
  await page.getByPlaceholder("Search food...").fill("Greek Yogurt");
  await page.getByText("Greek Yogurt Plain").first().click();
  await page.getByRole("button", { name: "Add to log" }).click();

  // Verify
  await expect(page.getByText("Entry added").or(page.getByText("Food log saved"))).toBeVisible();
});

// Update the third test similarly (add navigation + click "Add Log")