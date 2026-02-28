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

export const deleteSession = (id) =>
  request(`/api/sessions/${id}`, { method: "DELETE" });

export const setSessionTags = (id, tagIds) =>
  request(`/api/sessions/${id}/tags`, { method: "POST", body: JSON.stringify({ tag_ids: tagIds }) });

export const addNote = (id, formData) =>
  fetch(`${BASE}/api/sessions/${id}/notes`, { method: "POST", body: formData }).then((r) => r.json());

export const addMark = (id, time, label = null) =>
  request(`/api/sessions/${id}/marks`, { method: "POST", body: JSON.stringify({ time, label }) });

// Upload
export const uploadFiles = (formData) =>
  fetch(`${BASE}/api/upload`, { method: "POST", body: formData }).then((r) => r.json());

// Tags — fallback to seed data if API unavailable
const SEED_TAGS = [
  { id: "1", name: "Insight", emoji: "\u{1F9E0}", hue: "#8888BB", session_count: 0 },
  { id: "2", name: "Call", emoji: "\u{1F4DE}", hue: "#BB8888", session_count: 0 },
  { id: "3", name: "Podcast", emoji: "\u{1F399}\uFE0F", hue: "#B8A060", session_count: 0 },
  { id: "4", name: "Memo", emoji: "\u{1F4DD}", hue: "#6BAA88", session_count: 0 },
  { id: "5", name: "Music", emoji: "\u{1F3B5}", hue: "#B080A0", session_count: 0 },
  { id: "6", name: "Sample", emoji: "\u{1F3B9}", hue: "#9080B0", session_count: 0 },
  { id: "7", name: "Travail", emoji: "\u{1F4BC}", hue: "#7098BB", session_count: 0 },
  { id: "8", name: "Idée", emoji: "\u{1F4A1}", hue: "#C09060", session_count: 0 },
  { id: "9", name: "Learning", emoji: "\u{1F393}", hue: "#60A898", session_count: 0 },
  { id: "10", name: "Perso", emoji: "\u{1F3E0}", hue: "#888888", session_count: 0 },
];

export const getTags = async () => {
  try {
    return await request("/api/tags");
  } catch {
    return SEED_TAGS;
  }
};

export const createTag = (data) =>
  request("/api/tags", { method: "POST", body: JSON.stringify(data) });

// Engines — fallback to hardcoded status if API unavailable
const FALLBACK_ENGINES = [
  { id: "groq", name: "Groq Whisper", status: "online", cost_per_hour: 0.04 },
  { id: "deepgram", name: "Deepgram", status: "online", cost_per_hour: 0.46 },
  { id: "wynona", name: "WYNONA", status: "offline", cost_per_hour: 0 },
  { id: "local", name: "Local", status: "offline", cost_per_hour: 0 },
];

export const getEngineStatus = async () => {
  try {
    const data = await request("/api/engines/status");
    return data.engines || FALLBACK_ENGINES;
  } catch {
    return FALLBACK_ENGINES;
  }
};

export const wakeWynona = () =>
  request("/api/engines/wynona/wake", { method: "POST" });

// Transcription
export const transcribe = (id, engine = "auto") =>
  request(`/api/transcribe/${id}`, { method: "POST", body: JSON.stringify({ engine }) });

// Queue
export const getQueue = () => request("/api/queue");
