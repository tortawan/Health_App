import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_EMAIL || "tortawan@gmail.com";
const TEST_PASSWORD = process.env.PLAYWRIGHT_PASSWORD || "password123";

async function ensureLoggedIn(page: Page) {
  // 1. Navigate to home
  await page.goto("/");

  // 2. Check if we need to log in
  try {
    // Give it a moment to redirect
    await page.waitForURL(/.*\/login/, { timeout: 3000 });
  } catch (_e) {
    // If not redirected, maybe we are already logged in or on home
  }

  // 3. If on login page, perform login
  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign in")');
    
    // 4. Wait until we land on the dashboard
    await page.waitForURL("**/"); 
  }
}

async function stubLogFood(page: Page) {
  await page.route("**/api/log-food", async (route) => {
    const postData = route.request().postDataJSON();
    
    // Fix: Handle both camelCase (foodName) and snake_case (food_name)
    const foodName = postData.foodName || postData.food_name;
    const weight = postData.weight || postData.weight_g;

    // Create a complete mock response object
    const mockEntry = {
        ...postData,
        id: crypto.randomUUID(),
        food_name: foodName,
        weight_g: weight,
        calories: postData.manualMacros?.calories || postData.calories || null,
        protein: postData.manualMacros?.protein || postData.protein || null,
        carbs: postData.manualMacros?.carbs || postData.carbs || null,
        fat: postData.manualMacros?.fat || postData.fat || null,
        consumed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        // ✅ CRITICAL FIX: Ensure both image_url and image_path are present.
        image_url: postData.image_url || "https://placehold.co/100x100.png",
        image_path: postData.image_path || "food-images/mock-path",
        // ✅ Ensure meal_type exists (often required for rendering lists)
        meal_type: postData.meal_type || "snack",
    };
    
    await route.fulfill({
      status: 200, // Revert to 200 to be safe (some clients strict check for 200)
      contentType: "application/json",
      // ✅ Return a structure that handles common API patterns:
      body: JSON.stringify({
        success: true,
        message: "Entry added", 
        data: mockEntry, 
        ...mockEntry,   
      }),
    });
  });
}

async function stubStorage(page: Page) {
  const fs = await import("node:fs");
  const imageFixturePath = path.join(__dirname, "fixtures", "sample.png");
  await page.route("**/storage/v1/object/**", async (route) => {
    const req = route.request();
    const objectPath = req.url().split("/storage/v1/object/")[1] ?? "public/mock-key";

    if (req.method() === "POST" || req.method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Key: objectPath,
          path: objectPath,
          id: "mock-id",
          fullPath: objectPath,
        }),
      });
      return;
    }

    const accept = req.headers()["accept"] || "";
    if (/image/.test(accept)) {
      const buffer = fs.readFileSync(imageFixturePath);
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: buffer,
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        Key: "mock-key",
        path: "mock-path",
        id: "mock-id",
        fullPath: "food-images/mock-path",
      }),
    });
  });
}

// ✅ NEW: Intercept Next.js image optimization requests
// This prevents the "upstream image response failed" error by serving the local file
// directly to the browser, bypassing the server-side fetch to Supabase.
async function stubNextImage(page: Page) {
  const fs = await import("node:fs");
  const imageFixturePath = path.join(__dirname, "fixtures", "sample.png");
  
  await page.route("**/_next/image*", async (route) => {
    const buffer = fs.readFileSync(imageFixturePath);
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: buffer,
    });
  });
}

