import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../hooks/useTheme.jsx";
import { FONTS, DEFAULT_TAGS } from "../styles/themes.js";
import TagChip from "../components/TagChip.jsx";

// Mock session data for UI development
const mockSession = {
  id: "sess-009",
  title: "Conversation philosophique sur l'intelligence artificielle",
  date: "2026-02-28T14:30:00Z",
  duration: 342, // 5 minutes 42 seconds
  engine: "engine-2",
  engineName: "Deepgram Nova-3",
  device: "device-2",
  deviceName: "Rode NT-USB",
  status: "completed",
  wordCount: 203,
  cost: 0.024,
  language: "fr",

  // Metadata
  metadata: {
    recordedAt: "2026-02-28T14:30:00Z",
    completedAt: "2026-02-28T14:36:15Z",
    sampleRate: 48000,
    channels: 1,
    format: "audio/webm",
    fileSize: 2847392, // bytes
    storageUrl: "sessions/2026/02/sess-009.webm",
  },

  // Tags
  tags: [
    {
      id: "tag-philosophy",
      name: "Philosophie",
      emoji: "🤔",
      color: "#9B59B6",
      parentId: null,
    },
    {
      id: "tag-technology",
      name: "Technologie",
      emoji: "💻",
      color: "#3498DB",
      parentId: null,
    },
  ],

  // Transcript segments with timestamps
  segments: [
    {
      id: "seg-1",
      start: 0.0,
      end: 58.3,
      text: "Bonjour à tous. Aujourd'hui, nous allons discuter d'un sujet fascinant qui touche à la fois la philosophie et la technologie. L'intelligence artificielle transforme notre monde à une vitesse remarquable. Mais qu'est-ce que cela signifie vraiment pour l'humanité et notre compréhension de la conscience?",
      speaker: null,
      confidence: 0.94,
    },
    {
      id: "seg-2",
      start: 58.3,
      end: 128.7,
      text: "Les philosophes ont longtemps débattu de la nature de l'esprit et de la pensée. Descartes parlait du dualisme entre le corps et l'âme. Mais aujourd'hui, avec l'émergence des systèmes d'IA sophistiqués, nous devons reconsidérer ces questions anciennes sous un nouvel angle. Est-ce qu'une machine peut vraiment penser? Ou simule-t-elle simplement la pensée?",
      speaker: null,
      confidence: 0.92,
    },
    {
      id: "seg-3",
      start: 128.7,
      end: 197.5,
      text: "Le test de Turing, proposé en 1950, suggérait qu'une machine qui peut imiter le comportement humain de manière indiscernable devrait être considérée comme intelligente. Mais est-ce suffisant? La conscience nécessite-t-elle quelque chose de plus qu'une simple imitation? C'est là que la philosophie de l'esprit devient vraiment intéressante.",
      speaker: null,
      confidence: 0.96,
    },
    {
      id: "seg-4",
      start: 197.5,
      end: 264.2,
      text: "John Searle, avec son expérience de pensée de la chambre chinoise, a argumenté que la syntaxe ne suffit pas pour créer la sémantique. En d'autres termes, manipuler des symboles selon des règles ne crée pas nécessairement une compréhension véritable. C'est un point crucial dans notre réflexion sur l'IA.",
      speaker: null,
      confidence: 0.93,
    },
    {
      id: "seg-5",
      start: 264.2,
      end: 317.8,
      text: "Aujourd'hui, nous devons nous demander: quelles sont les implications éthiques de créer des entités artificielles qui peuvent apprendre, s'adapter, et peut-être même ressentir? Ces questions ne sont plus de la pure spéculation philosophique.",
      speaker: null,
      confidence: 0.95,
    },
    {
      id: "seg-6",
      start: 317.8,
      end: 342.0,
      text: "Elles sont urgentes et nécessitent notre attention collective. Merci de votre écoute, et n'hésitez pas à poursuivre cette réflexion.",
      speaker: null,
      confidence: 0.97,
    },
  ],

  // Marks (timestamps for important moments)
  marks: [
    {
      id: "mark-1",
      timestamp: 58.3,
      label: "Référence à Descartes",
      type: "reference",
      color: "#9B59B6",
    },
    {
      id: "mark-2",
      timestamp: 128.7,
      label: "Test de Turing",
      type: "key-concept",
      color: "#3498DB",
    },
    {
      id: "mark-3",
      timestamp: 197.5,
      label: "Chambre chinoise de Searle",
      type: "key-concept",
      color: "#3498DB",
    },
    {
      id: "mark-4",
      timestamp: 264.2,
      label: "Questions éthiques",
      type: "important",
      color: "#E74C3C",
    },
  ],

  // Notes
  notes: [
    {
      id: "note-1",
      timestamp: 58.3,
      content: "Explorer davantage la position de Descartes sur le dualisme corps-esprit",
      createdAt: "2026-02-28T14:37:00Z",
    },
    {
      id: "note-2",
      timestamp: 197.5,
      content: "Relire l'argument de la chambre chinoise - implications pour l'IA moderne",
      createdAt: "2026-02-28T14:38:30Z",
    },
    {
      id: "note-3",
      timestamp: null,
      content: "Idée pour le prochain enregistrement: discuter de l'éthique de l'IA dans le contexte de l'emploi",
      createdAt: "2026-02-28T14:40:00Z",
    },
  ],

  // Full transcript (concatenated)
  fullTranscript: "Bonjour à tous. Aujourd'hui, nous allons discuter d'un sujet fascinant qui touche à la fois la philosophie et la technologie. L'intelligence artificielle transforme notre monde à une vitesse remarquable. Mais qu'est-ce que cela signifie vraiment pour l'humanité et notre compréhension de la conscience? Les philosophes ont longtemps débattu de la nature de l'esprit et de la pensée. Descartes parlait du dualisme entre le corps et l'âme. Mais aujourd'hui, avec l'émergence des systèmes d'IA sophistiqués, nous devons reconsidérer ces questions anciennes sous un nouvel angle. Est-ce qu'une machine peut vraiment penser? Ou simule-t-elle simplement la pensée? Le test de Turing, proposé en 1950, suggérait qu'une machine qui peut imiter le comportement humain de manière indiscernable devrait être considérée comme intelligente. Mais est-ce suffisant? La conscience nécessite-t-elle quelque chose de plus qu'une simple imitation? C'est là que la philosophie de l'esprit devient vraiment intéressante. John Searle, avec son expérience de pensée de la chambre chinoise, a argumenté que la syntaxe ne suffit pas pour créer la sémantique. En d'autres termes, manipuler des symboles selon des règles ne crée pas nécessairement une compréhension véritable. C'est un point crucial dans notre réflexion sur l'IA. Aujourd'hui, nous devons nous demander: quelles sont les implications éthiques de créer des entités artificielles qui peuvent apprendre, s'adapter, et peut-être même ressentir? Ces questions ne sont plus de la pure spéculation philosophique. Elles sont urgentes et nécessitent notre attention collective. Merci de votre écoute, et n'hésitez pas à poursuivre cette réflexion.",
};

