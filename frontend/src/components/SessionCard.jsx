import { useTheme } from "../hooks/useTheme.jsx";
import { DEFAULT_TAGS, FONTS } from "../styles/themes.js";

export default function SessionCard({ session, onClick }) {
  const { theme } = useTheme();

  // Find tag from DEFAULT_TAGS
  const tag = DEFAULT_TAGS.find((t) => t.id === session.tagId);

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

  // Status dot color
  const getStatusColor = () => {
    if (session.status === "done") return theme.green;
    if (session.status === "pending") return theme.orange;
    if (session.status === "error") return theme.red;
    return theme.textGhost;
  };

  return (
    <button
      onClick={() => onClick?.(session.id)}
      className="w-full text-left rounded-xl p-4 transition-all"
      style={{
        background: theme.cardBg,
        border: `1px solid ${theme.cardBorder}`,
        color: theme.text,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = theme.accentSoft;
        e.currentTarget.style.borderColor = theme.sepStrong;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = theme.cardBg;
        e.currentTarget.style.borderColor = theme.cardBorder;
      }}
    >
      {/* Top row: Status dot + Title */}
      <div className="flex items-start gap-3 mb-2">
        {/* Status dot */}
        <div
          className="rounded-full mt-1.5 flex-shrink-0"
          style={{
            width: "6px",
            height: "6px",
            background: getStatusColor(),
          }}
        />
        {/* Title */}
        <h3
          className="font-light text-sm flex-1 truncate"
          style={{ color: theme.text }}
        >
          {session.title}
        </h3>
      </div>

      {/* Bottom row: Tag + Duration + Date */}
      <div className="flex items-center justify-between gap-3 pl-9">
        {/* Tag */}
        <div className="flex items-center gap-1.5">
          {tag && (
            <>
              <span className="text-xs">{tag.emoji}</span>
              <span
                className="text-xs font-light"
                style={{ color: tag.hue || theme.textSoft }}
              >
                {tag.name}
              </span>
            </>
          )}
        </div>

        {/* Duration + Date */}
        <div className="flex items-center gap-3 text-xs" style={{ color: theme.textSoft }}>
          <span style={{ fontFamily: FONTS.mono }}>{formatDuration(session.duration)}</span>
          <span className="font-light">{formatDate(session.date)}</span>
        </div>
      </div>
    </button>
  );
}
