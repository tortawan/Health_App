import { Page, expect } from "@playwright/test";

/**
 * Debug Mode Configuration
 * Controls which debug information is logged during tests
 */
export const DEBUG_CONFIG = {
  ENABLE_API_LOGGING: true,
  ENABLE_STATE_LOGGING: true,
  ENABLE_ELEMENT_LOGGING: true,
  ENABLE_NETWORK_LOGGING: true,
  LOG_PREFIX: "[DEBUG]",
};

/**
 * Initialize API request/response logging
 * Captures all network requests and their responses
 */
export async function enableApiLogging(page: Page) {
  if (!DEBUG_CONFIG.ENABLE_API_LOGGING) return;

  const capturedRequests: Array<{
    url: string;
    method: string;
    requestBody?: string;
    responseStatus?: number;
    responseBody?: string;
    timestamp: string;
  }> = [];

  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/") || url.includes("/storage/") || url.includes("supabase")) {
      console.log(`${DEBUG_CONFIG.LOG_PREFIX} [REQUEST] ${request.method()} ${url}`);
      try {
        const postData = request.postDataJSON();
        console.log(
          `${DEBUG_CONFIG.LOG_PREFIX} [REQUEST BODY]`,
          JSON.stringify(postData, null, 2)
        );
      } catch (_e) {
        // Not JSON or no body
      }
    }
  });

  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/") || url.includes("/storage/") || url.includes("supabase")) {
      console.log(
        `${DEBUG_CONFIG.LOG_PREFIX} [RESPONSE] ${response.status()} ${response.url()}`
      );
      response.text().then((text) => {
        try {
          const json = JSON.parse(text);
          console.log(`${DEBUG_CONFIG.LOG_PREFIX} [RESPONSE BODY]`, JSON.stringify(json, null, 2));
          capturedRequests.push({
            url,
            method: "GET",
            responseStatus: response.status(),
            responseBody: JSON.stringify(json),
            timestamp: new Date().toISOString(),
          });
        } catch (_e) {
          console.log(`${DEBUG_CONFIG.LOG_PREFIX} [RESPONSE BODY]`, text.substring(0, 200));
        }
      });
    }
  });

  return capturedRequests;
}

/**
 * Log current page state and DOM structure
 * Useful for understanding what's rendered at a specific moment
 */
export async function logPageState(page: Page, stepName: string) {
  if (!DEBUG_CONFIG.ENABLE_STATE_LOGGING) return;

  console.log(`\n${DEBUG_CONFIG.LOG_PREFIX} ===== PAGE STATE: ${stepName} =====`);
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Current URL:`, page.url());

  // Log all data attributes (useful for finding elements)
  const dataElements = await page.evaluate(() => {
    return document.querySelectorAll("[data-*]");
  });

  console.log(
    `${DEBUG_CONFIG.LOG_PREFIX} Elements with data attributes:`,
    dataElements.length
  );

  // Log localStorage content
  const localStorage = await page.evaluate(() => window.localStorage);
  if (Object.keys(localStorage).length > 0) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} localStorage:`, localStorage);
  }

  // Log sessionStorage content
  const sessionStorage = await page.evaluate(() => window.sessionStorage);
  if (Object.keys(sessionStorage).length > 0) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} sessionStorage:`, sessionStorage);
  }
}

/**
 * Log all visible text on the page
 * Helps identify if element text is present but hidden
 */
export async function logAllVisibleText(page: Page) {
  if (!DEBUG_CONFIG.ENABLE_ELEMENT_LOGGING) return;

  console.log(`${DEBUG_CONFIG.LOG_PREFIX} ===== ALL VISIBLE TEXT ON PAGE =====`);

  const allText = await page.evaluate(() => {
    const elements = document.querySelectorAll("*");
    const textContent: { text: string; tag: string; visible: boolean }[] = [];

    elements.forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length > 0 && text.length < 200) {
        const style = window.getComputedStyle(el);
        const isVisible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0";

        textContent.push({
          text,
          tag: el.tagName.toLowerCase(),
          visible: isVisible,
        });
      }
    });

    return textContent;
  });

  // Group by visibility
  const visible = allText.filter((t) => t.visible);
  const hidden = allText.filter((t) => !t.visible);

  console.log(`${DEBUG_CONFIG.LOG_PREFIX} VISIBLE TEXT (${visible.length}):`);
  visible.slice(0, 20).forEach((t) => {
    console.log(
      `${DEBUG_CONFIG.LOG_PREFIX}   [${t.tag}] ${t.text.substring(0, 80)}`
    );
  });

  if (hidden.length > 0) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} HIDDEN TEXT (${hidden.length}):`);
    hidden.slice(0, 10).forEach((t) => {
      console.log(
        `${DEBUG_CONFIG.LOG_PREFIX}   [${t.tag}] ${t.text.substring(0, 80)}`
      );
    });
  }
}

