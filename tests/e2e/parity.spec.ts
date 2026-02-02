import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_EMAIL || "tortawan@gmail.com";
const TEST_PASSWORD = process.env.PLAYWRIGHT_PASSWORD || "password123";

async function ensureLoggedIn(page: Page) {
  await page.goto("/");
  try {
    await page.waitForURL(/.*\/login/, { timeout: 3000 });
  } catch {
    // Already logged in
  }

  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/");
  }
}

test.describe("Feature Parity Verification", () => {
  test.beforeEach(async ({ page }) => {
    // Stub tracking to avoid real DB calls during parity tests
    await page.route("**/actions/tracking", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "mock-water-id", amount_ml: 500, logged_at: new Date().toISOString() }),
      });
    });

    await ensureLoggedIn(page);
  });

  test("Water Tracker: log, display, and goal progress", async ({ page }) => {
    await expect(page.getByText("Hydration tracker")).toBeVisible();
    
    const waterInput = page.locator('input[type="number"]').first();
    await waterInput.fill("500");
    await page.getByRole("button", { name: "Add water" }).click();

    // Avoid strict mode violation by looking for the specific text inside the "Recent entries" section
    // or by using nth(0) or filtering by class.
    const entry = page.locator('section').filter({ hasText: 'Water' }).locator('p').filter({ hasText: /^500 ml$/ }).first();
    await expect(entry).toBeVisible();
    
    await expect(page.getByText("25% of goal")).toBeVisible();
  });

  test("Manual Search: trigger modal and select result", async ({ page }) => {
    // Open manual search
    await page.getByRole("button", { name: "Manual Add" }).click();
    
    // Stub search results
    await page.route("**/api/search*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { description: "Blueberries", kcal_100g: 57, protein_100g: 0.7, carbs_100g: 14, fat_100g: 0.3 }
        ]),
      });
    });

    const searchInput = page.getByPlaceholder("Search for food...");
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill("Blueberry");
    await page.keyboard.press("Enter");

    // Select result and verify it enters draft review
    await page.getByText("Blueberries").first().click();
    await expect(page.getByText("Draft entries")).toBeVisible();
    await expect(page.locator("p").filter({ hasText: "Blueberries" })).toBeVisible();
  });

  test("Template Manager: ensure UI access", async ({ page }) => {
    await page.getByRole("button", { name: "Add Log" }).click();
    
    // Locate the manage favorites/templates button
    const manageBtn = page.getByRole("button", { name: /Manage templates|favorites/i });
    await expect(manageBtn).toBeVisible();
    await manageBtn.click();
    
    await expect(page.getByText("Meal templates", { exact: true })).toBeVisible();
  });

  test("Date Shifting: ensure navigation works", async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const initialUrl = page.url();
    
    // Click navigation (Previous Day)
    const prevBtn = page.locator('button').filter({ hasText: /<|Previous/ });
    await expect(prevBtn).toBeVisible();
    await prevBtn.click();
    
    // Check that date param is present and URL changed
    await expect(page).toHaveURL(/.*date=.*/);
    expect(page.url()).not.toBe(initialUrl);
  });
});