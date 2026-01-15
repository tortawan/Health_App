import { Page, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const DEBUG_CONFIG = {
  ENABLE_API_LOGGING: true,
  ENABLE_STATE_LOGGING: true,
  ENABLE_ELEMENT_LOGGING: true,
  LOG_PREFIX: "[DEBUG]",
};

export function enableApiLogging(page: Page) {
  if (!DEBUG_CONFIG.ENABLE_API_LOGGING) return;

  page.on("request", (request) => {
    // Filter out static assets and unimportant requests
    if (
      request.resourceType() === "image" ||
      request.resourceType() === "stylesheet" ||
      request.resourceType() === "font" ||
      request.url().includes("favicon.ico") ||
      request.url().includes("_next/static")
    ) {
      return;
    }
    console.log(
      `${DEBUG_CONFIG.LOG_PREFIX} [REQUEST] ${request.method()} ${request.url()}`
    );
    
    // SAFE PARSING: Only attempt to log JSON body if it's actually JSON and doesn't crash
    try {
      const postData = request.postDataJSON();
      if (postData) {
        console.log(
          `${DEBUG_CONFIG.LOG_PREFIX} [REQUEST BODY]`,
          JSON.stringify(postData, null, 2)
        );
      }
    } catch (e) {
      // It's likely multipart form data or binary, which isn't valid JSON.
      // We can just ignore the body log or log a note.
      // console.log(`${DEBUG_CONFIG.LOG_PREFIX} [REQUEST BODY] (Non-JSON data)`);
    }
  });

  page.on("response", async (response) => {
    const request = response.request();
    if (
      request.resourceType() === "image" ||
      request.resourceType() === "stylesheet" ||
      request.resourceType() === "font" ||
      request.url().includes("favicon.ico") ||
      request.url().includes("_next/static")
    ) {
      return;
    }

    try {
      console.log(
        `${DEBUG_CONFIG.LOG_PREFIX} [RESPONSE] ${response.status()} ${response.url()}`
      );
      if (
        response.headers()["content-type"]?.includes("application/json") &&
        response.ok()
      ) {
        const body = await response.json();
        console.log(
          `${DEBUG_CONFIG.LOG_PREFIX} [RESPONSE BODY]`,
          JSON.stringify(body, null, 2)
        );
      }
    } catch (e) {
      // Ignore errors parsing response body
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`${DEBUG_CONFIG.LOG_PREFIX} [BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });
}

export async function logPageState(page: Page, label: string) {
  if (!DEBUG_CONFIG.ENABLE_STATE_LOGGING) return;

  console.log(`\n${DEBUG_CONFIG.LOG_PREFIX} ===== PAGE STATE: ${label} =====`);
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Current URL: ${page.url()}`);

  try {
    const state = await page.evaluate(() => {
      // Helper to safely get text content
      const getText = (selector: string) => {
        try {
          const el = document.querySelector(selector);
          return el ? (el.textContent?.trim().substring(0, 100) || "") : "NOT FOUND";
        } catch (e) {
          return "INVALID SELECTOR";
        }
      };

      // Helper to check visibility
      const isVisible = (selector: string) => {
        try {
          const el = document.querySelector(selector);
          return el ? (el.getBoundingClientRect().height > 0) : false;
        } catch (e) {
          return false;
        }
      };

      // Helper to find text content (replaces 'text=' selector)
      const hasVisibleText = (text: string) => {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
           // Basic check: looks for exact text or close to it in direct text nodes
           if (el.textContent?.includes(text) && el.getBoundingClientRect().height > 0) {
             return true;
           }
        }
        return false;
      };

      // Get all headings to understand page structure
      const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map(
        (h) => h.textContent?.trim()
      );

      // Get all buttons
      const buttons = Array.from(document.querySelectorAll("button")).map((b) => ({
        text: b.textContent?.trim(),
        disabled: b.disabled,
        visible: b.getBoundingClientRect().height > 0,
      }));

      // Get key elements specific to our app
      // FIXED: Replaced Playwright 'text=' selectors with manual text search or standard CSS
      const criticalElements = {
        "Draft entries": hasVisibleText("Draft entries"),
        "Add Log button": Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('Add Log')),
        "Upload input": isVisible('input[type="file"]'),
        "Toast message": getText("[role='status'], .toast, [class*='toast']"),
      };
      
      return { headings, buttons, criticalElements };
    });

    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Headings:`, state.headings);
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Buttons:`, JSON.stringify(state.buttons.slice(0, 5), null, 2));
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Critical Elements:`, JSON.stringify(state.criticalElements, null, 2));
    
  } catch (e) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Error logging page state:`, e);
  }
}

