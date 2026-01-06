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
    
    // Added 'await' here
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        food_name: postData.foodName,
        weight_g: postData.weight,
        // These fallbacks are excellent for keeping the UI clean
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
      body: JSON.stringify({
        path: "uploads/mock-image.webp",
        id: "mock-id",
        fullPath: "user-images/uploads/mock-image.webp",
      }),
    })
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
  await stubStorage(page);

  // Upload the dummy image
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);

  // Verify UI and Confirm
  // We explicitly target the modal to avoid strict mode violations (duplicate DraftReview)
  const modal = page.locator(".fixed").filter({ hasText: "Is this correct?" });
  await expect(modal).toBeVisible();
  
  await expect(modal.getByText("Draft entries")).toBeVisible();
  // Use exact: true to avoid matching "Confirm all" which might be disabled
  await modal.getByRole("button", { name: "Confirm", exact: true }).click();
  
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
  await page.getByPlaceholder("Oreo cookie").fill("Greek Yogurt");
  
  // Use getByLabel("Calories") to ensure we fill the correct input.
  // Using input[type="number"] was finding the "Height" field in the profile section first.
  await page.getByLabel("Calories").fill("120");

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
  await modal.getByLabel(/Adjust weight/).fill("250");
  await modal.getByRole("button", { name: "Done" }).click();

  const [logCorrectionRequest] = await Promise.all([
    page.waitForRequest("**/api/log-correction"),
    modal.getByRole("button", { name: "Confirm", exact: true }).click(),
  ]);

  expect(logCorrectionRequest).toBeTruthy();
  expect(correctionTriggered).toBeTruthy();
});