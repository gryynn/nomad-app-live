import { useState, useEffect } from "react";
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

  // Defensive validation of state values
  const validTime = typeof time === 'number' && !isNaN(time) && time >= 0 ? time : 0;
  const validMarks = Array.isArray(marks) ? marks : [];
  const validMode = mode === "live" || mode === "offline" ? mode : "offline";
  const validLiveText = typeof liveText === 'string' ? liveText : "";

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
  const initialTranscriptionState = (validMode === "live" && validLiveText) ? "live" : "idle";
  const [transcriptionState, setTranscriptionState] = useState(initialTranscriptionState);
  const [transcriptionText, setTranscriptionText] = useState(validLiveText || "");
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

  // Save session handler
  const handleSave = () => {
    const sessionData = {
      title: title || "Sans titre",
      tags: selectedTags.map(t => ({ id: t.id, name: t.name })),
      notes,
      duration: validTime,
      marks: validMarks,
      mode: validMode,
      transcription: transcriptionText ? {
        text: transcriptionText,
        engine: selectedEngine,
        wordCount: transcriptionText.split(/\s+/).filter(w => w.length > 0).length
      } : null
    };

    console.log('Session saved:', sessionData);
    navigate('/');
  };

  // Delete session handler
  const handleDelete = () => {
    if (confirm('Supprimer cette session ?')) {
      console.log('Session deleted');
      navigate('/');
    }
  };

  // Skip handler - save minimal data
  const handleSkip = () => {
    console.log('Session skipped - saving raw audio only');
    navigate('/');
  };

  // Progress animation effect - simulates transcription progress
  useEffect(() => {
    if (transcriptionState !== "processing") return;

    const duration = 4000; // 4 seconds total
    const intervalTime = 50; // Update every 50ms
    const steps = duration / intervalTime;
    const increment = 100 / steps;

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += increment;
      if (currentProgress >= 100) {
        setTranscriptionProgress(100);
        clearInterval(interval);
        // Transition to complete state with mock transcription
        setTimeout(() => {
          completeTranscription("Ceci est une transcription simulée du contenu audio capturé. Le texte complet apparaîtra ici une fois le processus terminé.");
        }, 200);
      } else {
        setTranscriptionProgress(currentProgress);
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [transcriptionState]);

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
            {validMode === "live" ? "LIVE" : "REC"}
          </span>
          <span style={{ color: theme.text, fontSize: "0.875rem" }}>
            {formatDuration(validTime)}
          </span>
        </div>
      </header>

      {/* Title Input Section */}
      <section
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
      >
        <label
          className="block text-xs font-medium mb-2 uppercase tracking-wide"
          style={{ color: theme.textSoft }}
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
        style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
      >
        <label
          className="block text-xs font-medium mb-3 uppercase tracking-wide"
          style={{ color: theme.textSoft }}
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
      {validMarks.length > 0 && (
        <section
          className="rounded-xl p-4 mb-4"
          style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
        >
          <label
            className="block text-xs font-medium mb-3 uppercase tracking-wide"
            style={{ color: theme.textSoft }}
          >
            Marques
          </label>
          <div className="flex flex-col">
            {validMarks.map((mark, index) => (
              <MarkItem
                key={index}
                timestamp={mark?.timestamp || 0}
                label={mark?.label || ""}
              />
            ))}
          </div>
        </section>
      )}

      {/* Transcription Section - State A: Live */}
      {transcriptionState === "live" && (
        <section
          className="rounded-xl p-4 mb-4"
          style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
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
            {transcriptionText || "Transcription vide"}
          </div>
          <button
            className="text-sm"
            style={{ color: theme.accent, background: "transparent", border: "none", padding: 0 }}
          >
            Voir tout →
          </button>
        </section>
      )}

      {/* Transcription Section - State B: Idle (No transcription yet) */}
      {transcriptionState === "idle" && (
        <section
          className="rounded-xl p-4 mb-4"
          style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
        >
          <label
            className="block text-xs font-medium mb-3 uppercase tracking-wide"
            style={{ color: theme.textSoft }}
          >
            Transcription
          </label>

          {/* Engine Selector Dropdown */}
          <div className="mb-3">
            <select
              value={selectedEngine}
              onChange={(e) => setSelectedEngine(e.target.value)}
              className="w-full rounded-lg p-3 text-base outline-none"
              style={{
                background: theme.bg,
                border: `1px solid ${theme.cardBorder}`,
                color: theme.text
              }}
            >
              <option value="whisper">Groq Whisper</option>
              <option value="deepgram">Deepgram Nova-3</option>
              <option value="whisperx">WhisperX (GPU)</option>
            </select>
          </div>

          {/* Trigger Transcription Button */}
          <button
            onClick={startTranscription}
            className="w-full rounded-xl p-4 text-center font-medium"
            style={{
              background: theme.accent,
              color: theme.bg,
              border: "none"
            }}
          >
            Transcrire →
          </button>
        </section>
      )}

      {/* Transcription Section - State C: Processing */}
      {transcriptionState === "processing" && (
        <section
          className="rounded-xl p-4 mb-4"
          style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
        >
          <label
            className="block text-xs font-medium mb-3 uppercase tracking-wide"
            style={{ color: theme.textSoft }}
          >
            Transcription
          </label>

          {/* Pulsing 'Transcription...' text */}
          <div className="mb-4 flex items-center gap-2">
            <span
              style={{
                color: theme.accent,
                fontSize: "0.875rem",
                fontWeight: 500,
                animation: "pulse 1.5s ease-in-out infinite"
              }}
            >
              Transcription...
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="rounded-full overflow-hidden"
            style={{
              background: theme.bg,
              height: "0.5rem"
            }}
          >
            <div
              style={{
                background: theme.accent,
                height: "100%",
                width: `${transcriptionProgress}%`,
                transition: "width 0.05s linear"
              }}
            />
          </div>

          {/* Progress percentage */}
          <div className="mt-2 text-right">
            <span
              style={{
                color: theme.textSoft,
                fontSize: "0.75rem",
                fontFamily: FONTS.mono
              }}
            >
              {Math.round(transcriptionProgress)}%
            </span>
          </div>

          {/* Inline CSS for pulse animation */}
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
          `}</style>
        </section>
      )}

      {/* Transcription Section - State D: Complete */}
      {transcriptionState === "complete" && (
        <section
          className="rounded-xl p-4 mb-4"
          style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
        >
          {/* Header with status, engine, and word count */}
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: theme.green, fontSize: "0.875rem", fontWeight: 500 }}>
              ✓ Terminé
            </span>
            <span style={{ color: theme.textSoft, fontSize: "0.875rem" }}>·</span>
            <span style={{ color: theme.textSoft, fontSize: "0.875rem" }}>
              {selectedEngine === "whisper" ? "Groq Whisper" :
               selectedEngine === "deepgram" ? "Deepgram Nova-3" :
               "WhisperX"}
            </span>
            <span style={{ color: theme.textSoft, fontSize: "0.875rem" }}>·</span>
            <span style={{ color: theme.textSoft, fontSize: "0.875rem" }}>
              {transcriptionText ? transcriptionText.split(/\s+/).filter(word => word.length > 0).length : 0} mots
            </span>
          </div>

          {/* Full transcription text */}
          <div
            className="mb-3"
            style={{
              color: theme.text,
              lineHeight: "1.5rem",
              fontSize: "0.875rem"
            }}
          >
            {transcriptionText || "Aucun texte transcrit"}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              className="flex-1 rounded-lg p-2 text-center text-sm font-medium"
              style={{
                background: theme.bg,
                border: `1px solid ${theme.cardBorder}`,
                color: theme.text
              }}
            >
              📝 Éditer
            </button>
            <button
              className="flex-1 rounded-lg p-2 text-center text-sm font-medium"
              style={{
                background: theme.bg,
                border: `1px solid ${theme.cardBorder}`,
                color: theme.text
              }}
            >
              📋 Copier
            </button>
            <button
              onClick={retryTranscription}
              className="flex-1 rounded-lg p-2 text-center text-sm font-medium"
              style={{
                background: theme.bg,
                border: `1px solid ${theme.cardBorder}`,
                color: theme.text
              }}
            >
              🔄 Refaire
            </button>
          </div>
        </section>
      )}

      {/* Notes Section */}
      <section
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
      >
        <label
          className="block text-xs font-medium mb-2 uppercase tracking-wide"
          style={{ color: theme.textSoft }}
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
          onClick={handleSave}
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
          onClick={handleDelete}
          className="rounded-xl p-4"
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            color: theme.red
          }}
        >
          🗑️
        </button>

        {/* Skip Button - Ghost Style */}
        <button
          onClick={handleSkip}
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
