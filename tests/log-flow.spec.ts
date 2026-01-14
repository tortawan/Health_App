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
    await page.waitForURL("**/#"); 
  }
}

async function stubLogFood(page: Page) {
  await page.route("**/api/log-food", async (route) => {
    const postData = route.request().postDataJSON();
    
    // Fix: Handle both camelCase (foodName) and snake_case (food_name)
    const foodName = postData.foodName || postData.food_name;
    const weight = postData.weight || postData.weight_g;

    // ✅ CRITICAL FIX: Return proper FoodLogRecord structure
    // This MUST match what your frontend expects in result.data
    const mockEntry = {
        id: crypto.randomUUID(),
        user_id: "test-user-id",
        food_name: foodName,
        weight_g: weight,
        calories: postData.manualMacros?.calories || postData.calories || 165,
        protein: postData.manualMacros?.protein || postData.protein || 31,
        carbs: postData.manualMacros?.carbs || postData.carbs || 0,
        fat: postData.manualMacros?.fat || postData.fat || 3.6,
        consumed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        image_url: postData.image_url || "https://placehold.co/100x100.png",
        image_path: postData.image_path || "food-images/mock-path",
        meal_type: postData.meal_type || "snack",
    };
    
    // ✅ CRITICAL FIX: Return response in proper structure
    // Frontend expects: result.data to contain the FoodLogRecord
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: mockEntry,  // Wrap in data property only (not flattened)
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

// ✅ Intercept Next.js image optimization requests
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
              id: "match-1",
              food_name: "Grilled Chicken Bowl",
              description: "Grilled chicken breast with rice",
              calories: 165,
              protein: 31,
              carbs: 0,
              fat: 3.6,
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
  // ✅ CRITICAL FIX: This should now work because the mock returns proper data structure
  await expect(page.getByText("Mock Chicken Bowl")).toBeVisible({ timeout: 10000 });

  // Step 5c: Verify toast (Transient Success)
  // We check this last. If the item is there but toast is missed, it's less critical.
  // ✅ Match the actual toast message from home-client.tsx line 283
  await expect(
    page.getByText("Food log saved")
      .or(page.getByText("Entry added"))
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
          id: "match-2",
          food_name: "Greek Yogurt Plain",
          description: "Greek Yogurt Plain",
          calories: 59,
          protein: 10,
          carbs: 3.6,
          fat: 0.4,
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
    page.getByText("Food log saved")
      .or(page.getByText("Entry added"))
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
            ai_suggested_weight: 200,
            match: {
              id: "match-3",
              food_name: "Grilled Chicken",
              description: "Grilled chicken breast",
              calories: 165,
              protein: 31,
              carbs: 0,
              fat: 3.6,
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