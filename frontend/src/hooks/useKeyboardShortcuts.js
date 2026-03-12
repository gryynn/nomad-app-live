import { useEffect, useCallback } from "react";
import { usePersistedState } from "./usePersistedState.js";

/**
 * All shortcut definitions with their default enabled state.
 * Each shortcut has an id, label (for UI), key(s) to match, and context.
 */
export const SHORTCUT_DEFS = [
  { id: "rec",    label: "REC",    keys: ["r", "R"],         display: "R",     context: "home" },
  { id: "live",   label: "LIVE",   keys: ["l", "L"],         display: "L",     context: "home" },
  { id: "stop",   label: "Stop",   keys: [" "],              display: "Space", context: "recording" },
  { id: "pause",  label: "Pause",  keys: ["p", "P"],         display: "P",     context: "recording" },
  { id: "mark",   label: "Marque", keys: ["m", "M"],         display: "M",     context: "recording" },
  { id: "cancel", label: "Annuler",keys: ["Escape"],         display: "Esc",   context: "recording" },
];

const DEFAULT_ENABLED = Object.fromEntries(SHORTCUT_DEFS.map((s) => [s.id, true]));
const STORAGE_KEY = "nomad-shortcut-prefs";

/**
 * Global keyboard shortcuts for NOMAD with per-shortcut toggle.
 * Returns { shortcuts, setShortcutEnabled } for UI control.
 */
export function useKeyboardShortcuts({
  isRecording,
  isPaused,
  showReview,
  mode,
  expandedId,
  startRecording,
  stopRecording,
  pauseRecording,
  cancelRecording,
  insertMark,
}) {
  const [shortcuts, setShortcuts] = usePersistedState(STORAGE_KEY, DEFAULT_ENABLED);

  const setShortcutEnabled = useCallback(
    (id, enabled) => {
      setShortcuts((prev) => ({ ...prev, [id]: enabled }));
    },
    [setShortcuts]
  );

  const handleKeyDown = useCallback(
    (e) => {
      const tag = e.target.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.target.isContentEditable;

      // Escape: works even in editable fields
      if (e.key === "Escape") {
        if (isRecording && shortcuts.cancel) {
          e.preventDefault();
          cancelRecording();
        }
        return;
      }

      // Skip when typing in a form field
      if (isEditable) return;

      // Skip if modifier keys are held
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // ── While recording ──
      if (isRecording) {
        if ((e.key === " " || e.code === "Space") && shortcuts.stop) {
          e.preventDefault();
          stopRecording();
          return;
        }
        if ((e.key === "p" || e.key === "P") && shortcuts.pause) {
          e.preventDefault();
          pauseRecording();
          return;
        }
        if ((e.key === "m" || e.key === "M") && shortcuts.mark) {
          e.preventDefault();
          insertMark();
          return;
        }
        return;
      }

      // ── Home screen ──
      if (!showReview && !mode && !expandedId) {
        if ((e.key === "r" || e.key === "R") && shortcuts.rec) {
          e.preventDefault();
          startRecording("rec");
          return;
        }
        if ((e.key === "l" || e.key === "L") && shortcuts.live) {
          e.preventDefault();
          startRecording("live");
          return;
        }
      }
    },
    [isRecording, isPaused, showReview, mode, expandedId, shortcuts, startRecording, stopRecording, pauseRecording, cancelRecording, insertMark]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts, setShortcutEnabled };
}
