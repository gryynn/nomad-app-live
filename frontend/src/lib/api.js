import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

const BASE = import.meta.env.VITE_API_URL || "";

function getAuthHeaders() {
  const token = localStorage.getItem("nomad_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Cached server config. The frontend needs to know which storage driver the
// backend uses so it can decide whether direct-to-Supabase uploads are safe.
// Without this gate, /upload/complete would record a "local" storage_key for
// a file that actually lives in Supabase Storage → 404 on /api/audio later.
let _serverConfigPromise = null;
export const getServerConfig = () => {
  if (!_serverConfigPromise) {
    _serverConfigPromise = fetch(`${BASE}/api/config`)
      .then((r) => (r.ok ? r.json() : { storage_driver: "supabase" }))
      .catch(() => ({ storage_driver: "supabase" }));
  }
  return _serverConfigPromise;
};

function getCurrentUserId() {
  const token = localStorage.getItem("nomad_token");
  if (!token) return "anonymous";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || "anonymous";
  } catch { return "anonymous"; }
}

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  console.log(`[API] ${options.method || "GET"} ${url}`);
  const authHeaders = getAuthHeaders();
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...authHeaders, ...options.headers },
    ...options,
  });
  // Handle 401 — session expired
  if (res.status === 401) {
    console.warn("[API] 401 — session expired, signing out");
    localStorage.removeItem("nomad_token");
    window.location.reload();
    throw new Error("Session expirée");
  }
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

export const getSessions = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/api/sessions${qs ? `?${qs}` : ""}`;
  console.log(`[API] GET ${url}`);
  const res = await fetch(url, { headers: { ...getAuthHeaders() } });
  if (res.status === 401) {
    console.warn("[API] 401 — session expired, signing out");
    localStorage.removeItem("nomad_token");
    window.location.reload();
    throw new Error("Session expirée");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  const sessions = await res.json();
  const totalHeader = res.headers.get("X-Total-Count");
  const total = totalHeader != null ? Number(totalHeader) : sessions.length;
  return { sessions, total };
};

export const getSession = (id) => request(`/api/sessions/${id}`);

// Photos / screenshots tied to a session. `formData` carries the binary plus
// audio_timestamp_ms + caption fields. Multipart so no Content-Type override.
export const postAttachment = async (sessionId, formData) => {
  const url = `${BASE}/api/sessions/${sessionId}/attachments`;
  const res = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
};

export const listAttachments = (sessionId) =>
  request(`/api/sessions/${sessionId}/attachments`);

export const deleteAttachment = async (sessionId, attachmentId) => {
  const url = `${BASE}/api/sessions/${sessionId}/attachments/${attachmentId}`;
  const res = await fetch(url, { method: "DELETE", headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
};

export const updateSession = (id, data) =>
  request(`/api/sessions/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteSession = async (id) => {
  const url = `${BASE}/api/sessions/${id}`;
  console.log(`[API] DELETE ${url}`);
  const authHeaders = getAuthHeaders();
  const res = await fetch(url, { method: "DELETE", headers: authHeaders });
  if (res.status === 401) {
    localStorage.removeItem("nomad_token");
    window.location.reload();
    throw new Error("Session expirée");
  }
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

  // Get user ID for storage path scoping
  const userId = getCurrentUserId();
  const storagePath = `${userId}/${sessionId}.${ext}`;
  console.log(`[UPLOAD] ${file.name} (${sizeMB} MB) → ${storagePath}`);

  // Direct-to-Supabase strategies are only safe when the backend's storage
  // driver IS Supabase. With any other driver (local/nextcloud/s3), the audio
  // ends up in Supabase Storage but the DB row claims it's local → 404.
  const { storage_driver } = await getServerConfig();
  const canUseSupabaseDirect = storage_driver === "supabase";

  // ── Strategy 1: Direct XHR to Supabase (with progress) ──
  if (canUseSupabaseDirect && SUPABASE_URL && SUPABASE_ANON_KEY) {
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

  // ── Strategy 3: Chunked upload through the backend ──
  // One big POST dies at Cloudflare's 100 MB body cap and restarts from zero
  // on any hiccup. Byte slices of IMPORT_CHUNK_BYTES each go in their own
  // request, retried with backoff; the backend concatenates them.
  console.log(`[UPLOAD] Chunked upload via backend...`);
  return uploadChunked(file, sessionId, onProgress);
};

const IMPORT_CHUNK_BYTES = 8 * 1024 * 1024;
const IMPORT_CHUNK_RETRIES = 5;

function sendImportChunk(sessionId, idx, blob, onChunkProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", blob, `chunk_${idx}`);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/api/upload/import/chunk/${sessionId}/${idx}`);
    // Read the token per chunk: supabase-js may have refreshed it meanwhile.
    const { Authorization } = getAuthHeaders();
    if (Authorization) xhr.setRequestHeader("Authorization", Authorization);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onChunkProgress(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let detail = "";
      try { detail = JSON.parse(xhr.responseText).detail || ""; } catch { /* not JSON */ }
      const err = new Error(detail || `Erreur serveur (${xhr.status})`);
      // 4xx other than 408/429 won't get better by retrying.
      err.fatal = xhr.status >= 400 && xhr.status < 500 && xhr.status !== 408 && xhr.status !== 429;
      reject(err);
    };
    xhr.onerror = () => reject(new Error("Connexion perdue pendant l'upload."));
    xhr.ontimeout = () => reject(new Error("Upload timeout."));
    xhr.timeout = 300000;
    xhr.send(formData);
  });
}

