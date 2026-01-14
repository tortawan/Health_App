import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_EMAIL || "tortawan@gmail.com";
const TEST_PASSWORD = process.env.PLAYWRIGHT_PASSWORD || "password123";

// Shared in-memory storage for the test session to handle re-fetches
let mockFoodLogs: any[] = [];

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
  // 1. Handle POST (Adding food)
  await page.route("**/api/log-food", async (route) => {
    console.log("Stub: Intercepted POST /api/log-food"); // DEBUG LOG
    const postData = route.request().postDataJSON();
    
    // Fix: Handle both camelCase (foodName) and snake_case (food_name)
    const foodName = postData.foodName || postData.food_name;
    const weight = postData.weight || postData.weight_g;
    
    // Fix: Respect the date sent by frontend, fallback to now only if missing.
    const consumedAt = postData.consumed_at || postData.date || new Date().toISOString();

    // Create a complete mock response object
    const mockEntry = {
        ...postData,
        id: crypto.randomUUID(),
        user_id: postData.user_id || "mock-user-id", 
        food_name: foodName,
        weight_g: weight,
        calories: postData.manualMacros?.calories || postData.calories || null,
        protein: postData.manualMacros?.protein || postData.protein || null,
        carbs: postData.manualMacros?.carbs || postData.carbs || null,
        fat: postData.manualMacros?.fat || postData.fat || null,
        consumed_at: consumedAt,
        created_at: new Date().toISOString(),
        // ✅ UPDATED: Use the real Supabase URL provided
        image_url: postData.image_url || "https://eypxeqldfilsvapibigm.supabase.co/storage/v1/object/public/food-photos/7b838bba-7b64-4f11-8a04-44c551decb6e-sample.png",
        image_path: postData.image_path || "food-images/mock-path",
        meal_type: postData.meal_type || "snack",
        serving_size: postData.serving_size || 1,
        serving_unit: postData.serving_unit || "serving",
    };

    // Add to in-memory store for GET requests
    mockFoodLogs.push(mockEntry);
    console.log("Stub: Added entry to mock DB. Total entries:", mockFoodLogs.length); // DEBUG LOG
    
    await route.fulfill({
      status: 200, 
      contentType: "application/json",
      // ✅ UPDATED: Strictly wrap response in 'data' object AND make it an array.
      // Supabase insert() typically returns an array of rows: { data: [entry], error: null }
      body: JSON.stringify({
        data: [mockEntry],
        error: null 
      }),
    });
  });

  // 2. Handle GET (Fetching logs)
  // Catches any request containing "food_logs" (Supabase) or "get-logs" (API)
  await page.route(/.*(food_logs|get-logs).*/, async (route) => {
      if (route.request().method() === 'GET') {
          console.log("Stub: Intercepted GET food_logs/get-logs. Returning:", mockFoodLogs.length, "items");
          
          // Helper: Supabase direct REST API returns Array, Next.js API usually returns { data: Array }
          const isSupabaseDirect = route.request().url().includes('rest/v1');

          if (isSupabaseDirect) {
             await route.fulfill({
                  status: 200,
                  contentType: "application/json",
                  body: JSON.stringify(mockFoodLogs),
              });
          } else {
             await route.fulfill({
                  status: 200,
                  contentType: "application/json",
                  body: JSON.stringify({ data: mockFoodLogs }),
              });
          }
      } else {
          await route.continue();
      }
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

test.beforeEach(() => {
    // Clear mock logs before each test
    mockFoodLogs = [];
});

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
  await stubNextImage(page);

  // 1. Open Scanner
  await page.getByRole("button", { name: "Add Log" }).click();

  // 2. Upload Image
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);

  // 3. Wait for Draft Screen (this confirms upload & analyze worked)
  await expect(page.getByText("Draft entries")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Mock Chicken Bowl" })).toBeVisible();

  // 4. Confirm
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  // 5. Verify Success
  await expect(page.getByText("Draft entries")).toBeHidden();
  await expect(page.getByText("Mock Chicken Bowl")).toBeVisible();
  
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

  await page.getByRole("button", { name: "Manual Add" }).click();
  await page.getByPlaceholder("Search for a food (e.g., grilled chicken)").fill("Greek Yogurt");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByText("Greek Yogurt Plain").first().click();
  await page.getByRole("button", { name: "Add to log" }).click();

  await expect(page.getByRole("button", { name: "Add to log" })).toBeHidden();
  await expect(page.getByText("Greek Yogurt")).toBeVisible();
  
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
  await stubNextImage(page);

  let correctionTriggered = false;
  await page.route("**/api/log-correction", (route) => {
    correctionTriggered = true;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.getByRole("button", { name: "Add Log" }).click();
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);
  await expect(page.getByText("Draft entries")).toBeVisible();

  await page.getByRole("button", { name: "Adjust weight" }).click();
  const weightInput = page.getByRole("spinbutton");
  await weightInput.fill("250");
  await expect(weightInput).toHaveValue("250");
  await page.getByRole("button", { name: "Done" }).click();

  const [logCorrectionRequest] = await Promise.all([
    page.waitForRequest("**/api/log-correction"),
    page.getByRole("button", { name: "Confirm", exact: true }).click(),
  ]);

  expect(logCorrectionRequest).toBeTruthy();
  expect(correctionTriggered).toBeTruthy();
});