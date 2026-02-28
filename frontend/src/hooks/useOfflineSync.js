import { openDB } from "idb";

const DB_NAME = "nomad-offline";
const STORE_NAME = "pending-sessions";

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    },
  });
}

export async function savePending(session) {
  const db = await getDb();
  await db.put(STORE_NAME, session);
}

export async function getPending() {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function removePending(id) {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function syncPending(uploadFn) {
  const pending = await getPending();
  for (const session of pending) {
    try {
      await uploadFn(session);
      await removePending(session.id);
    } catch {
      // Will retry on next sync
      break;
    }
  }
}