async function uploadChunked(file, sessionId, onProgress) {
  const chunkCount = Math.max(1, Math.ceil(file.size / IMPORT_CHUNK_BYTES));
  let sentBytes = 0;
  const report = (inFlight) => {
    if (onProgress && file.size) {
      onProgress(Math.min(99, Math.floor(((sentBytes + inFlight) / file.size) * 100)));
    }
  };
  for (let idx = 0; idx < chunkCount; idx++) {
    const blob = file.slice(idx * IMPORT_CHUNK_BYTES, (idx + 1) * IMPORT_CHUNK_BYTES);
    for (let attempt = 1; ; attempt++) {
      try {
        await sendImportChunk(sessionId, idx, blob, report);
        break;
      } catch (e) {
        if (e.fatal || attempt >= IMPORT_CHUNK_RETRIES) throw e;
        console.warn(`[UPLOAD] chunk ${idx} attempt ${attempt} failed: ${e.message}`);
        report(0);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
      }
    }
    sentBytes += blob.size;
    report(0);
  }
  const result = await request("/api/upload/import/complete", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      filename: file.name,
      chunk_count: chunkCount,
      size: file.size,
    }),
  });
  if (onProgress) onProgress(100);
  return result;
}

// Tags
export const getTags = () => request("/api/tags");
export const createTag = (data) =>
  request("/api/tags", { method: "POST", body: JSON.stringify(data) });

// Engines
export const getEngineStatus = () => request("/api/engines/status");

// Transcription
// `auto=true` lets the backend respect the user's auto_transcribe preference (skip if disabled).
// Manual button presses must call without auto (defaults false) so the backend always runs them.
export const transcribe = (id, engine = "auto", opts = {}) => {
  const qs = opts.auto ? "?auto=true" : "";
  return request(`/api/transcribe/${id}${qs}`, {
    method: "POST",
    body: JSON.stringify({ engine }),
  });
};

export const getQueue = () => request("/api/transcribe/queue");

// Chunk assembly
export const assembleChunks = (data) =>
  request("/api/upload/assemble", { method: "POST", body: JSON.stringify(data) });

// Chunk transcription (LIVE mode — transcribe individual chunks during recording)
export const transcribeChunk = (sessionId, seq, opts = {}) => {
  const qs = opts.auto ? "?auto=true" : "";
  return request(`/api/transcribe/chunk/${sessionId}/${seq}${qs}`, { method: "POST" });
};

// User preferences
export const getPreferences = () => request("/api/preferences");
export const setPreferences = (prefs) =>
  request("/api/preferences", { method: "PUT", body: JSON.stringify(prefs) });

// Prompt templates
export const listPromptTemplates = () => request("/api/prompts");
export const createPromptTemplate = (body) =>
  request("/api/prompts", { method: "POST", body: JSON.stringify(body) });
export const updatePromptTemplate = (id, patch) =>
  request(`/api/prompts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const deletePromptTemplate = async (id) => {
  const res = await fetch(`${BASE}/api/prompts/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
};

// AI outputs
export const processSessionAI = (sessionId, templateId) =>
  request("/api/ai/process", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, template_id: templateId }),
  });
export const listSessionAIOutputs = (sessionId) =>
  request(`/api/ai/outputs?session_id=${encodeURIComponent(sessionId)}`);
export const updateAIOutput = (outputId, editedText) =>
  request(`/api/ai/outputs/${outputId}`, {
    method: "PATCH",
    body: JSON.stringify({ output_text_edited: editedText }),
  });
export const deleteAIOutput = async (outputId) => {
  const res = await fetch(`${BASE}/api/ai/outputs/${outputId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
};
export const rerunAIOutput = (outputId) =>
  request(`/api/ai/outputs/${outputId}/rerun`, { method: "POST" });
