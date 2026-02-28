import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../hooks/useTheme.jsx";
import { DEFAULT_TAGS, STICKY_TAG_IDS, FONTS } from "../styles/themes.js";
import TagChip from "../components/TagChip.jsx";
import MarkItem from "../components/MarkItem.jsx";

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

  // Transcription state machine
  // States: 'live' (from live mode), 'idle' (no transcription), 'processing' (in progress), 'complete' (finished)
  const initialTranscriptionState = (mode === "live" && liveText) ? "live" : "idle";
  const [transcriptionState, setTranscriptionState] = useState(initialTranscriptionState);
  const [transcriptionText, setTranscriptionText] = useState(liveText || "");
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [selectedEngine, setSelectedEngine] = useState("whisper");

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

  // Transcription state transition handlers
  const startTranscription = () => {
    setTranscriptionState("processing");
    setTranscriptionProgress(0);
  };

  const completeTranscription = (text) => {
    setTranscriptionState("complete");
    setTranscriptionText(text);
    setTranscriptionProgress(100);
  };

  const retryTranscription = () => {
    setTranscriptionState("idle");
    setTranscriptionText("");
    setTranscriptionProgress(0);
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

      {/* Title Input Section */}
      <section
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <label
          className="block text-xs font-medium mb-2 uppercase tracking-wide"
          style={{ color: theme.textMuted }}
        >
          Titre
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sans titre"
          className="w-full bg-transparent border-none outline-none text-base"
          style={{ color: theme.text }}
        />
      </section>

      {/* Tags Grid Section */}
      <section
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <label
          className="block text-xs font-medium mb-3 uppercase tracking-wide"
          style={{ color: theme.textMuted }}
        >
          Tags
        </label>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_TAGS.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              selected={selectedTags.some(t => t.id === tag.id)}
              onToggle={handleTagToggle}
            />
          ))}
        </div>
      </section>

      {/* Marks Review Section - Conditional */}
      {marks.length > 0 && (
        <section
          className="rounded-xl p-4 mb-4"
          style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
        >
          <label
            className="block text-xs font-medium mb-3 uppercase tracking-wide"
            style={{ color: theme.textMuted }}
          >
            Marques
          </label>
          <div className="flex flex-col">
            {marks.map((mark, index) => (
              <MarkItem
                key={index}
                timestamp={mark.timestamp}
                label={mark.label}
              />
            ))}
          </div>
        </section>
      )}

      {/* Transcription Section - State A: Live */}
      {transcriptionState === "live" && (
        <section
          className="rounded-xl p-4 mb-4"
          style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: theme.green, fontSize: "0.875rem", fontWeight: 500 }}>
              ✓ Transcrit en direct
            </span>
          </div>
          <div
            className="mb-3 overflow-hidden"
            style={{
              color: theme.text,
              maxHeight: "4.5rem",
              lineHeight: "1.5rem",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical"
            }}
          >
            {transcriptionText}
          </div>
          <button
            className="text-sm"
            style={{ color: theme.accent, background: "transparent", border: "none", padding: 0 }}
          >
            Voir tout →
          </button>
        </section>
      )}

      {/* Notes Section */}
      <section
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <label
          className="block text-xs font-medium mb-2 uppercase tracking-wide"
          style={{ color: theme.textMuted }}
        >
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ajouter des notes..."
          rows={4}
          className="w-full bg-transparent border-none outline-none text-base resize-none"
          style={{ color: theme.text }}
        />
      </section>

      {/* Action Buttons Section */}
      <section className="flex items-center justify-between gap-3 mb-4">
        {/* Save Button - Primary Action */}
        <button
          className="flex-1 rounded-xl p-4 text-center font-medium"
          style={{
            background: theme.accent,
            color: theme.bg,
            border: "none"
          }}
        >
          Enregistrer
        </button>

        {/* Delete Button - Icon */}
        <button
          className="rounded-xl p-4"
          style={{
            background: theme.card,
            border: `1px solid ${theme.cardBorder}`,
            color: theme.red
          }}
        >
          🗑️
        </button>

        {/* Skip Button - Ghost Style */}
        <button
          className="rounded-xl p-4"
          style={{
            background: "transparent",
            border: "none",
            color: theme.textGhost
          }}
        >
          Passer
        </button>
      </section>
    </div>
  );
}