export default function SessionDetail() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  // State for inline title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(mockSession.title);
  const [editedTitle, setEditedTitle] = useState(mockSession.title);
  const titleInputRef = useRef(null);

  // State for tags
  // Initialize with some DEFAULT_TAGS that match the session's theme
  const [selectedTags, setSelectedTags] = useState(() => {
    // For UI demo, select tags with IDs "1" (Insight) and "9" (Learning)
    // In production, this would come from the database
    return DEFAULT_TAGS.filter(tag => ["1", "9"].includes(tag.id));
  });

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Handle title edit start
  const handleTitleClick = () => {
    setEditedTitle(title);
    setIsEditingTitle(true);
  };

  // Handle title save
  const handleTitleSave = () => {
    if (editedTitle.trim()) {
      setTitle(editedTitle.trim());
    } else {
      setEditedTitle(title); // Revert if empty
    }
    setIsEditingTitle(false);
  };

  // Handle title cancel
  const handleTitleCancel = () => {
    setEditedTitle(title);
    setIsEditingTitle(false);
  };

  // Handle keyboard events
  const handleTitleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleTitleCancel();
    }
  };

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

  // Format duration from seconds to MM:SS or HH:MM:SS
  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Format date to relative or absolute
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `Il y a ${diffDays}j`;

    // Format as DD/MM/YYYY
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      {/* Header with back button and editable title */}
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/")}
          className="text-xl"
          style={{ color: theme.text }}
        >
          ←
        </button>

        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleTitleKeyDown}
            className="flex-1 bg-transparent border-none outline-none"
            style={{
              fontFamily: FONTS.body,
              fontSize: "16px",
              fontWeight: 400,
              color: theme.text,
            }}
          />
        ) : (
          <h1
            onClick={handleTitleClick}
            className="flex-1 cursor-pointer"
            style={{
              fontFamily: FONTS.body,
              fontSize: "16px",
              fontWeight: 400,
              color: theme.text,
            }}
          >
            {title}
          </h1>
        )}
      </header>

      {/* Meta information row */}
      <div
        className="flex items-center gap-4 flex-wrap text-xs"
        style={{
          fontFamily: FONTS.mono,
          fontSize: "10px",
          color: theme.textGhost,
        }}
      >
        <span>{formatDate(mockSession.date)}</span>
        <span>•</span>
        <span>{formatDuration(mockSession.duration)}</span>
        <span>•</span>
        <span>{mockSession.deviceName}</span>
        <span>•</span>
        <span>{mockSession.engineName}</span>
        <span>•</span>
        <span className="capitalize">{mockSession.status}</span>
      </div>

      {/* Tags Section */}
      <section
        className="rounded-xl p-4 mt-6"
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

      {/* Placeholder content */}
      <p className="mt-6" style={{ color: theme.textSoft }}>
        Rest of content coming soon...
      </p>
    </div>
  );
}
