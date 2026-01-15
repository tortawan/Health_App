import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  enableApiLogging,
  logPageState,
  logAllVisibleText,
  searchForText,
  monitorApiCall,
  assertWithDebug,
  waitForWithDebug,
  debugScreenshot,
  DEBUG_CONFIG,
} from "./debug-helpers";

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
    const method = route.request().method();

    if (method === "GET") {
      console.log(
        `${DEBUG_CONFIG.LOG_PREFIX} [STUB] GET /api/log-food - Returning ${mockFoodLogs.length} logs`
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: mockFoodLogs,
          success: true,
        }),
      });
      return;
    }

    if (method !== "POST") {
      await route.continue();
      return;
    }

    const postData = route.request().postDataJSON();

    // ===== FIX #1: ENHANCED LOGGING =====
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} [STUB] /api/log-food called`);
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} [STUB] postData keys:`, Object.keys(postData));
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} [STUB] postData:`, JSON.stringify(postData, null, 2));

    const foodName = postData.foodName || postData.food_name;
    const weight = postData.weight || postData.weight_g;
    const consumedAt = postData.consumed_at || postData.date || new Date().toISOString();

    console.log(
      `${DEBUG_CONFIG.LOG_PREFIX} [STUB] Extracted foodName: "${foodName}" (type: ${typeof foodName})`
    );
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} [STUB] Extracted weight: ${weight}`);

    // ===== FIX #2: ENSURE FALLBACK VALUES =====
    const mockEntry = {
      ...postData,
      id: crypto.randomUUID(),
      user_id: "test-user-id",
      food_name: foodName || "Unknown Food",
      weight_g: weight || 100,
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

    console.log(
      `${DEBUG_CONFIG.LOG_PREFIX} [STUB] Created mock entry with food_name: "${mockEntry.food_name}"`
    );
    mockFoodLogs.push(mockEntry);
    console.log(
      `${DEBUG_CONFIG.LOG_PREFIX} [STUB] mockFoodLogs now contains ${mockFoodLogs.length} items: ${mockFoodLogs.map((l) => l.food_name).join(", ")}`
    );

    const responseBody = {
      data: [mockEntry],
      success: true,
    };
    console.log(
      `${DEBUG_CONFIG.LOG_PREFIX} [STUB] Responding with:`,
      JSON.stringify(responseBody, null, 2)
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    });
  });

  // Handle GET requests (Refetching logs)
  await page.route(/.*(food_logs|get-logs).*/, async (route) => {
    if (route.request().method() === "GET") {
      console.log(
        `${DEBUG_CONFIG.LOG_PREFIX} [STUB] GET request to ${route.request().url()}`
      );
      console.log(
        `${DEBUG_CONFIG.LOG_PREFIX} [STUB] Returning ${mockFoodLogs.length} mock logs`
      );
      const isSupabaseDirect = route.request().url().includes("rest/v1");
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
      await route.fulfill({ status: 200, contentType: "image/png", body: buffer });
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
    await route.fulfill({ status: 200, contentType: "image/png", body: buffer });
  });
}

test.beforeEach(() => {
  mockFoodLogs = [];
});

