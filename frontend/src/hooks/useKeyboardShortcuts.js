import { useEffect, useCallback } from "react";

/**
 * Global keyboard shortcuts for NOMAD.
 *
 * Shortcuts are disabled when the user is typing in an input/textarea/contenteditable,
 * except for Escape which always works.
 *
 * ── Home screen (not recording, not reviewing) ──
 *   R         → start REC mode
 *   L         → start LIVE mode
 *
 * ── While recording ──
 *   Space     → stop recording
 *   P         → pause / resume
 *   Escape    → cancel recording
 *   M         → insert timestamp mark (if notes textarea exists)
 *
 * ── While reviewing (post-capture) ──
 *   Escape    → (no action, let form handle it)
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
  const handleKeyDown = useCallback(
    (e) => {
      const tag = e.target.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.target.isContentEditable;

      // Escape always works
      if (e.key === "Escape") {
        if (isRecording) {
          e.preventDefault();
          cancelRecording();
        }
        return;
      }

      // Skip all other shortcuts when typing in a form field
      if (isEditable) return;

      // Skip if modifier keys are held (let browser shortcuts through)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // ── While recording ──
      if (isRecording) {
        if (e.key === " " || e.code === "Space") {
          e.preventDefault();
          stopRecording();
          return;
        }
        if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          pauseRecording();
          return;
        }
        if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          insertMark();
          return;
        }
        return;
      }

      // ── Home screen (not recording, not reviewing, no mode active, no session expanded) ──
      if (!showReview && !mode && !expandedId) {
        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          startRecording("rec");
          return;
        }
        if (e.key === "l" || e.key === "L") {
          e.preventDefault();
          startRecording("live");
          return;
        }
      }
    },
    [isRecording, isPaused, showReview, mode, expandedId, startRecording, stopRecording, pauseRecording, cancelRecording, insertMark]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
