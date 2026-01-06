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
  await page.route("**/api/log-food", async (route) => {
    const postData = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        food_name: postData.foodName, // ✅ Echo the actual name from request
        weight_g: postData.weight,
        calories: postData.manualMacros?.calories || null,
        protein: postData.manualMacros?.protein || null,
        carbs: postData.manualMacros?.carbs || null,
        fat: postData.manualMacros?.fat || null,
        consumed_at: new Date().toISOString(),
      }),
    });
  });
}

// Mock Supabase Storage to prevent "Uploading photo..." state from hanging
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
            match: {
              description: "Grilled chicken breast with rice",
              kcal_100g: 165,
              protein_100g: 31,
              carbs_100g: 0,
              fat_100g: 3.6,
              similarity: 0.95,
            },
          },
        ],
      }),
    }),
  );
  await stubLogFood(page);
  await stubStorage(page);

  // Upload
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);

  // Check Draft
  const modal = page.locator("section").filter({ hasText: "Capture" });
  await expect(modal.getByText("Draft entries")).toBeVisible();
  await expect(modal.getByRole("heading", { name: "Mock Chicken Bowl" })).toBeVisible();

  // Confirm
  await modal.getByRole("button", { name: "Confirm", exact: true }).click();

  // Verify Success
  await expect(page.getByText("Entry added").or(page.getByText("Food log saved"))).toBeVisible();
  // ✅ CHANGED: Expect text visibility instead of heading role, because DailyLogList renders as <p>
  await expect(page.getByText("Mock Chicken Bowl")).toBeVisible();
});

test("manual search fallback flow", async ({ page }) => {
  await ensureLoggedIn(page);
  await stubLogFood(page);

  // Mock search results
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          description: "Greek Yogurt Plain",
          score: 1.0,
          foodNutrients: [
            { nutrientId: 1008, value: 59 }, // kcal
            { nutrientId: 1003, value: 10 }, // protein
          ],
        },
      ]),
    }),
  );

  await page.getByRole("button", { name: "Add Log" }).click();
  await page.getByRole("button", { name: "Manual Add" }).click();

  // Search
  await page.getByPlaceholder("Search food...").fill("Greek Yogurt");
  await page.getByText("Greek Yogurt Plain").first().click();

  // Confirm
  await page.getByRole("button", { name: "Add to log" }).click();

  // 4. Verify Toast and List
  // This now works because stubLogFood returns the requested name
  await expect(page.getByText("Entry added").or(page.getByText("Food log saved"))).toBeVisible();
  await expect(page.getByText("Greek Yogurt")).toBeVisible();
});

test("logs a correction when weight changes before confirm", async ({ page }) => {
  await ensureLoggedIn(page);

  // Stub partial match needing correction
  await page.route("**/api/analyze", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        foods: [
          {
            food_name: "Mystery Meat",
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
  await stubStorage(page);

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

  // Scope to modal to ensure we click the interactive element
  const modal = page.locator(".fixed").filter({ hasText: "Is this correct?" });
  await expect(modal).toBeVisible();

  await expect(modal.getByText("Draft entries")).toBeVisible();
  await modal.getByRole("button", { name: "Adjust weight" }).click();
  
  const weightInput = modal.getByLabel(/Adjust weight/);
  await weightInput.fill("250");
  
  // ✅ CRITICAL FIX: Wait for the value to actually be "250" before clicking Done.
  // This prevents race conditions where the UI hasn't processed the input event yet.
  await expect(weightInput).toHaveValue("250");

  await modal.getByRole("button", { name: "Done" }).click();

  const [logCorrectionRequest] = await Promise.all([
    page.waitForRequest("**/api/log-correction"),
    modal.getByRole("button", { name: "Confirm", exact: true }).click(),
  ]);

  expect(logCorrectionRequest).toBeTruthy();
  expect(correctionTriggered).toBeTruthy();
});