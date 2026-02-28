import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../hooks/useTheme.jsx";
import { DEFAULT_TAGS, STICKY_TAG_IDS, FONTS } from "../styles/themes.js";

export default function PostCapture() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Extract state from React Router navigation (with fallback defaults)
  const {
    time = 0,
    marks = [],
    mode = "offline",
    liveText = ""
  } = location.state || {};

  // Helper function to format time (seconds to mm:ss)
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Core state hooks
  const [title, setTitle] = useState("");
  const [selectedTags, setSelectedTags] = useState(
    STICKY_TAG_IDS.map(id => DEFAULT_TAGS.find(tag => tag.id === id)).filter(Boolean)
  );
  const [notes, setNotes] = useState("");

  // Determine initial transcription state based on mode and liveText
  const initialTranscriptionState = (mode === "live" && liveText) ? "live" : "idle";
  const [transcriptionState, setTranscriptionState] = useState(initialTranscriptionState);

  // Tag toggle handler
  const handleTagToggle = (tagId) => {
    const tag = DEFAULT_TAGS.find(t => t.id === tagId);
    if (!tag) return;

    setSelectedTags(prev => {
      const isSelected = prev.some(t => t.id === tagId);
      if (isSelected) {
        return prev.filter(t => t.id !== tagId);
      } else {
        return [...prev, tag];
      }
    });
  };

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span style={{ color: theme.green, fontSize: "1.25rem", fontWeight: 500 }}>
            ✓ Capturé
          </span>
        </div>
        <div className="flex items-center gap-3" style={{ fontFamily: FONTS.mono }}>
          <span style={{ color: theme.textSoft, fontSize: "0.875rem" }}>
            {mode === "live" ? "LIVE" : "REC"}
          </span>
          <span style={{ color: theme.text, fontSize: "0.875rem" }}>
            {formatDuration(time)}
          </span>
        </div>
      </header>

      {/* Debug info - will be replaced with actual UI sections */}
      <div style={{ marginTop: "1rem", fontSize: "12px", color: theme.textGhost }}>
        <p>Marks: {marks.length}</p>
        <p>Transcription state: {transcriptionState}</p>
        <p>Selected tags: {selectedTags.map(t => t.name).join(", ")}</p>
      </div>
    </div>
  );
}