export async function logAllVisibleText(page: Page) {
  if (!DEBUG_CONFIG.ENABLE_ELEMENT_LOGGING) return;
  
  try {
    const text = await page.evaluate(() => document.body.innerText);
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} [VISIBLE TEXT START]`);
    console.log(text.split('\n').filter(line => line.trim().length > 0).join('\n'));
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} [VISIBLE TEXT END]`);
  } catch (e) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Failed to log visible text: ${e}`);
  }
}

export async function searchForText(page: Page, text: string) {
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Searching for text: "${text}"...`);
  const isVisible = await page.getByText(text).first().isVisible().catch(() => false);
  
  if (isVisible) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} \u2705 Found text: "${text}"`);
    // Log the bounding box and exact text
    const elementInfo = await page.getByText(text).first().evaluate(el => ({
      tagName: el.tagName,
      text: el.textContent,
      rect: el.getBoundingClientRect()
    }));
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Element details:`, elementInfo);
  } else {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} \u274c Text NOT found: "${text}"`);
    
    // Try a more fuzzy search or regex
    const count = await page.getByText(new RegExp(text, 'i')).count();
    if (count > 0) {
      console.log(`${DEBUG_CONFIG.LOG_PREFIX} \u26a0\ufe0f Found ${count} matches with case-insensitive search.`);
    }
  }
}

export async function monitorApiCall(page: Page, urlPattern: string) {
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Monitoring API calls to: ${urlPattern}`);
  
  page.on('request', request => {
    if (request.url().includes(urlPattern)) {
      console.log(`${DEBUG_CONFIG.LOG_PREFIX} \u25b6\ufe0f MATCHED REQUEST: ${request.method()} ${request.url()}`);
    }
  });
  
  page.on('response', async response => {
    if (response.url().includes(urlPattern)) {
      console.log(`${DEBUG_CONFIG.LOG_PREFIX} \u25c0\ufe0f MATCHED RESPONSE: ${response.status()} ${response.url()}`);
      try {
        const body = await response.json();
        console.log(`${DEBUG_CONFIG.LOG_PREFIX} Body snippet:`, JSON.stringify(body).substring(0, 200) + '...');
      } catch (e) {
        // ignore
      }
    }
  });
}

export async function assertWithDebug(
  page: Page, 
  locator: any, 
  state: "visible" | "hidden" | "attached" | "detached", 
  timeout = 5000
) {
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Asserting ${state} (timeout: ${timeout}ms)...`);
  try {
    if (state === "visible") {
      await expect(locator).toBeVisible({ timeout });
    } else if (state === "hidden") {
      await expect(locator).toBeHidden({ timeout });
    } else if (state === "attached") {
      await expect(locator).toBeAttached({ timeout });
    } else if (state === "detached") {
      await expect(locator).not.toBeAttached({ timeout });
    }
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} \u2705 Assertion passed`);
  } catch (e) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} \u274c Assertion FAILED`);
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Taking debug screenshot...`);
    await debugScreenshot(page, `assertion-failure-${Date.now()}`);
    throw e;
  }
}

export async function waitForWithDebug(
  page: Page, 
  locator: any, 
  label: string, 
  timeout = 5000
) {
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Waiting for "${label}" (timeout: ${timeout}ms)...`);
  const startTime = Date.now();
  
  try {
    await locator.waitFor({ state: "visible", timeout });
    const duration = Date.now() - startTime;
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} \u2705 Found "${label}" after ${duration}ms`);
  } catch (e) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} \u274c Timed out waiting for "${label}"`);
    // Don't throw here, let the test fail naturally or handle it
    // But verify what IS visible
    await logAllVisibleText(page);
    throw e;
  }
}

export async function debugScreenshot(page: Page, name: string) {
  const screenshotPath = path.join("test-results", "debug-screenshots", `${name}.png`);
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Saving screenshot to: ${screenshotPath}`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
}