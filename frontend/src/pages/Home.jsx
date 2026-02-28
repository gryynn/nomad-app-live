import { useTheme } from "../hooks/useTheme.jsx";

export default function Home() {
  const { theme } = useTheme();

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <h1
          className="text-lg font-light tracking-[0.45em]"
          style={{ color: theme.text }}
        >
          N O M A D
        </h1>
        <div className="flex gap-3">
          <button className="text-xl">⚙️</button>
          <button className="text-xl">👤</button>
        </div>
      </header>

      {/* Placeholder sections */}
      <section
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <p style={{ color: theme.textMuted }}>Device Selector — coming soon</p>
      </section>

      <section
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <p style={{ color: theme.textMuted }}>Engine Panel — coming soon</p>
      </section>

      <section className="grid grid-cols-2 gap-3 mb-4">
        <button
          className="rounded-xl p-6 text-center font-medium"
          style={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, color: theme.text }}
        >
          🎙️ REC
        </button>
        <button
          className="rounded-xl p-6 text-center font-medium"
          style={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, color: theme.text }}
        >
          ✍️ LIVE
        </button>
        <button
          className="rounded-xl p-6 text-center font-medium"
          style={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, color: theme.text }}
        >
          📂 Import
        </button>
        <button
          className="rounded-xl p-6 text-center font-medium"
          style={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, color: theme.text }}
        >
          📋 Coller
        </button>
      </section>

      <section
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <p style={{ color: theme.textMuted }}>Pré-config (sticky tags) — coming soon</p>
      </section>

      <section
        className="rounded-xl p-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <p style={{ color: theme.textMuted }}>Sessions récentes — coming soon</p>
      </section>
    </div>
  );
}
