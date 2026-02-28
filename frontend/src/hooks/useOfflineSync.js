import { useState, useCallback, useEffect, useRef } from "react";
import { openDB } from "idb";

const DB_NAME = "nomad-offline";

async function getDb() {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("pending-sessions")) {
        db.createObjectStore("pending-sessions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pending-recordings")) {
        db.createObjectStore("pending-recordings", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("cached-sessions")) {
        db.createObjectStore("cached-sessions", { keyPath: "id" });
      }
    },
  });
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState({ total: 0, synced: 0 });
  const uploadFnRef = useRef(null);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    const db = await getDb();
    const sessions = await db.getAll("pending-sessions");
    const recordings = await db.getAll("pending-recordings");
    setPendingCount(sessions.length + recordings.length);
  }, []);

  const saveSessionOffline = useCallback(async (session) => {
    const db = await getDb();
    await db.put("pending-sessions", session);
    await updatePendingCount();
  }, [updatePendingCount]);

  const saveRecordingOffline = useCallback(async (recording) => {
    const db = await getDb();
    await db.put("pending-recordings", recording);
    await updatePendingCount();
  }, [updatePendingCount]);

  const getPendingSessions = useCallback(async () => {
    const db = await getDb();
    return db.getAll("pending-sessions");
  }, []);

  const getPendingRecordings = useCallback(async () => {
    const db = await getDb();
    return db.getAll("pending-recordings");
  }, []);

  const removePendingSession = useCallback(async (id) => {
    const db = await getDb();
    await db.delete("pending-sessions", id);
    await updatePendingCount();
  }, [updatePendingCount]);

  const removePendingRecording = useCallback(async (id) => {
    const db = await getDb();
    await db.delete("pending-recordings", id);
    await updatePendingCount();
  }, [updatePendingCount]);

  const syncPending = useCallback(async (uploadFn) => {
    // Store uploadFn for auto-sync on reconnection
    uploadFnRef.current = uploadFn;

    setSyncProgress({ total: 0, synced: 0 });

    const sessions = await getPendingSessions();
    const recordings = await getPendingRecordings();
    const allPending = [...sessions, ...recordings];

    setSyncProgress({ total: allPending.length, synced: 0 });

    let synced = 0;
    for (const item of allPending) {
      try {
        await uploadFn(item);

        // Determine which store to remove from
        if (sessions.find((s) => s.id === item.id)) {
          await removePendingSession(item.id);
        } else {
          await removePendingRecording(item.id);
        }

        synced++;
        setSyncProgress({ total: allPending.length, synced });
      } catch {
        // Will retry on next sync
        break;
      }
    }
  }, [getPendingSessions, getPendingRecordings, removePendingSession, removePendingRecording]);

  // Set up online/offline detection and auto-sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      if (uploadFnRef.current) {
        syncPending(uploadFnRef.current);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Update pending count on mount
    updatePendingCount();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPending, updatePendingCount]);

  return {
    isOnline,
    pendingCount,
    syncProgress,
    saveSessionOffline,
    saveRecordingOffline,
    syncPending,
  };
}
