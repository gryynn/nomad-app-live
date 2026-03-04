import { useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase.js";

const MAX_RETRIES = 3;
const BACKOFF_BASE = 1000; // 1s, 3s, 9s

export function useChunkUploader() {
  const [progress, setProgress] = useState({ uploaded: 0, total: 0, isUploading: false });
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const failedRef = useRef([]);
  const resolversRef = useRef([]); // waitForAllUploads resolvers

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      // Pause if offline
      if (!navigator.onLine) {
        // Wait for online event
        await new Promise((resolve) => {
          const handler = () => {
            window.removeEventListener("online", handler);
            resolve();
          };
          window.addEventListener("online", handler);
        });
      }

      const item = queueRef.current[0];
      let success = false;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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

  /** Wait for all queued uploads to complete */
  const waitForAllUploads = useCallback(() => {
    if (queueRef.current.length === 0 && !processingRef.current) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      resolversRef.current.push(resolve);
    });
  }, []);

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

  return {
    progress,
    uploadChunk,
    waitForAllUploads,
    getFailedChunks,
    reset,
  };
}