test("[DEBUG] image draft to confirmed log flow", async ({ page }) => {
  // Enable all debugging
  DEBUG_CONFIG.ENABLE_API_LOGGING = true;
  DEBUG_CONFIG.ENABLE_STATE_LOGGING = true;
  DEBUG_CONFIG.ENABLE_ELEMENT_LOGGING = true;

  enableApiLogging(page);
  monitorApiCall(page, "/api/log-food");

  await ensureLoggedIn(page);
  await logPageState(page, "After login");

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
    })
  );

  await stubLogFood(page);
  await stubStorage(page);
  await stubNextImage(page);

  // Step 1: Click "Add Log"
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} === STEP 1: Click Add Log ===`);
  await page.getByRole("button", { name: "Add Log" }).click();
  await logPageState(page, "After clicking Add Log");

  // Step 2: Upload image
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} === STEP 2: Upload image ===`);
  const imagePath = path.join(__dirname, "fixtures", "sample.png");
  await page.setInputFiles('input[type="file"]', imagePath);
  await logPageState(page, "After uploading image");
  await page.waitForTimeout(2000);

  // Step 3: Verify draft appears
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} === STEP 3: Verify draft entries ===`);
  await logAllVisibleText(page);
  await searchForText(page, "Mock Chicken Bowl");
  await waitForWithDebug(
    page,
    page.getByText("Draft entries"),
    "Draft entries section",
    10000
  );

  // Step 4: Verify heading
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} === STEP 4: Verify Mock Chicken Bowl heading ===`);
  await waitForWithDebug(
    page,
    page.getByRole("heading", { name: "Mock Chicken Bowl" }),
    "Mock Chicken Bowl heading",
    10000
  );
  await debugScreenshot(page, "after-draft-appears");

  // Step 5a: Click Confirm
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} === STEP 5a: Click Confirm button ===`);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await logPageState(page, "After clicking Confirm");

  // ===== FIX #3: WAIT FOR STATE CHANGE, NOT JUST TIMEOUT =====
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} === STEP 5a-fix: Waiting for draft to disappear ===`);
  try {
    await page.getByText("Draft entries").waitFor({ state: "hidden", timeout: 10000 });
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ✅ Draft section disappeared`);
  } catch (e) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ⚠️ Draft section still visible or not found`);
  }

  // Step 5b: Verify draft section disappears
  console.log(
    `${DEBUG_CONFIG.LOG_PREFIX} === STEP 5b: Verify draft entries disappear ===`
  );
  await logAllVisibleText(page);
  await assertWithDebug(
    page,
    page.getByText("Draft entries"),
    "hidden",
    10000
  );

  // ===== FIX #4: VERIFY STATE UPDATE COMPLETED =====
  console.log(
    `${DEBUG_CONFIG.LOG_PREFIX} === STEP 5b-fix: Verifying state update completed ===`
  );
  await page.waitForTimeout(500);
  await logPageState(page, "After draft disappeared");
  await logAllVisibleText(page, "Before checking confirmed logs");

  // Step 5c: THE CRITICAL ASSERTION - Verify item appears in confirmed logs
  console.log(
    `${DEBUG_CONFIG.LOG_PREFIX} === STEP 5c: CRITICAL - Verify Mock Chicken Bowl in confirmed logs ===`
  );
  console.log(
    `${DEBUG_CONFIG.LOG_PREFIX} Current mockFoodLogs state: ${JSON.stringify(mockFoodLogs)}`
  );
  await logAllVisibleText(page);
  await searchForText(page, "Mock Chicken Bowl");
  await debugScreenshot(page, "before-final-assertion");

  // ===== FIX #5: USE WAIT FOR INSTEAD OF DIRECT ASSERTION =====
  console.log(
    `${DEBUG_CONFIG.LOG_PREFIX} === STEP 5c-fix: Waiting for Mock Chicken Bowl with timeout ===`
  );
  try {
    // Try to navigate to logs section:
	await page.getByText("Today").click();
	// or
	await page.getByRole('heading', { name: /today/i }).scrollIntoViewIfNeeded();
    await page.getByText("Mock Chicken Bowl").waitFor({ timeout: 20000 });
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ✅ Mock Chicken Bowl found in DOM`);
  } catch (error) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ❌ Mock Chicken Bowl NOT found in DOM after 10s`);
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Page has ${mockFoodLogs.length} mock entries`);
    if (mockFoodLogs.length > 0) {
      console.log(
        `${DEBUG_CONFIG.LOG_PREFIX} Mock entries: ${mockFoodLogs.map((l) => l.food_name).join(", ")}`
      );
    }
    throw error;
  }

  // Final assertion with full context
  try {
    await assertWithDebug(
      page,
      page.getByText("Mock Chicken Bowl"),
      "visible",
      10000
    );
  } catch (error) {
    console.log(
      `${DEBUG_CONFIG.LOG_PREFIX} ❌ FAILED: Mock Chicken Bowl not visible`
    );
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} This suggests the log-food API response or state update failed`);
    throw error;
  }

  // Step 5d: Verify toast
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} === STEP 5d: Verify success toast ===`);
  await assertWithDebug(
    page,
    page
      .getByText("Entry added")
      .or(page.getByText("Food log saved"))
      .or(page.getByText("Success"))
      .or(page.getByText("Saved")),
    "visible",
    5000
  );

  console.log(`${DEBUG_CONFIG.LOG_PREFIX} ✅ TEST PASSED`);
});
