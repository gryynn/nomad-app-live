// Mock data for NOMAD PWA development
// Used for UI testing and development before real API integration

// Audio input devices with status
export const devices = [
  {
    id: "device-1",
    name: "Built-in Microphone",
    type: "internal",
    status: "online",
    lastUsed: "2026-02-27T14:32:00Z",
    sampleRate: 48000,
    channels: 1,
  },
  {
    id: "device-2",
    name: "Rode NT-USB",
    type: "usb",
    status: "online",
    lastUsed: "2026-02-26T09:15:00Z",
    sampleRate: 48000,
    channels: 1,
  },
  {
    id: "device-3",
    name: "Zoom H6",
    type: "usb",
    status: "offline",
    lastUsed: "2026-02-20T16:45:00Z",
    sampleRate: 96000,
    channels: 2,
  },
  {
    id: "device-4",
    name: "Shure SM7B (Scarlett)",
    type: "audio-interface",
    status: "online",
    lastUsed: "2026-02-28T11:20:00Z",
    sampleRate: 48000,
    channels: 1,
  },
  {
    id: "device-5",
    name: "AirPods Pro",
    type: "bluetooth",
    status: "online",
    lastUsed: "2026-02-25T18:30:00Z",
    sampleRate: 16000,
    channels: 1,
  },
];

// Transcription engines with availability status
export const engines = [
  {
    id: "engine-1",
    name: "Groq Whisper",
    provider: "groq",
    model: "whisper-large-v3",
    status: "online",
    cost: "0.0001",
    costUnit: "$/sec",
    location: "cloud",
    speed: "8x realtime",
    lastPing: "2026-02-28T12:00:00Z",
  },
  {
    id: "engine-2",
    name: "Deepgram Nova-3",
    provider: "deepgram",
    model: "nova-3",
    status: "online",
    cost: "0.0043",
    costUnit: "$/min",
    location: "cloud",
    speed: "15x realtime",
    lastPing: "2026-02-28T12:00:30Z",
  },
  {
    id: "engine-3",
    name: "WhisperX (WYNONA)",
    provider: "local",
    model: "whisperx-large-v3",
    status: "offline",
    cost: "0",
    costUnit: "free",
    location: "WYNONA GPU",
    speed: "2.5x realtime",
    lastPing: "2026-02-27T08:15:00Z",
    wakeAvailable: true,
    wakeUrl: "http://wynona.local:8400/wake",
  },
];

// Recent recording sessions
export const sessions = [
  {
    id: "sess-001",
    title: "Team standup meeting notes",
    date: "2026-02-28T10:30:00Z",
    duration: 1847, // seconds
    engine: "engine-1",
    engineName: "Groq Whisper",
    tag: "tag-work",
    tagName: "Work",
    tagEmoji: "💼",
    status: "completed",
    wordCount: 2847,
    cost: 0.184,
  },
  {
    id: "sess-002",
    title: "Podcast interview with Sarah Chen about AI ethics",
    date: "2026-02-27T15:45:00Z",
    duration: 4521,
    engine: "engine-2",
    engineName: "Deepgram Nova-3",
    tag: "tag-podcast",
    tagName: "Podcast",
    tagEmoji: "🎙️",
    status: "completed",
    wordCount: 8234,
    cost: 0.324,
  },
  {
    id: "sess-003",
    title: "Lecture: Introduction to Quantum Computing",
    date: "2026-02-27T09:00:00Z",
    duration: 5400,
    engine: "engine-1",
    engineName: "Groq Whisper",
    tag: "tag-education",
    tagName: "Education",
    tagEmoji: "📚",
    status: "completed",
    wordCount: 9876,
    cost: 0.540,
  },
  {
    id: "sess-004",
    title: "Voice memo: Project ideas for Q2",
    date: "2026-02-26T18:20:00Z",
    duration: 423,
    engine: "engine-1",
    engineName: "Groq Whisper",
    tag: "tag-personal",
    tagName: "Personal",
    tagEmoji: "💭",
    status: "completed",
    wordCount: 687,
    cost: 0.042,
  },
  {
    id: "sess-005",
    title: "Client call: Website redesign requirements",
    date: "2026-02-26T14:00:00Z",
    duration: 2134,
    engine: "engine-2",
    engineName: "Deepgram Nova-3",
    tag: "tag-work",
    tagName: "Work",
    tagEmoji: "💼",
    status: "completed",
    wordCount: 3542,
    cost: 0.153,
  },
  {
    id: "sess-006",
    title: "Morning meditation session",
    date: "2026-02-26T07:30:00Z",
    duration: 1200,
    engine: "engine-1",
    engineName: "Groq Whisper",
    tag: "tag-wellness",
    tagName: "Wellness",
    tagEmoji: "🧘",
    status: "completed",
    wordCount: 145,
    cost: 0.120,
  },
  {
    id: "sess-007",
    title: "Band rehearsal recording",
    date: "2026-02-25T19:00:00Z",
    duration: 7200,
    engine: "engine-3",
    engineName: "WhisperX (WYNONA)",
    tag: "tag-music",
    tagName: "Music",
    tagEmoji: "🎵",
    status: "processing",
    wordCount: null,
    cost: 0,
  },
  {
    id: "sess-008",
    title: "Conference talk: The Future of Web Development",
    date: "2026-02-24T11:00:00Z",
    duration: 3600,
    engine: "engine-2",
    engineName: "Deepgram Nova-3",
    tag: "tag-work",
    tagName: "Work",
    tagEmoji: "💼",
    status: "completed",
    wordCount: 6234,
    cost: 0.258,
  },
  {
    id: "sess-009",
    title: "Cooking recipe narration",
    date: "2026-02-23T16:30:00Z",
    duration: 845,
    engine: "engine-1",
    engineName: "Groq Whisper",
    tag: "tag-personal",
    tagName: "Personal",
    tagEmoji: "💭",
    status: "completed",
    wordCount: 1234,
    cost: 0.084,
  },
  {
    id: "sess-010",
    title: "Research interview with Dr. Martinez about climate change impacts on coastal ecosystems",
    date: "2026-02-22T13:15:00Z",
    duration: 6234,
    engine: "engine-2",
    engineName: "Deepgram Nova-3",
    tag: "tag-research",
    tagName: "Research",
    tagEmoji: "🔬",
    status: "completed",
    wordCount: 10567,
    cost: 0.447,
  },
  {
    id: "sess-011",
    title: "Quick voice note",
    date: "2026-02-21T22:45:00Z",
    duration: 67,
    engine: "engine-1",
    engineName: "Groq Whisper",
    tag: "tag-personal",
    tagName: "Personal",
    tagEmoji: "💭",
    status: "completed",
    wordCount: 89,
    cost: 0.007,
  },
  {
    id: "sess-012",
    title: "Workshop: Advanced React Patterns",
    date: "2026-02-20T10:00:00Z",
    duration: 4800,
    engine: "engine-1",
    engineName: "Groq Whisper",
    tag: "tag-education",
    tagName: "Education",
    tagEmoji: "📚",
    status: "completed",
    wordCount: 8765,
    cost: 0.480,
  },
];

