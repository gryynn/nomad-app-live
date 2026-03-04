import { useState, useCallback, useEffect, useRef } from "react";
import { openDB } from "idb";

const DB_NAME = "nomad-offline";

async function getDb() {
  return openDB(DB_NAME, 3, {
    upgrade(db, oldVersion) {
      // v1-2 stores
      if (!db.objectStoreNames.contains("pending-sessions")) {
        db.createObjectStore("pending-sessions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pending-recordings")) {
        db.createObjectStore("pending-recordings", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("cached-sessions")) {
        db.createObjectStore("cached-sessions", { keyPath: "id" });
      }
      // v3 stores — progressive chunk save
      if (!db.objectStoreNames.contains("recording-chunks")) {
        db.createObjectStore("recording-chunks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("active-recording")) {
        db.createObjectStore("active-recording", { keyPath: "id" });
      }
    },
  });
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState({ total: 0, synced: 0 });
  const uploadFnRef = useRef(null);
  const syncingRef = useRef(false);

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

  // Get all pending items (for sync panel UI)
  const getAllPending = useCallback(async () => {
    const sessions = await getPendingSessions();
    const recordings = await getPendingRecordings();
    return [
      ...sessions.map((s) => ({ ...s, _store: "session" })),
      ...recordings.map((r) => ({ ...r, _store: "recording" })),
    ];
  }, [getPendingSessions, getPendingRecordings]);

  // Remove any pending item by id
  const removePendingItem = useCallback(async (item) => {
    if (item._store === "session") {
      await removePendingSession(item.id);
    } else {
      await removePendingRecording(item.id);
    }
  }, [removePendingSession, removePendingRecording]);

  const syncPending = useCallback(async (uploadFn) => {
    // Store uploadFn for auto-sync on reconnection
    if (uploadFn) uploadFnRef.current = uploadFn;
    const fn = uploadFn || uploadFnRef.current;
    if (!fn) return { synced: 0, failed: 0, errors: [] };

    // Prevent concurrent syncs
    if (syncingRef.current) return { synced: 0, failed: 0, errors: [] };
    syncingRef.current = true;

    try {
      setSyncProgress({ total: 0, synced: 0 });

      const sessions = await getPendingSessions();
      const recordings = await getPendingRecordings();
      const allPending = [...sessions, ...recordings];

      if (allPending.length === 0) return { synced: 0, failed: 0, errors: [] };

      setSyncProgress({ total: allPending.length, synced: 0 });

      let synced = 0;
      let failed = 0;
      const errors = [];

      for (const item of allPending) {
        try {
          await fn(item);

          // Determine which store to remove from
          if (sessions.find((s) => s.id === item.id)) {
            await removePendingSession(item.id);
          } else {
            await removePendingRecording(item.id);
          }

          synced++;
          setSyncProgress({ total: allPending.length, synced });
        } catch (err) {
          // Continue to next item instead of breaking
          failed++;
          errors.push(`${item.filename || item.id}: ${err.message}`);
          console.warn(`[SYNC] Failed to sync ${item.id}:`, err.message);
        }
      }

      return { synced, failed, errors };
    } finally {
      syncingRef.current = false;
    }
  }, [getPendingSessions, getPendingRecordings, removePendingSession, removePendingRecording]);

  // ─── Progressive chunk save functions ──────────────

  /** Create metadata entry for a new active recording */
  const startActiveRecording = useCallback(async (id, mode, mimeType) => {
    const db = await getDb();
    await db.put("active-recording", {
      id,
      mode,
      mimeType,
      startedAt: new Date().toISOString(),
      chunkCount: 0,
      lastFlushAt: null,
      uploadedChunks: 0,
      failedUploads: 0,
    });
  }, []);

  /** Write a chunk snapshot + update metadata in a single transaction */
  const flushChunkSnapshot = useCallback(async (recordingId, seq, blob) => {
    const db = await getDb();
    const tx = db.transaction(["recording-chunks", "active-recording"], "readwrite");
    const chunkStore = tx.objectStore("recording-chunks");
    const metaStore = tx.objectStore("active-recording");

    await chunkStore.put({
      id: `${recordingId}_${String(seq).padStart(4, "0")}`,
      recordingId,
      seq,
      blob,
      createdAt: new Date().toISOString(),
    });

    const meta = await metaStore.get(recordingId);
    if (meta) {
      meta.chunkCount = seq + 1;
      meta.lastFlushAt = new Date().toISOString();
      await metaStore.put(meta);
    }

    await tx.done;
  }, []);

  /** Update active recording metadata (notes, transcript, etc.) */
  const updateActiveRecordingMeta = useCallback(async (recordingId, updates) => {
    const db = await getDb();
    const meta = await db.get("active-recording", recordingId);
    if (meta) {
      Object.assign(meta, updates);
      await db.put("active-recording", meta);
    }
  }, []);

  /** Read all chunks ordered by seq, return assembled Blob */
  const assembleRecording = useCallback(async (recordingId, mimeType) => {
    const db = await getDb();
    const allChunks = await db.getAll("recording-chunks");
    const chunks = allChunks
      .filter((c) => c.recordingId === recordingId)
      .sort((a, b) => a.seq - b.seq);
    if (chunks.length === 0) return null;
    return new Blob(chunks.map((c) => c.blob), { type: mimeType || "audio/webm" });
  }, []);

  /** Clear chunks + active-recording entry for a recording */
  const clearRecordingChunks = useCallback(async (recordingId) => {
    const db = await getDb();
    const tx = db.transaction(["recording-chunks", "active-recording"], "readwrite");
    const chunkStore = tx.objectStore("recording-chunks");
    const metaStore = tx.objectStore("active-recording");

    // Delete all chunks for this recording
    const allChunks = await chunkStore.getAll();
    for (const chunk of allChunks) {
      if (chunk.recordingId === recordingId) {
        await chunkStore.delete(chunk.id);
      }
    }

    // Delete metadata
    await metaStore.delete(recordingId);
    await tx.done;
  }, []);

  /** Detect orphaned recordings (crash recovery) */
  const getOrphanedRecordings = useCallback(async () => {
    const db = await getDb();
    return db.getAll("active-recording");
  }, []);

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
    getAllPending,
    removePendingItem,
    // Progressive chunk save
    startActiveRecording,
    flushChunkSnapshot,
    updateActiveRecordingMeta,
    assembleRecording,
    clearRecordingChunks,
    getOrphanedRecordings,
  };
}
