const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// Sessions
export const createSession = (formData) =>
  fetch(`${BASE}/api/sessions`, { method: "POST", body: formData }).then((r) => r.json());

export const getSessions = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/sessions?${qs}`);
};

export const getSession = (id) => request(`/api/sessions/${id}`);

export const updateSession = (id, data) =>
  request(`/api/sessions/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const setSessionTags = (id, tagIds) =>
  request(`/api/sessions/${id}/tags`, { method: "POST", body: JSON.stringify({ tag_ids: tagIds }) });

export const addNote = (id, formData) =>
  fetch(`${BASE}/api/sessions/${id}/notes`, { method: "POST", body: formData }).then((r) => r.json());

export const addMark = (id, time, label = null) =>
  request(`/api/sessions/${id}/marks`, { method: "POST", body: JSON.stringify({ time, label }) });

// Upload
export const uploadFiles = (formData) =>
  fetch(`${BASE}/api/upload`, { method: "POST", body: formData }).then((r) => r.json());

// Tags
export const getTags = () => request("/api/tags");
export const createTag = (data) =>
  request("/api/tags", { method: "POST", body: JSON.stringify(data) });

// Engines
export const getEngineStatus = () => request("/api/engines/status");
export const wakeWynona = () => request("/api/engines/wynona/wake", { method: "POST" });

// Transcription
export const transcribe = (id, engine = "auto") =>
  request(`/api/transcribe/${id}`, { method: "POST", body: JSON.stringify({ engine }) });

// Queue
export const getQueue = () => request("/api/queue");
