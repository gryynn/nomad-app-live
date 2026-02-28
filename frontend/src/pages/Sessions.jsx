import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../hooks/useTheme.jsx";
import { DEFAULT_TAGS } from "../styles/themes.js";
import SessionCard from "../components/SessionCard.jsx";

export default function Sessions() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  // Mock session data
  const mockSessions = [
    { id: "sess-001", title: "Team standup insights", status: "done", tagId: "1", duration: 1847, date: "2026-02-28T09:30:00Z", transcriptLength: 2847 },
    { id: "sess-002", title: "Client call follow-up notes", status: "pending", tagId: "2", duration: 3421, date: "2026-02-27T14:20:00Z", transcriptLength: 0 },
    { id: "sess-003", title: "Podcast episode rough cut", status: "done", tagId: "3", duration: 5234, date: "2026-02-26T11:00:00Z", transcriptLength: 8942 },
    { id: "sess-004", title: "Quick memo after meeting", status: "done", tagId: "4", duration: 421, date: "2026-02-28T16:45:00Z", transcriptLength: 734 },
    { id: "sess-005", title: "Music sample ideas", status: "error", tagId: "5", duration: 1234, date: "2026-02-25T19:30:00Z", transcriptLength: 0 },
    { id: "sess-006", title: "Synth pad recording session", status: "pending", tagId: "6", duration: 2847, date: "2026-02-24T22:15:00Z", transcriptLength: 0 },
    { id: "sess-007", title: "Weekly work review thoughts", status: "done", tagId: "7", duration: 1653, date: "2026-02-23T18:00:00Z", transcriptLength: 2941 },
    { id: "sess-008", title: "Brainstorming new product feature", status: "done", tagId: "8", duration: 2199, date: "2026-02-27T10:30:00Z", transcriptLength: 3847 },
    { id: "sess-009", title: "Learning React patterns deep dive", status: "pending", tagId: "9", duration: 4821, date: "2026-02-22T15:45:00Z", transcriptLength: 0 },
    { id: "sess-010", title: "Personal reflection on goals", status: "done", tagId: "10", duration: 1024, date: "2026-02-21T20:00:00Z", transcriptLength: 1847 },
  ];

  const toggleTag = (tagId) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  // Combined filtering logic with useMemo
  const filteredSessions = useMemo(() => {
    return mockSessions.filter((session) => {
      // Search filter (title, case-insensitive)
      const matchesSearch = searchQuery.trim() === "" ||
        session.title.toLowerCase().includes(searchQuery.toLowerCase());

      // Tag filter (OR logic - match ANY selected tag)
      const matchesTags = selectedTags.length === 0 ||
        selectedTags.includes(session.tagId);

      // Status filter
      const matchesStatus = statusFilter === "all" ||
        session.status === statusFilter;

      // Combined (AND logic)
      return matchesSearch && matchesTags && matchesStatus;
    });
  }, [searchQuery, selectedTags, statusFilter]);

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
          {filteredSessions.length} session{filteredSessions.length > 1 ? "s" : ""} found
        </p>
      </div>

      {/* Sessions List */}
      <div className="flex flex-col gap-3">
        {filteredSessions.length === 0 ? (
          <div
            className="rounded-xl px-4 py-8 text-center"
            style={{
              background: theme.cardBg,
              border: `1px solid ${theme.cardBorder}`,
            }}
          >
            <p style={{ color: theme.textSoft }}>Aucune session trouvée</p>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onClick={(id) => navigate(`/sessions/${id}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}
