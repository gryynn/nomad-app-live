import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  console.log(`[API] ${options.method || "GET"} ${url}`);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    console.error(`[API] Non-JSON response (${res.status}) for ${path}: ${contentType}`);
    throw new Error(`Erreur serveur (${res.status}). Le backend est peut-être inaccessible.`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = err.detail || res.statusText;
    console.error(`[API] ERROR ${res.status}: ${msg}`);
    throw new Error(msg);
  }
  const data = await res.json();
  console.log(`[API] OK`, data);
  return data;
}

// Sessions
export const createSession = (data) =>
  request("/api/sessions", { method: "POST", body: JSON.stringify(data) });

export const getSessions = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/sessions${qs ? `?${qs}` : ""}`);
};

export const getSession = (id) => request(`/api/sessions/${id}`);

export const updateSession = (id, data) =>
  request(`/api/sessions/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteSession = async (id) => {
  const url = `${BASE}/api/sessions/${id}`;
  console.log(`[API] DELETE ${url}`);
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
  console.log(`[API] DELETE OK`);
};

export const setSessionTags = (id, tagIds) =>
  request(`/api/sessions/${id}/tags`, {
    method: "POST",
    body: JSON.stringify({ tag_ids: tagIds }),
  });

export const addNote = (id, content) =>
  request(`/api/sessions/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

export const replaceNotes = (id, content) =>
  request(`/api/sessions/${id}/notes`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });

export const addMark = (id, time, label = null) =>
  request(`/api/sessions/${id}/marks`, {
    method: "POST",
    body: JSON.stringify({ time, label }),
  });

// ─── Upload strategies ─────────────────────────────────
// Strategy 1: Direct to Supabase Storage via XHR (with progress)
// Strategy 2: Direct via Supabase JS client (no progress but reliable)
// Strategy 3: Backend proxy (slowest, goes through backend + Cloudflare)

const MIME_MAP = {
  wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4",
  webm: "audio/webm", ogg: "audio/ogg", flac: "audio/flac",
};

function getFileExt(name) {
  return (name || "").split(".").pop().toLowerCase();
}

async function uploadDirectXHR(file, storagePath, contentType, onProgress) {
  // XHR PUT to Supabase Storage REST API with anon key — supports progress
  const url = `${SUPABASE_URL}/storage/v1/object/nomad-audio/${storagePath}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log(`[UPLOAD] Direct XHR to Supabase OK`);
        resolve();
      } else if (xhr.status === 413) {
        reject(new Error(`Fichier trop volumineux pour Supabase Storage (limite ~50 MB). Augmentez la limite dans Supabase Dashboard → Storage → Settings.`));
      } else {
        reject(new Error(`Storage ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error (CORS?)"));
    xhr.ontimeout = () => reject(new Error("Upload timeout"));
    xhr.timeout = 3600000; // 1h for huge files
    xhr.send(file);
  });
}

async function uploadDirectClient(file, storagePath, contentType) {
  // Supabase JS client — handles auth/CORS automatically
  const { error } = await supabase.storage
    .from("nomad-audio")
    .upload(storagePath, file, { contentType, upsert: true });
  if (error) {
    if (error.statusCode === "413" || error.message?.includes("Payload too large")) {
      throw new Error(`Fichier trop volumineux pour Supabase Storage (limite ~50 MB). Augmentez la limite dans Supabase Dashboard → Storage → Settings.`);
    }
    throw error;
  }
  console.log(`[UPLOAD] Supabase client upload OK`);
}

export const uploadAudio = async (file, onProgress) => {
  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  const ext = getFileExt(file.name);
  const contentType = MIME_MAP[ext] || "audio/mpeg";
  const sessionId = crypto.randomUUID();
  const storagePath = `martun/${sessionId}.${ext}`;
  console.log(`[UPLOAD] ${file.name} (${sizeMB} MB) → ${storagePath}`);

  // ── Strategy 1: Direct XHR to Supabase (with progress) ──
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      await uploadDirectXHR(file, storagePath, contentType, onProgress);
      // Create session record via backend
      const result = await request("/api/upload/complete", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          storage_path: storagePath,
          filename: file.name,
          size: file.size,
        }),
      });
      return result;
    } catch (e) {
      console.warn(`[UPLOAD] Direct XHR failed: ${e.message}`);
    }

    // ── Strategy 2: Supabase JS client (no progress) ──
    if (supabase) {
      try {
        if (onProgress) onProgress(-1); // signal indeterminate
        await uploadDirectClient(file, storagePath, contentType);
        const result = await request("/api/upload/complete", {
          method: "POST",
          body: JSON.stringify({
            session_id: sessionId,
            storage_path: storagePath,
            filename: file.name,
            size: file.size,
          }),
        });
        if (onProgress) onProgress(100);
        return result;
      } catch (e) {
        console.warn(`[UPLOAD] Supabase client failed: ${e.message}`);
      }
    }
  }

  // ── Strategy 3: Backend proxy (with progress) ──
  console.log(`[UPLOAD] Falling back to backend proxy...`);
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/api/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log(`[UPLOAD] Backend proxy OK`, data);
          resolve(data);
        } else {
          reject(new Error(data.detail || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Erreur serveur (${xhr.status}).`));
      }
    };

    xhr.onerror = () => reject(new Error("Connexion perdue pendant upload."));
    xhr.ontimeout = () => reject(new Error("Upload timeout — essayez avec un fichier plus petit."));
    xhr.timeout = 600000; // 10 min
    xhr.send(formData);
  });
};

// Tags
export const getTags = () => request("/api/tags");
export const createTag = (data) =>
  request("/api/tags", { method: "POST", body: JSON.stringify(data) });

// Engines
export const getEngineStatus = () => request("/api/engines/status");

// Transcription
export const transcribe = (id, engine = "auto") =>
  request(`/api/transcribe/${id}`, {
    method: "POST",
    body: JSON.stringify({ engine }),
  });

export const getQueue = () => request("/api/transcribe/queue");

// Chunk assembly
export const assembleChunks = (data) =>
  request("/api/upload/assemble", { method: "POST", body: JSON.stringify(data) });

// Chunk transcription (LIVE mode — transcribe individual chunks during recording)
export const transcribeChunk = (sessionId, seq) =>
  request(`/api/transcribe/chunk/${sessionId}/${seq}`, { method: "POST" });
