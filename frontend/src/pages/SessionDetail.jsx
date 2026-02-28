import { useTheme } from "../hooks/useTheme.jsx";

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

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      <p style={{ color: theme.textMuted }}>Session detail — coming soon</p>
    </div>
  );
}
