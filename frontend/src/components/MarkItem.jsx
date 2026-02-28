import { useTheme } from "../hooks/useTheme.jsx";

/**
 * MarkItem - Displays a recording mark with timestamp and label
 * @param {Object} props
 * @param {string|number} props.timestamp - Timestamp in seconds or formatted string (mm:ss)
 * @param {string} props.label - Mark label/description
 */
export default function MarkItem({ timestamp, label }) {
  const { theme } = useTheme();

  // Format timestamp if it's a number (seconds)
  const formatTimestamp = (ts) => {
    if (typeof ts === "string") return ts;
    const minutes = Math.floor(ts / 60);
    const seconds = Math.floor(ts % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-3 py-2">
      {/* Timestamp - JetBrains Mono, opacity 0.5 */}
      <span
        className="font-mono text-sm"
        style={{
          color: theme.text,
          opacity: 0.5,
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        {formatTimestamp(timestamp)}
      </span>

      {/* Label - Outfit weight 300 */}
      <span
        className="text-sm font-light"
        style={{
          color: theme.text,
          fontWeight: 300,
        }}
      >
        {label}
      </span>
    </div>
  );
}
