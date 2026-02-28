import { useTheme } from "../hooks/useTheme.jsx";
import { useLocation, useNavigate } from "react-router-dom";

export default function PostCapture() {
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { duration, marks, mode } = location.state || {};

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate("/")}
          className="text-2xl"
          style={{ opacity: 0.5 }}
        >
          ←
        </button>
        <div
          style={{
            fontSize: "14px",
            color: theme.textMuted,
            opacity: 0.7,
          }}
        >
          Post-Capture
        </div>
        <div style={{ width: 32 }}></div>
      </header>

      {/* Temporary debug info to verify state data */}
      <div className="flex flex-col gap-4">
        <div
          style={{
            padding: "16px",
            background: theme.surface,
            borderRadius: "8px",
            border: `1px solid ${theme.divider}`,
          }}
        >
          <div
            style={{
              fontSize: "12px",
              color: theme.textMuted,
              marginBottom: "12px",
            }}
          >
            Recording Data:
          </div>
          <div style={{ fontSize: "14px", color: theme.text }}>
            <div>Duration: {duration !== undefined ? formatTime(duration) : "N/A"}</div>
            <div>Mode: {mode || "N/A"}</div>
            <div>Marks: {marks ? marks.length : 0}</div>
          </div>
        </div>

        {marks && marks.length > 0 && (
          <div
            style={{
              padding: "16px",
              background: theme.surface,
              borderRadius: "8px",
              border: `1px solid ${theme.divider}`,
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: theme.textMuted,
                marginBottom: "12px",
              }}
            >
              Marks List:
            </div>
            {marks.map((mark) => (
              <div
                key={mark.id}
                style={{
                  fontSize: "12px",
                  color: theme.text,
                  marginBottom: "8px",
                }}
              >
                {formatTime(mark.time)} - {mark.tag?.label || "No tag"}
              </div>
            ))}
          </div>
        )}

        <p
          style={{
            fontSize: "11px",
            color: theme.textMuted,
            opacity: 0.5,
            textAlign: "center",
            marginTop: "24px",
          }}
        >
          Full post-capture UI — coming soon
        </p>
      </div>
    </div>
  );
}
