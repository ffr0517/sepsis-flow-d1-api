const DB_NAME = "sepsis-flow-v1";
const DB_VERSION = 1;

const STORES = {
  guestPatients: "guest_patients",
  guestAssessments: "guest_assessments",
  guestSettings: "guest_settings"
};

let dbPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORES.guestPatients)) {
        const store = db.createObjectStore(STORES.guestPatients, { keyPath: "id" });
        store.createIndex("aliasSearch", "aliasSearch", { unique: false });
        store.createIndex("externalIdSearch", "externalIdSearch", { unique: false });
        store.createIndex("lastAssessmentAt", "lastAssessmentAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.guestAssessments)) {
        const store = db.createObjectStore(STORES.guestAssessments, { keyPath: "id" });
        store.createIndex("patientId", "patientId", { unique: false });
        store.createIndex("patientId_createdAt", ["patientId", "createdAt"], { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.guestSettings)) {
        db.createObjectStore(STORES.guestSettings, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function idbGetAll(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(storeName, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(storeName, value) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(storeName, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClear(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export { STORES };
