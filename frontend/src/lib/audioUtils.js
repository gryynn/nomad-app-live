/**
 * Format seconds to human-readable duration.
 * 36 → "36s", 162 → "2:42", 3672 → "1h01"
 */
export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${String(rm).padStart(2, "0")}`;
}

/**
 * Convert dBFS level to 0-1 range for VU meter display.
 */
export function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

/**
 * Estimate if a file is likely music or voice based on filename and duration.
 */
export function guessFileType(filename, durationSeconds) {
  const ext = filename.split(".").pop()?.toLowerCase();
  const musicExts = ["mp3", "flac", "aac", "ogg", "wma"];

  if (musicExts.includes(ext) && durationSeconds > 120 && durationSeconds < 600) {
    return { type: "music", confidence: 0.7 };
  }

  if (durationSeconds > 1800) {
    return { type: "call", confidence: 0.6 };
  }

  if (filename.toLowerCase().includes("dictaphone") || filename.toLowerCase().includes("memo")) {
    return { type: "memo", confidence: 0.8 };
  }

  return { type: "insight", confidence: 0.3 };
}
