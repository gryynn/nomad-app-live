import { useNavigate } from "react-router-dom";
import { useTheme } from "../hooks/useTheme.jsx";
import { useState } from "react";
import { FONTS } from "../styles/themes.js";

export default function Settings() {
  const { theme, toggle, mode } = useTheme();
  const navigate = useNavigate();
  const [language, setLanguage] = useState("fr");
  const [engine, setEngine] = useState("groq");

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <header className="flex items-center mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-lg font-mono mr-2"
          style={{ color: theme.text }}
        >
          ←
        </button>
        <h1
          className="text-lg font-light tracking-[0.45em]"
          style={{ color: theme.text }}
        >
          Settings
        </h1>
      </header>

      {/* Statistics Grid */}
      <section className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="rounded-xl"
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            padding: "18px 16px",
          }}
        >
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: "20px",
              opacity: 0.6,
              color: theme.text,
              marginBottom: "4px",
            }}
          >
            247
          </div>
          <div
            style={{
              fontSize: "9.5px",
              color: theme.textSoft,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Sessions
          </div>
        </div>

        <div
          className="rounded-xl"
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            padding: "18px 16px",
          }}
        >
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: "20px",
              opacity: 0.6,
              color: theme.text,
              marginBottom: "4px",
            }}
          >
            12.4h
          </div>
          <div
            style={{
              fontSize: "9.5px",
              color: theme.textSoft,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Duration
          </div>
        </div>

        <div
          className="rounded-xl"
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            padding: "18px 16px",
          }}
        >
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: "20px",
              opacity: 0.6,
              color: theme.text,
              marginBottom: "4px",
            }}
          >
            18
          </div>
          <div
            style={{
              fontSize: "9.5px",
              color: theme.textSoft,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            This Week
          </div>
        </div>

        <div
          className="rounded-xl"
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            padding: "18px 16px",
          }}
        >
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: "20px",
              opacity: 0.6,
              color: theme.text,
              marginBottom: "4px",
            }}
          >
            2.1GB
          </div>
          <div
            style={{
              fontSize: "9.5px",
              color: theme.textSoft,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Storage
          </div>
        </div>
      </section>

      <button
        onClick={toggle}
        className="rounded-xl p-4 text-left"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <span style={{ color: theme.textSecondary }}>Theme: </span>
        <span style={{ color: theme.accent }}>{mode === "oled" ? "OLED (Dark)" : "Light"}</span>
      </button>

      {/* Language Selector */}
      <div
        className="rounded-xl p-4 mt-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <label htmlFor="language-select" style={{ color: theme.textSecondary }}>
          Language:{" "}
        </label>
        <select
          id="language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded px-2 py-1 ml-2"
          style={{
            background: theme.surface,
            color: theme.accent,
            border: `1px solid ${theme.cardBorder}`,
          }}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Transcription Engine Selector */}
      <div
        className="rounded-xl p-4 mt-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <div style={{ color: theme.textSecondary, marginBottom: "12px" }}>
          Default Transcription Engine:
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setEngine("groq")}
            className="rounded-lg p-3 text-left transition-colors"
            style={{
              background: engine === "groq" ? theme.surface : "transparent",
              border: `1px solid ${engine === "groq" ? theme.accent : theme.cardBorder}`,
              color: engine === "groq" ? theme.accent : theme.text,
            }}
          >
            Groq Whisper
          </button>
          <button
            onClick={() => setEngine("deepgram")}
            className="rounded-lg p-3 text-left transition-colors"
            style={{
              background: engine === "deepgram" ? theme.surface : "transparent",
              border: `1px solid ${engine === "deepgram" ? theme.accent : theme.cardBorder}`,
              color: engine === "deepgram" ? theme.accent : theme.text,
            }}
          >
            Deepgram Nova-3
          </button>
          <button
            onClick={() => setEngine("whisperx")}
            className="rounded-lg p-3 text-left transition-colors"
            style={{
              background: engine === "whisperx" ? theme.surface : "transparent",
              border: `1px solid ${engine === "whisperx" ? theme.accent : theme.cardBorder}`,
              color: engine === "whisperx" ? theme.accent : theme.text,
            }}
          >
            WhisperX (Local GPU)
          </button>
        </div>
      </div>

      {/* Engine Usage Statistics */}
      <div
        className="rounded-xl p-4 mt-4"
        style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
      >
        <div
          style={{
            fontSize: "9.5px",
            color: theme.textSoft,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: "16px",
          }}
        >
          Engine Usage
        </div>

        {/* Groq Whisper - 60% */}
        <div style={{ marginBottom: "14px" }}>
          <div className="flex justify-between items-center" style={{ marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", color: theme.text }}>
              Groq Whisper • 0.24€
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "1.5px",
              background: theme.sep,
              borderRadius: "1px",
            }}
          >
            <div
              style={{
                width: "60%",
                height: "100%",
                background: theme.accent,
                borderRadius: "1px",
              }}
            />
          </div>
        </div>

        {/* Deepgram Nova-3 - 30% */}
        <div style={{ marginBottom: "14px" }}>
          <div className="flex justify-between items-center" style={{ marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", color: theme.text }}>
              Deepgram Nova-3 • 0.15€
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "1.5px",
              background: theme.sep,
              borderRadius: "1px",
            }}
          >
            <div
              style={{
                width: "30%",
                height: "100%",
                background: theme.accent,
                borderRadius: "1px",
              }}
            />
          </div>
        </div>

        {/* WhisperX - 10% */}
        <div>
          <div className="flex justify-between items-center" style={{ marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", color: theme.text }}>
              WhisperX (Local GPU) • 0.05€
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "1.5px",
              background: theme.sep,
              borderRadius: "1px",
            }}
          >
            <div
              style={{
                width: "10%",
                height: "100%",
                background: theme.accent,
                borderRadius: "1px",
              }}
            />
          </div>
        </div>
      </div>

      {/* About Section */}
      <div
        className="rounded-xl p-4 mt-4"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <div
          style={{
            fontSize: "9.5px",
            color: theme.textSoft,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: "12px",
          }}
        >
          About
        </div>
        <div style={{ marginBottom: "8px" }}>
          <span style={{ color: theme.textSecondary }}>Version: </span>
          <span style={{ color: theme.accent, fontFamily: FONTS.mono }}>v0.1.0</span>
        </div>
        <div>
          <a
            href="https://github.com/yourusername/nomad-pwa"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: theme.accent, textDecoration: "none" }}
            className="hover:underline"
          >
            View on GitHub →
          </a>
        </div>
      </div>
    </div>
  );
}
