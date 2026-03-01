const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  console.log(`[API] ${options.method || "GET"} ${url}`);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
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

export const addMark = (id, time, label = null) =>
  request(`/api/sessions/${id}/marks`, {
    method: "POST",
    body: JSON.stringify({ time, label }),
  });

// Upload
export const uploadAudio = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  console.log(`[API] POST /api/upload (${file.name}, ${file.size} bytes)`);
  return fetch(`${BASE}/api/upload`, { method: "POST", body: formData }).then(
    async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Upload failed");
      console.log(`[API] Upload OK`, data);
      return data;
    }
  );
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