/**
 * Search for a specific text and report where it is
 */
export async function searchForText(page: Page, searchText: string) {
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} ===== SEARCHING FOR: "${searchText}" =====`);

  const foundElements = await page.evaluate((search) => {
    const elements: Array<{
      text: string;
      tag: string;
      className: string;
      visible: boolean;
      id: string;
    }> = [];

    document.querySelectorAll("*").forEach((el) => {
      if (el.textContent?.includes(search)) {
        const style = window.getComputedStyle(el);
        const isVisible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0";

        elements.push({
          text: el.textContent.substring(0, 100),
          tag: el.tagName.toLowerCase(),
          className: el.className,
          id: el.id,
          visible: isVisible,
        });
      }
    });

    return elements;
  }, searchText);

  if (foundElements.length === 0) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ❌ Text NOT FOUND on page`);
  } else {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ✅ Found in ${foundElements.length} element(s):`);
    foundElements.forEach((el, idx) => {
      console.log(
        `${DEBUG_CONFIG.LOG_PREFIX}   [${idx + 1}] <${el.tag}> (${el.visible ? "VISIBLE" : "HIDDEN"}) id="${el.id}" class="${el.className}"`
      );
      console.log(`${DEBUG_CONFIG.LOG_PREFIX}       Text: ${el.text}`);
    });
  }

  return foundElements;
}

/**
 * Intercept and log specific API call details
 * Useful for debugging specific API interactions
 */
export async function monitorApiCall(
  page: Page,
  urlPattern: string,
  onRequest?: (data: any) => void,
  onResponse?: (data: any) => void
) {
  page.on("request", (request) => {
    if (request.url().includes(urlPattern)) {
      console.log(`${DEBUG_CONFIG.LOG_PREFIX} [API: ${urlPattern}] Request sent`);
      try {
        const body = request.postDataJSON();
        console.log(`${DEBUG_CONFIG.LOG_PREFIX} [API: ${urlPattern}] Body:`, body);
        onRequest?.(body);
      } catch (_e) {
        console.log(`${DEBUG_CONFIG.LOG_PREFIX} [API: ${urlPattern}] No JSON body`);
      }
    }
  });

  page.on("response", (response) => {
    if (response.url().includes(urlPattern)) {
      console.log(
        `${DEBUG_CONFIG.LOG_PREFIX} [API: ${urlPattern}] Response: ${response.status()}`
      );
      response.text().then((text) => {
        try {
          const json = JSON.parse(text);
          console.log(`${DEBUG_CONFIG.LOG_PREFIX} [API: ${urlPattern}] Data:`, json);
          onResponse?.(json);
        } catch (_e) {
          console.log(
            `${DEBUG_CONFIG.LOG_PREFIX} [API: ${urlPattern}] Response (raw):`,
            text
          );
        }
      });
    }
  });
}

/**
 * Enhanced assertion with debug output
 * Logs what was expected vs what was found
 */
export async function assertWithDebug(
  page: Page,
  locator: ReturnType<typeof page.locator>,
  assertion: "visible" | "hidden" | "enabled" | "checked",
  timeout = 5000
) {
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Asserting: ${assertion}`);

  try {
    if (assertion === "visible") {
      await expect(locator).toBeVisible({ timeout });
    } else if (assertion === "hidden") {
      await expect(locator).toBeHidden({ timeout });
    } else if (assertion === "enabled") {
      await expect(locator).toBeEnabled({ timeout });
    } else if (assertion === "checked") {
      await expect(locator).toBeChecked({ timeout });
    }
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ✅ Assertion passed`);
  } catch (error) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ❌ Assertion failed`);
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Error:`, error);

    // Try to provide helpful info
    const count = await locator.count().catch(() => -1);
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} Element count: ${count}`);

    // Log page state before throwing
    await logAllVisibleText(page);
    throw error;
  }
}

/**
 * Wait for element with debug output
 */
export async function waitForWithDebug(
  page: Page,
  locator: ReturnType<typeof page.locator>,
  stepName: string,
  timeout = 5000
) {
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Waiting for: ${stepName}`);

  try {
    await locator.waitFor({ timeout });
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ✅ ${stepName} appeared`);
  } catch (error) {
    console.log(`${DEBUG_CONFIG.LOG_PREFIX} ❌ Timeout waiting for: ${stepName}`);
    await logAllVisibleText(page);
    throw error;
  }
}

/**
 * Screenshot with descriptive filename
 */
export async function debugScreenshot(page: Page, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `test-results/debug-${name}-${timestamp}.png`;
  await page.screenshot({ path: filename });
  console.log(`${DEBUG_CONFIG.LOG_PREFIX} Screenshot saved: ${filename}`);
}