test("image draft to confirmed log flow", async ({ page }) => {
  await ensureLoggedIn(page);

  // Stub the analyze endpoint
  await page.route("**/api/analyze", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: [
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
  // ✅ Enable the image optimizer stub
  await stubNextImage(page);

  // 1. Open Scanner
  await page.getByRole("button", { name: "Add Log" }).click();

  // 2. Upload Image
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);

  // 3. Wait for Draft Screen (this confirms upload & analyze worked)
  // We use a broader timeout here because image processing can simulate delays
  await expect(page.getByText("Draft entries")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Mock Chicken Bowl" })).toBeVisible();

  // 4. Confirm
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  // 5. Verify Success
  // Step 5a: Ensure the draft screen goes away (confirms navigation/state change)
  await expect(page.getByText("Draft entries")).toBeHidden();

  // Step 5b: Verify the item appears in the list (Persistent Success)
  // We check this FIRST because it's the most important outcome.
  await expect(page.getByText("Mock Chicken Bowl")).toBeVisible();

  // Step 5c: Verify toast (Transient Success)
  // We check this last. If the item is there but toast is missed, it's less critical.
  await expect(
    page.getByText("Entry added")
      .or(page.getByText("Food log saved"))
      .or(page.getByText("Success"))
      .or(page.getByText("Saved"))
  ).toBeVisible();
});

test("manual search fallback flow", async ({ page }) => {
  await ensureLoggedIn(page);
  await stubLogFood(page);
  // We also stub images here in case the search results have thumbnails
  await stubNextImage(page);

  // Stub search RPC
  await page.route("**/rest/v1/rpc/match_foods", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          description: "Greek Yogurt Plain",
          kcal_100g: 59,
          protein_100g: 10,
          carbs_100g: 3.6,
          fat_100g: 0.4,
          similarity: 0.99,
          text_rank: 1.0,
        },
      ]),
    }),
  );

  // 1. Click Manual Add directly (this relies on home-client -1 fix)
  await page.getByRole("button", { name: "Manual Add" }).click();

  // 2. Fill Search
  // Ensure we match the placeholder used in ManualSearchModal.tsx
  await page.getByPlaceholder("Search for a food (e.g., grilled chicken)").fill("Greek Yogurt");
   
  // FIX: Must CLICK SEARCH button (Automatic search on type is not implemented)
  await page.getByRole("button", { name: "Search" }).click();

  // 3. Select Result
  await page.getByText("Greek Yogurt Plain").first().click();

  // 4. Add to Log
  await page.getByRole("button", { name: "Add to log" }).click();

  // 5. Verify
  // Step 5a: Ensure we left the search modal
  await expect(page.getByRole("button", { name: "Add to log" })).toBeHidden();

  // Step 5b: Verify item
  await expect(page.getByText("Greek Yogurt")).toBeVisible();
  
  // Step 5c: Verify toast
  await expect(
    page.getByText("Entry added")
      .or(page.getByText("Food log saved"))
      .or(page.getByText("Success"))
      .or(page.getByText("Saved"))
  ).toBeVisible();
});

test("logs a correction when weight changes before confirm", async ({ page }) => {
  await ensureLoggedIn(page);

  await page.route("**/api/analyze", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: [
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
  // ✅ Enable the image optimizer stub
  await stubNextImage(page);

  // Spy on correction API
  let correctionTriggered = false;
  await page.route("**/api/log-correction", (route) => {
    correctionTriggered = true;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // 1. Open Scanner & Upload
  await page.getByRole("button", { name: "Add Log" }).click();
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);

  // 2. Wait for Drafts
  await expect(page.getByText("Draft entries")).toBeVisible();

  // 3. Adjust Weight
  await page.getByRole("button", { name: "Adjust weight" }).click();
   
  // Use generic spinbutton selector for number input
  const weightInput = page.getByRole("spinbutton");
  await weightInput.fill("250");
  await expect(weightInput).toHaveValue("250");

  await page.getByRole("button", { name: "Done" }).click();

  // 4. Confirm & Verify Correction Logged
  const [logCorrectionRequest] = await Promise.all([
    page.waitForRequest("**/api/log-correction"),
    page.getByRole("button", { name: "Confirm", exact: true }).click(),
  ]);

  expect(logCorrectionRequest).toBeTruthy();
  expect(correctionTriggered).toBeTruthy();
});