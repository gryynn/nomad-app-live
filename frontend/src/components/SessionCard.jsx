import { useTheme } from "../hooks/useTheme";
import { useNavigate } from "react-router-dom";
import { formatDuration, formatRelativeDate } from "../lib/mockData";

export default function SessionCard({ session }) {
  const { theme } = useTheme();
  const navigate = useNavigate();

  if (!session) return null;

  // Truncate title at 50 characters
  const truncatedTitle =
    session.title.length > 50
      ? session.title.substring(0, 50) + "..."
      : session.title;

  // Map status to color
  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return theme.success;
      case "processing":
        return theme.warning;
      case "recording":
        return theme.danger;
      default:
        return theme.textMuted;
    }
  };

  const handleClick = () => {
    navigate(`/sessions/${session.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className="session-card"
      style={{
        padding: "12px 0",
        borderBottom: `1px solid ${theme.divider}`,
        cursor: "pointer",
        transition: "opacity 0.2s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        {/* Status dot - 3px */}
        <div
          style={{
            width: "3px",
            height: "3px",
            borderRadius: "50%",
            backgroundColor: getStatusColor(session.status),
            marginTop: "8px",
            flexShrink: 0,
          }}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div
            style={{
              fontSize: "15px",
              fontWeight: 400,
              color: theme.text,
              marginBottom: "6px",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            {truncatedTitle}
          </div>

          {/* Meta row: tag + duration + date */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            {/* Tag with emoji */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "13px",
                color: theme.textSecondary,
              }}
            >
              <span style={{ opacity: 0.65 }}>{session.tagEmoji}</span>
              <span style={{ fontFamily: "Outfit, sans-serif" }}>
                {session.tagName}
              </span>
            </div>

            {/* Duration - mono font */}
            <div
              style={{
                fontSize: "13px",
                color: theme.textSecondary,
                fontFamily: "JetBrains Mono, monospace",
                fontWeight: 400,
              }}
            >
              {formatDuration(session.duration)}
            </div>

            {/* Date */}
            <div
              style={{
                fontSize: "13px",
                color: theme.textMuted,
                fontFamily: "Outfit, sans-serif",
              }}
            >
              {formatRelativeDate(session.date)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
