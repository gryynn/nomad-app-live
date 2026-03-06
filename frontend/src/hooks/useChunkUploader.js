import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase.js";

const MAX_RETRIES = 3;
const BACKOFF_BASE = 1000; // 1s, 3s, 9s

export function useChunkUploader() {
  const [progress, setProgress] = useState({ uploaded: 0, total: 0, isUploading: false });
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const failedRef = useRef([]);
  const resolversRef = useRef([]); // waitForAllUploads resolvers
  const onUploadedRef = useRef(null); // callback(sessionId, seq) on successful upload

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      // Pause if offline
      if (!navigator.onLine) {
        await new Promise((resolve) => {
          const handler = () => {
            window.removeEventListener("online", handler);
            resolve();
          };
          window.addEventListener("online", handler);
        });
        // Re-queue failed chunks for retry now that we're back online
        if (failedRef.current.length > 0) {
          console.log(`[CHUNK-UPLOAD] Back online, re-queuing ${failedRef.current.length} failed chunk(s)`);
          queueRef.current.push(...failedRef.current);
          failedRef.current = [];
        }
      }

      const item = queueRef.current[0];
      let success = false;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Check online before each attempt
        if (!navigator.onLine) break;
        try {
          const path = `${item.sessionId}/chunk_${String(item.seq).padStart(4, "0")}.webm`;
          const { error } = await supabase.storage
            .from("nomad-audio-chunks")
            .upload(path, item.blob, { upsert: true, contentType: item.blob.type || "audio/webm" });

          if (error) throw error;
          success = true;
          break;
        } catch (err) {
          console.warn(`[CHUNK-UPLOAD] Attempt ${attempt + 1}/${MAX_RETRIES} failed for seq ${item.seq}:`, err.message);
          if (attempt < MAX_RETRIES - 1) {
            const delay = BACKOFF_BASE * Math.pow(3, attempt);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      queueRef.current.shift();

      if (success) {
        setProgress((prev) => ({ ...prev, uploaded: prev.uploaded + 1 }));
        // Notify caller (e.g., LIVE mode chunk transcription)
        if (onUploadedRef.current) {
          try { onUploadedRef.current(item.sessionId, item.seq); } catch (_) {}
        }
      } else if (!navigator.onLine) {
        // Went offline mid-retry → put back in queue (will wait for online at top of loop)
        queueRef.current.unshift(item);
      } else {
        failedRef.current.push(item);
        console.error(`[CHUNK-UPLOAD] Failed after ${MAX_RETRIES} retries: seq ${item.seq}`);
      }
    }

    processingRef.current = false;
    setProgress((prev) => ({ ...prev, isUploading: false }));

    // Resolve all waitForAllUploads promises
    for (const resolve of resolversRef.current) {
      resolve();
    }
    resolversRef.current = [];
  }, []);

  // Listen for online event to retry failed chunks even when queue is idle
  useEffect(() => {
    const handleOnline = () => {
      if (failedRef.current.length > 0) {
        console.log(`[CHUNK-UPLOAD] Online event: re-queuing ${failedRef.current.length} failed chunk(s)`);
        queueRef.current.push(...failedRef.current);
        failedRef.current = [];
        setProgress((prev) => ({ ...prev, isUploading: true }));
        processQueue();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [processQueue]);

  /** Queue a chunk for upload (fire-and-forget) */
  const uploadChunk = useCallback((sessionId, seq, blob) => {
    queueRef.current.push({ sessionId, seq, blob });
    setProgress((prev) => ({
      uploaded: prev.uploaded,
      total: prev.total + 1,
      isUploading: true,
    }));
    processQueue();
  }, [processQueue]);

  /** Wait for all queued uploads to complete. Re-queues failed items for one more round. */
  const waitForAllUploads = useCallback(() => {
    // Re-queue failed chunks for one more attempt (user is stopping, likely back online)
    if (failedRef.current.length > 0) {
      console.log(`[CHUNK-UPLOAD] waitForAllUploads: re-queuing ${failedRef.current.length} failed chunk(s)`);
      queueRef.current.push(...failedRef.current);
      failedRef.current = [];
      setProgress((prev) => ({ ...prev, isUploading: true }));
      processQueue();
    }
    if (queueRef.current.length === 0 && !processingRef.current) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      resolversRef.current.push(resolve);
    });
  }, [processQueue]);

  /** Get list of chunks that failed after all retries */
  const getFailedChunks = useCallback(() => {
    return [...failedRef.current];
  }, []);

  /** Reset state for a new recording */
  const reset = useCallback(() => {
    queueRef.current = [];
    failedRef.current = [];
    resolversRef.current = [];
    processingRef.current = false;
    setProgress({ uploaded: 0, total: 0, isUploading: false });
  }, []);

  /** Set callback for when a chunk is successfully uploaded: fn(sessionId, seq) */
  const setOnUploaded = useCallback((fn) => {
    onUploadedRef.current = fn;
  }, []);

  return {
    progress,
    uploadChunk,
    waitForAllUploads,
    getFailedChunks,
    reset,
    setOnUploaded,
  };
}
