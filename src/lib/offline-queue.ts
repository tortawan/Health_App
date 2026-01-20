export type OfflinePhotoQueueItem = {
  id: string;
  created_at: string;
  blob: Blob;
  mimeType: string;
  status: "queued" | "processing" | "failed";
  checksum: string;
};

const DB_NAME = "health-app-offline";
const STORE_NAME = "photoQueue";
const DB_VERSION = 1;

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("checksum", "checksum", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => void,
) => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    callback(store);
    tx.oncomplete = () => resolve(undefined as T);
    tx.onerror = () => reject(tx.error);
  });
};

const getByChecksum = async (checksum: string) => {
  const db = await openDb();
  return new Promise<OfflinePhotoQueueItem | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("checksum");
    const request = index.get(checksum);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
};

const computeChecksum = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export async function enqueuePhoto(file: File) {
  const checksum = await computeChecksum(file);
  const existing = await getByChecksum(checksum);
  if (existing) {
    return { item: existing, duplicate: true };
  }

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const item: OfflinePhotoQueueItem = {
    id,
    created_at: new Date().toISOString(),
    blob: file,
    mimeType: file.type || "image/jpeg",
    status: "queued",
    checksum,
  };

  await withStore("readwrite", (store) => {
    store.add(item);
  });

  return { item, duplicate: false };
}

export async function listQueuedPhotos() {
  const db = await openDb();
  return new Promise<OfflinePhotoQueueItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result ?? []) as OfflinePhotoQueueItem[]);
    request.onerror = () => reject(request.error);
  });
}

export async function updateQueuedPhotoStatus(
  id: string,
  status: OfflinePhotoQueueItem["status"],
) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const item = getRequest.result as OfflinePhotoQueueItem | undefined;
      if (!item) {
        resolve();
        return;
      }
      store.put({ ...item, status });
    };
    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeQueuedPhoto(id: string) {
  await withStore("readwrite", (store) => {
    store.delete(id);
  });
}

export async function countQueuedPhotos() {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();
    request.onsuccess = () => resolve(request.result ?? 0);
    request.onerror = () => reject(request.error);
  });
}
