import { useState, useCallback, useRef, useEffect } from "react";

const MAX_RETRIES = 3;
const BACKOFF_BASE = 1000; // 1s, 3s, 9s
const API_BASE = import.meta.env.VITE_API_URL || "";

function getAuthToken() {
  return localStorage.getItem("nomad_token") || "";
}

async function uploadChunkToBackend(sessionId, seq, blob) {
  const token = getAuthToken();
  if (!token) throw new Error("Not authenticated");

  const fd = new FormData();
  fd.append("file", blob, `chunk_${String(seq).padStart(4, "0")}.webm`);

  const url = `${API_BASE}/api/upload/chunk/${sessionId}/${seq}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!resp.ok) {
    let detail = "";
    try { detail = (await resp.json()).detail || ""; } catch (_) { detail = await resp.text(); }
    throw new Error(`HTTP ${resp.status}${detail ? `: ${detail}` : ""}`);
  }
  return resp.json();
}

export function useChunkUploader() {
  const [progress, setProgress] = useState({ uploaded: 0, total: 0, isUploading: false });
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const failedRef = useRef([]);
  const resolversRef = useRef([]);
  const onUploadedRef = useRef(null);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      if (!navigator.onLine) {
        await new Promise((resolve) => {
          const handler = () => {
            window.removeEventListener("online", handler);
            resolve();
          };
          window.addEventListener("online", handler);
        });
        if (failedRef.current.length > 0) {
          console.log(`[CHUNK-UPLOAD] Back online, re-queuing ${failedRef.current.length} failed chunk(s)`);
          queueRef.current.push(...failedRef.current);
          failedRef.current = [];
        }
      }

      const item = queueRef.current[0];
      let success = false;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (!navigator.onLine) break;
        try {
          await uploadChunkToBackend(item.sessionId, item.seq, item.blob);
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
        if (onUploadedRef.current) {
          try { onUploadedRef.current(item.sessionId, item.seq); } catch (_) {}
        }
      } else if (!navigator.onLine) {
        queueRef.current.unshift(item);
      } else {
        failedRef.current.push(item);
        console.error(`[CHUNK-UPLOAD] Failed after ${MAX_RETRIES} retries: seq ${item.seq}`);
      }
    }

    processingRef.current = false;
    setProgress((prev) => ({ ...prev, isUploading: false }));

    for (const resolve of resolversRef.current) resolve();
    resolversRef.current = [];
  }, []);

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

  const uploadChunk = useCallback((sessionId, seq, blob) => {
    queueRef.current.push({ sessionId, seq, blob });
    setProgress((prev) => ({
      uploaded: prev.uploaded,
      total: prev.total + 1,
      isUploading: true,
    }));
    processQueue();
  }, [processQueue]);

  const waitForAllUploads = useCallback(() => {
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

  const getFailedChunks = useCallback(() => [...failedRef.current], []);

  const reset = useCallback(() => {
    queueRef.current = [];
    failedRef.current = [];
    resolversRef.current = [];
    processingRef.current = false;
    setProgress({ uploaded: 0, total: 0, isUploading: false });
  }, []);

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
