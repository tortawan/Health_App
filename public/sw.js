const QUEUE_DB = "logFoodQueue";
const QUEUE_STORE = "requests";

function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "POST") return;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/log-food")) return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request.clone());
      } catch (error) {
        const body = await request.clone().text();
        const headers = {};
        request.headers.forEach((value, key) => {
          headers[key] = value;
        });
        await saveRequest({ url: request.url, body, headers });
        if (self.registration.sync) {
          try {
            await self.registration.sync.register("retry-log-food");
          } catch (syncError) {
            console.warn("Background sync unavailable", syncError);
          }
        }
        return new Response(JSON.stringify({ queued: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
    })(),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "retry-log-food") {
    event.waitUntil(replayQueued());
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "retryQueuedLogs") {
    event.waitUntil(replayQueued());
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(replayQueued());
});
