const CACHE_NAME = "health-tracker-v1";
const QUEUE_DB = "logFoodQueue";
const QUEUE_STORE = "requests";
let lunchReminderTimeout = null;

// 1. ASSET CACHING
// We cache the core app shell so it loads instantly even offline
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/globals.css" 
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  // Attempt to replay any queued offline logs immediately on app start
  event.waitUntil(replayQueued());
  self.clients.claim();
});

// 2. BACKGROUND SYNC HELPERS (IndexedDB)
function openQueue() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveRequest(data) {
  const db = await openQueue();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).add(data);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueued() {
  const db = await openQueue();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const results = [];
    const cursorReq = tx.objectStore(QUEUE_STORE).openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        results.push({ id: cursor.key, ...cursor.value });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

async function deleteRequest(id) {
  const db = await openQueue();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function replayQueued() {
  const queued = await getQueued();
  for (const item of queued) {
    try {
      const response = await fetch(item.url, {
        method: "POST",
        headers: item.headers,
        body: item.body,
      });
      if (response.ok) {
        await deleteRequest(item.id);
      }
    } catch (error) {
      console.error("Replay failed, will retry later", error);
    }
  }
}

// 3. FETCH STRATEGIES
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // A. Handle API POST requests (Offline Background Sync)
  // If we are offline, queue the request to IndexedDB
  if (request.method === "POST" && url.pathname.startsWith("/api/log-food")) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request.clone());
        } catch {
          const body = await request.clone().text();
          const headers = {};
          request.headers.forEach((value, key) => {
            headers[key] = value;
          });
          await saveRequest({ url: request.url, body, headers });
          
          // Try to register a sync event if supported
          if (self.registration.sync) {
            try {
              await self.registration.sync.register("retry-log-food");
            } catch (syncError) {
              console.warn("Background sync unavailable", syncError);
            }
          }
          
          // Return a "Accepted" 202 status to the UI so it doesn't crash
          return new Response(JSON.stringify({ queued: true }), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          });
        }
      })()
    );
    return;
  }

  // B. Handle Static Assets (Stale-While-Revalidate)
  // Ignore non-GET requests and Next.js internal dev server calls
  if (request.method === "GET" && 
      !url.pathname.startsWith("/_next/webpack-hmr") && 
      !url.pathname.startsWith("/api/")) {
      
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          // Clone and cache the new response if valid
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
        // Return cached response immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "retry-log-food") {
    event.waitUntil(replayQueued());
  }
});

self.addEventListener("message", (event) => {
  // Triggered manually by the UI when online status returns
  if (event.data === "retryQueuedLogs") {
    event.waitUntil(replayQueued());
  }

  // Lunch Reminder Logic
  if (event.data?.type === "scheduleLunchReminder") {
    const { lastLogAt } = event.data;
    if (lunchReminderTimeout) {
      clearTimeout(lunchReminderTimeout);
      lunchReminderTimeout = null;
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const target = new Date(todayStart);
    target.setHours(14, 0, 0, 0); // 2:00 PM
    
    if (now.getTime() >= target.getTime()) return;

    const lastLogDate = lastLogAt ? new Date(lastLogAt) : null;
    if (lastLogDate && lastLogDate.toDateString() === todayStart.toDateString()) {
      return; // Already logged today
    }

    lunchReminderTimeout = setTimeout(async () => {
      try {
        if (Notification.permission === "granted") {
          await self.registration.showNotification("Don't forget to log lunch!", {
            body: "We haven't seen a meal yet today. Quick add lunch now.",
            icon: "/icons/icon-192.svg",
          });
        }
      } catch (err) {
        console.error("Failed to show notification:", err);
      }
    }, target.getTime() - now.getTime());
  }
});
