import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_EMAIL || "tortawan@gmail.com";
const TEST_PASSWORD = process.env.PLAYWRIGHT_PASSWORD || "password123";

// Shared in-memory storage for the test session to handle re-fetches
let mockFoodLogs: any[] = [];

async function ensureLoggedIn(page: Page) {
  await page.goto("/");
  try {
    await page.waitForURL(/.*\/login/, { timeout: 3000 });
  } catch (_e) {
    // Already logged in or on home
  }

  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/"); 
  }
}

async function stubLogFood(page: Page) {
  await page.route("**/api/log-food", async (route) => {
    const postData = route.request().postDataJSON();
    
    const foodName = postData.foodName || postData.food_name;
    const weight = postData.weight || postData.weight_g;
    const consumedAt = postData.consumed_at || postData.date || new Date().toISOString();

    const mockEntry = {
        ...postData,
        id: crypto.randomUUID(),
        user_id: "test-user-id",
        food_name: foodName,
        weight_g: weight,
        calories: postData.manualMacros?.calories || postData.calories || 165,
        protein: postData.manualMacros?.protein || postData.protein || 31,
        carbs: postData.manualMacros?.carbs || postData.carbs || 0,
        fat: postData.manualMacros?.fat || postData.fat || 3.6,
        consumed_at: consumedAt,
        created_at: new Date().toISOString(),
        image_url: postData.image_url || "https://placehold.co/100x100.png",
        image_path: postData.image_path || "food-images/mock-path",
        meal_type: postData.meal_type || "snack",
        serving_size: postData.serving_size || 1,
        serving_unit: postData.serving_unit || "serving",
    };

    mockFoodLogs.push(mockEntry);
    
    await route.fulfill({
      status: 200, 
      contentType: "application/json",
      // ✅ Return Array in 'data' to match Supabase behavior
      body: JSON.stringify({
        data: [mockEntry],
        success: true
      }),
    });
  });

  // Handle GET requests (Refetching logs)
  await page.route(/.*(food_logs|get-logs).*/, async (route) => {
      if (route.request().method() === 'GET') {
          const isSupabaseDirect = route.request().url().includes('rest/v1');
          if (isSupabaseDirect) {
             await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockFoodLogs) });
          } else {
             await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: mockFoodLogs }) });
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
        body: JSON.stringify({ Key: objectPath, path: objectPath, id: "mock-id", fullPath: objectPath }),
      });
      return;
    }

    const accept = req.headers()["accept"] || "";
    if (/image/.test(accept)) {
      const buffer = fs.readFileSync(imageFixturePath);
      await route.fulfill({ status: 200, contentType: "image/png", body: buffer });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ Key: "mock-key", path: "mock-path", id: "mock-id", fullPath: "food-images/mock-path" }),
    });
  });
}

async function stubNextImage(page: Page) {
  const fs = await import("node:fs");
  const imageFixturePath = path.join(__dirname, "fixtures", "sample.png");
  await page.route("**/_next/image*", async (route) => {
    const buffer = fs.readFileSync(imageFixturePath);
    await route.fulfill({ status: 200, contentType: "image/png", body: buffer });
  });
}

test.beforeEach(() => {
    mockFoodLogs = [];
});

test("image draft to confirmed log flow", async ({ page }) => {
  await ensureLoggedIn(page);

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
  await stubNextImage(page);

  await page.getByRole("button", { name: "Add Log" }).click();
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);

  await expect(page.getByText("Draft entries")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Mock Chicken Bowl" })).toBeVisible();

  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page.getByText("Draft entries")).toBeHidden();
  await expect(page.getByText("Mock Chicken Bowl")).toBeVisible({ timeout: 10000 });
  
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

  await page.route("**/rest/v1/rpc/match_foods", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "match-2",
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
        draft: [{
            food_name: "Mystery Meat",
            weight: 200,
            ai_suggested_weight: 200,
            match: {
              id: "match-3",
              description: "Grilled chicken breast",
              calories: 165,
              protein: 31,
              carbs: 0,
              fat: 3.6,
              similarity: 0.75,
            },
        }],
      }),
    }),
  );
  await stubLogFood(page);
  await stubStorage(page);
  await stubNextImage(page);

  let correctionTriggered = false;
  await page.route("**/api/log-correction", (route) => {
    correctionTriggered = true;
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  await page.getByRole("button", { name: "Add Log" }).click();
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);
  await expect(page.getByText("Draft entries")).toBeVisible();

  await page.getByRole("button", { name: "Adjust weight" }).click();
  const weightInput = page.getByRole("spinbutton");
  await weightInput.fill("250");
  await page.getByRole("button", { name: "Done" }).click();

  const [logCorrectionRequest] = await Promise.all([
    page.waitForRequest("**/api/log-correction"),
    page.getByRole("button", { name: "Confirm", exact: true }).click(),
  ]);

  expect(logCorrectionRequest).toBeTruthy();
  expect(correctionTriggered).toBeTruthy();
});