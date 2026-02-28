import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../hooks/useTheme.jsx";
import { DEFAULT_TAGS, STICKY_TAG_IDS } from "../styles/themes.js";

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
      <p style={{ color: theme.textSoft }}>Post-capture screen — implementation in progress</p>

      {/* Debug info - will be replaced with actual UI sections */}
      <div style={{ marginTop: "1rem", fontSize: "12px", color: theme.textGhost }}>
        <p>Duration: {time}s</p>
        <p>Mode: {mode}</p>
        <p>Marks: {marks.length}</p>
        <p>Transcription state: {transcriptionState}</p>
        <p>Selected tags: {selectedTags.map(t => t.name).join(", ")}</p>
      </div>
    </div>
  );
}
