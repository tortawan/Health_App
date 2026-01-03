import path from "node:path";
import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_EMAIL || "test@example.com";
const TEST_PASSWORD = process.env.PLAYWRIGHT_PASSWORD || "password123";

test("image draft to confirmed log flow", async ({ page }) => {
  await page.goto("/");

  // Handle login if redirected
  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign in")');
  }

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

  // Upload the dummy image
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);

  // Verify UI and Confirm
  await expect(page.getByText("Draft entries")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  
  // Verify Success
  await expect(page.getByText("Entry added").or(page.getByText("Food log saved"))).toBeVisible();
  await expect(page.getByText("Mock Chicken Bowl")).toBeVisible();
});