// Hierarchical tags with optional Mirai integration
export const tags = [
  // Top-level tags
  {
    id: "tag-work",
    name: "Work",
    emoji: "💼",
    parent_id: null,
    mirai_item_id: null,
    color: "#C8FF00",
    created_at: "2026-01-15T10:00:00Z",
  },
  {
    id: "tag-personal",
    name: "Personal",
    emoji: "💭",
    parent_id: null,
    mirai_item_id: null,
    color: "#00D9FF",
    created_at: "2026-01-15T10:01:00Z",
  },
  {
    id: "tag-education",
    name: "Education",
    emoji: "📚",
    parent_id: null,
    mirai_item_id: "mirai-edu-001",
    color: "#FF6B9D",
    created_at: "2026-01-15T10:02:00Z",
  },
  {
    id: "tag-podcast",
    name: "Podcast",
    emoji: "🎙️",
    parent_id: null,
    mirai_item_id: null,
    color: "#FFC700",
    created_at: "2026-01-20T14:30:00Z",
  },
  {
    id: "tag-music",
    name: "Music",
    emoji: "🎵",
    parent_id: null,
    mirai_item_id: null,
    color: "#9B59B6",
    created_at: "2026-01-22T09:15:00Z",
  },
  {
    id: "tag-wellness",
    name: "Wellness",
    emoji: "🧘",
    parent_id: null,
    mirai_item_id: "mirai-wellness-001",
    color: "#2ECC71",
    created_at: "2026-01-25T07:00:00Z",
  },
  {
    id: "tag-research",
    name: "Research",
    emoji: "🔬",
    parent_id: null,
    mirai_item_id: "mirai-research-001",
    color: "#3498DB",
    created_at: "2026-02-01T11:00:00Z",
  },
  // Child tags (hierarchical)
  {
    id: "tag-work-meetings",
    name: "Meetings",
    emoji: "👥",
    parent_id: "tag-work",
    mirai_item_id: null,
    color: "#C8FF00",
    created_at: "2026-01-16T10:00:00Z",
  },
  {
    id: "tag-work-presentations",
    name: "Presentations",
    emoji: "📊",
    parent_id: "tag-work",
    mirai_item_id: null,
    color: "#C8FF00",
    created_at: "2026-01-16T10:01:00Z",
  },
  {
    id: "tag-education-lectures",
    name: "Lectures",
    emoji: "🎓",
    parent_id: "tag-education",
    mirai_item_id: "mirai-edu-lectures",
    color: "#FF6B9D",
    created_at: "2026-01-18T09:00:00Z",
  },
  {
    id: "tag-education-workshops",
    name: "Workshops",
    emoji: "🛠️",
    parent_id: "tag-education",
    mirai_item_id: "mirai-edu-workshops",
    color: "#FF6B9D",
    created_at: "2026-01-18T09:01:00Z",
  },
  {
    id: "tag-personal-journal",
    name: "Journal",
    emoji: "📝",
    parent_id: "tag-personal",
    mirai_item_id: null,
    color: "#00D9FF",
    created_at: "2026-01-20T08:00:00Z",
  },
  {
    id: "tag-personal-ideas",
    name: "Ideas",
    emoji: "💡",
    parent_id: "tag-personal",
    mirai_item_id: null,
    color: "#00D9FF",
    created_at: "2026-01-20T08:01:00Z",
  },
];

// Helper function to format duration (seconds to HH:MM:SS or MM:SS)
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

// Helper function to format relative date
export function formatRelativeDate(isoDate) {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Helper function to get tag by id
export function getTagById(tagId) {
  return tags.find((t) => t.id === tagId);
}

// Helper function to get engine by id
export function getEngineById(engineId) {
  return engines.find((e) => e.id === engineId);
}

// Helper function to get device by id
export function getDeviceById(deviceId) {
  return devices.find((d) => d.id === deviceId);
}

// Helper function to get top-level tags only
export function getTopLevelTags() {
  return tags.filter((t) => t.parent_id === null);
}

// Helper function to get child tags for a parent
export function getChildTags(parentId) {
  return tags.filter((t) => t.parent_id === parentId);
}
