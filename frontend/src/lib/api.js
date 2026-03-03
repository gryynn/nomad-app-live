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

// Upload: try direct-to-storage first, fallback to backend proxy
export const uploadAudio = async (file, onProgress) => {
  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  console.log(`[UPLOAD] ${file.name} (${sizeMB} MB)`);

  // Try direct upload via signed URL (faster, no backend bottleneck)
  try {
    const init = await request("/api/upload/init", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, size: file.size }),
    });
    console.log(`[UPLOAD] Signed URL OK, uploading direct to storage...`);

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", init.upload_url);
      xhr.setRequestHeader("Content-Type", init.content_type);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log(`[UPLOAD] Direct storage upload OK`);
          resolve();
        } else {
          reject(new Error(`Storage ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("CORS/network"));
      xhr.ontimeout = () => reject(new Error("timeout"));
      xhr.timeout = 3600000;
      xhr.send(file);
    });

    const result = await request("/api/upload/complete", {
      method: "POST",
      body: JSON.stringify({
        session_id: init.session_id,
        storage_path: init.storage_path,
        filename: file.name,
        size: file.size,
      }),
    });
    return result;
  } catch (directErr) {
    console.warn(`[UPLOAD] Direct upload failed (${directErr.message}), falling back to backend proxy...`);
  }

  // Fallback: upload through backend with progress
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

    xhr.onerror = () => reject(new Error("Connexion perdue. Vérifiez votre réseau."));
    xhr.ontimeout = () => reject(new Error("Upload timeout — fichier trop volumineux pour cette méthode."));
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
