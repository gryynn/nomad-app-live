import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../hooks/useTheme.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import DeviceSelector from "../components/DeviceSelector.jsx";
import EnginePanel from "../components/EnginePanel.jsx";
import SessionCard from "../components/SessionCard.jsx";
import TagChip from "../components/TagChip.jsx";
import { sessions, getTopLevelTags } from "../lib/mockData.js";

export default function Home() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState("fr");

  const topLevelTags = getTopLevelTags();
  const recentSessions = sessions.slice(0, 5); // Show only 5 most recent

  const handleTagToggle = (tagId) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleActionClick = (action) => {
    // Navigation to be implemented later
    navigate(`/${action}`);
  };

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      {/* 1. Header with logo, theme toggle, settings icon */}
      <header className="flex items-center justify-between mb-6">
        <h1
          className="text-lg font-light tracking-[0.45em]"
          style={{ color: theme.text }}
        >
          N O M A D
        </h1>
        <div className="flex gap-3 items-center">
          <ThemeToggle />
          <button
            onClick={() => navigate("/settings")}
            className="text-xl"
            style={{ opacity: 0.65 }}
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* 2. Device Selector */}
      <section className="mb-4">
        <DeviceSelector />
      </section>

      {/* 3. Engine Panel */}
      <section className="mb-4">
        <EnginePanel />
      </section>

      {/* 4. Action cards grid (REC with red border, LIVE with accent border) */}
      <section className="grid grid-cols-2 gap-3 mb-4">
        {/* REC - Red border */}
        <button
          onClick={() => handleActionClick("record")}
          className="rounded-xl p-6 text-center font-medium transition-all"
          style={{
            background: theme.card,
            border: `2px solid ${theme.danger}`,
            color: theme.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.surfaceHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = theme.card;
          }}
        >
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>🎙️</div>
          <div style={{ fontSize: "14px", fontWeight: 500 }}>REC</div>
        </button>

        {/* LIVE - Accent border */}
        <button
          onClick={() => handleActionClick("live")}
          className="rounded-xl p-6 text-center font-medium transition-all"
          style={{
            background: theme.card,
            border: `2px solid ${theme.accent}`,
            color: theme.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.surfaceHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = theme.card;
          }}
        >
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>✍️</div>
          <div style={{ fontSize: "14px", fontWeight: 500 }}>LIVE</div>
        </button>

        {/* Import - Standard border */}
        <button
          onClick={() => handleActionClick("import")}
          className="rounded-xl p-6 text-center font-medium transition-all"
          style={{
            background: theme.card,
            border: `1px solid ${theme.cardBorder}`,
            color: theme.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.surfaceHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = theme.card;
          }}
        >
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>📂</div>
          <div style={{ fontSize: "14px", fontWeight: 500 }}>Import</div>
        </button>

        {/* Coller - Standard border */}
        <button
          onClick={() => handleActionClick("paste")}
          className="rounded-xl p-6 text-center font-medium transition-all"
          style={{
            background: theme.card,
            border: `1px solid ${theme.cardBorder}`,
            color: theme.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.surfaceHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = theme.card;
          }}
        >
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>📋</div>
          <div style={{ fontSize: "14px", fontWeight: 500 }}>Coller</div>
        </button>
      </section>

      {/* 5. Pre-config section with tags and language */}
      <section
        className="rounded-xl p-4 mb-4"
        style={{
          background: theme.card,
          border: `1px solid ${theme.cardBorder}`,
        }}
      >
        <div style={{ marginBottom: "12px" }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: theme.textSecondary,
              marginBottom: "8px",
            }}
          >
            Tags épinglés
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {topLevelTags.slice(0, 5).map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                selected={selectedTags.includes(tag.id)}
                onToggle={() => handleTagToggle(tag.id)}
              />
            ))}
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: theme.textSecondary,
              marginBottom: "8px",
            }}
          >
            Langue
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {["fr", "en", "es"].map((lang) => (
              <button
                key={lang}
                onClick={() => setSelectedLanguage(lang)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  background:
                    selectedLanguage === lang ? theme.accent : theme.surface,
                  color:
                    selectedLanguage === lang ? theme.bg : theme.textSecondary,
                  border: `1px solid ${
                    selectedLanguage === lang ? theme.accent : theme.divider
                  }`,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (selectedLanguage !== lang) {
                    e.currentTarget.style.background = theme.surfaceHover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedLanguage !== lang) {
                    e.currentTarget.style.background = theme.surface;
                  }
                }}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Recent sessions list with 'Tout voir →' link */}
      <section
        className="rounded-xl p-4"
        style={{
          background: theme.card,
          border: `1px solid ${theme.cardBorder}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: theme.textSecondary,
            }}
          >
            Sessions récentes
          </div>
          <Link
            to="/sessions"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: theme.accent,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.7";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            Tout voir →
          </Link>
        </div>

        <div>
          {recentSessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      </section>
    </div>
  );
}
