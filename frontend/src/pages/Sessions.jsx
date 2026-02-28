import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../hooks/useTheme.jsx";
import { DEFAULT_TAGS } from "../styles/themes.js";

export default function Sessions() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  // Mock session data
  const mockSessions = [
    { id: "1", title: "Session test 1", date: "2024-01-15", status: "done", tags: ["1", "4"] },
    { id: "2", title: "Session test 2", date: "2024-01-14", status: "pending", tags: ["2"] },
    { id: "3", title: "Session test 3", date: "2024-01-13", status: "done", tags: ["3", "7"] },
  ];

  const toggleTag = (tagId) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/")}
          className="text-xl"
          style={{ color: theme.text }}
        >
          ←
        </button>
        <h1
          className="text-lg font-light tracking-[0.25em]"
          style={{ color: theme.text }}
        >
          Sessions
        </h1>
      </header>

      {/* Search Input */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Rechercher..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl px-4 py-3 outline-none"
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            color: theme.text,
          }}
        />
      </div>

      {/* Tag Filter Chips */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          {DEFAULT_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className="rounded-full px-3 py-1.5 text-sm font-medium transition-all"
                style={{
                  background: isSelected ? theme.accentMid : theme.cardBg,
                  border: `1px solid ${isSelected ? theme.accent : theme.cardBorder}`,
                  color: isSelected ? theme.accent : theme.textSoft,
                }}
              >
                {tag.emoji} {tag.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Filter Buttons */}
      <div className="mb-4">
        <div className="flex gap-2">
          {[
            { id: "all", label: "All" },
            { id: "pending", label: "Pending" },
            { id: "done", label: "Done" },
          ].map((status) => {
            const isActive = statusFilter === status.id;
            return (
              <button
                key={status.id}
                onClick={() => setStatusFilter(status.id)}
                className="flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-all"
                style={{
                  background: isActive ? theme.accentMid : theme.cardBg,
                  border: `1px solid ${isActive ? theme.accent : theme.cardBorder}`,
                  color: isActive ? theme.accent : theme.textSoft,
                }}
              >
                {status.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Bar */}
      <div
        className="rounded-xl px-4 py-3 mb-4"
        style={{
          background: theme.cardBg,
          border: `1px solid ${theme.cardBorder}`,
        }}
      >
        <p className="text-sm" style={{ color: theme.textSoft }}>
          {mockSessions.length} session{mockSessions.length > 1 ? "s" : ""} found
        </p>
      </div>

      {/* Sessions List (Mock) */}
      <div className="flex flex-col gap-3">
        {mockSessions.map((session) => (
          <div
            key={session.id}
            className="rounded-xl p-4"
            style={{
              background: theme.cardBg,
              border: `1px solid ${theme.cardBorder}`,
            }}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium" style={{ color: theme.text }}>
                {session.title}
              </h3>
              <span
                className="text-xs px-2 py-1 rounded"
                style={{
                  background: session.status === "done" ? theme.green : theme.orange,
                  color: theme.bg,
                }}
              >
                {session.status}
              </span>
            </div>
            <p className="text-sm" style={{ color: theme.textSoft }}>
              {session.date}
            </p>
            <div className="flex gap-2 mt-2">
              {session.tags.map((tagId) => {
                const tag = DEFAULT_TAGS.find((t) => t.id === tagId);
                return tag ? (
                  <span
                    key={tagId}
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      background: theme.accentSoft,
                      color: theme.textSoft,
                    }}
                  >
                    {tag.emoji} {tag.name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
