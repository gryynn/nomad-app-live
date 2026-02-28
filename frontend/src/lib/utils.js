import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export const STATUS_CONFIG = {
  pending: { label: "En attente", color: "bg-muted-foreground/30 text-muted-foreground" },
  recording: { label: "Enregistrement", color: "bg-orange-500/20 text-orange-400" },
  processing: { label: "Transcription", color: "bg-yellow-500/20 text-yellow-400" },
  done: { label: "Terminé", color: "bg-emerald-500/20 text-emerald-400" },
  error: { label: "Erreur", color: "bg-red-500/20 text-red-400" },
};

export const MODE_CONFIG = {
  rec: { label: "REC", icon: "Mic" },
  live: { label: "LIVE", icon: "Radio" },
  import: { label: "Import", icon: "Upload" },
  paste: { label: "Paste", icon: "ClipboardPaste" },
};
