import { useState } from "react";
import TagChip from "./TagChip.jsx";
import { useTheme } from "../hooks/useTheme.jsx";

const QUICK_TAGS = [
  { id: "m1", name: "Important", emoji: "💡", color: "#C09060" },
  { id: "m2", name: "Question", emoji: "❓", color: "#8888BB" },
  { id: "m3", name: "Action", emoji: "✅", color: "#6BAA88" },
  { id: "m4", name: "Risque", emoji: "⚠️", color: "#BB8888" },
  { id: "m5", name: "Clé", emoji: "🔑", color: "#B8A060" },
  { id: "m6", name: "Personne", emoji: "👤", color: "#7098BB" },
];

export default function MarkItem({ mark, onUpdateTag }) {
  const { theme } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const handleTagSelect = (tagId) => {
    const selectedTag = QUICK_TAGS.find((t) => t.id === tagId);
    if (selectedTag) {
      onUpdateTag?.(mark.id, selectedTag);
      setPickerVisible(false);
    }
  };

  const handleMarkClick = () => {
    setPickerVisible(!pickerVisible);
  };

  return (
    <div className="mark-item mb-3">
      <div className="flex items-center gap-3">
        {/* Timestamp */}
        <span
          className="mark-time"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "10px",
            color: theme.textMuted,
            fontWeight: 400,
            minWidth: "40px",
          }}
        >
          {formatTime(mark.time)}
        </span>

        {/* Tag Chip or Default Button */}
        {mark.tag ? (
          <div onClick={handleMarkClick} className="cursor-pointer">
            <TagChip tag={mark.tag} size="sm" />
          </div>
        ) : (
          <button
            onClick={handleMarkClick}
            className="px-2 py-0.5 text-xs rounded-full inline-flex items-center gap-1.5 font-medium transition-all"
            style={{
              border: `1px solid ${theme.divider}`,
              color: theme.textSecondary,
              opacity: 0.6,
            }}
          >
            <span>+</span>
            <span>Tag</span>
          </button>
        )}
      </div>

      {/* Inline Tag Picker */}
      {pickerVisible && (
        <div
          className="tag-picker mt-2 p-2 rounded-lg"
          style={{
            background: theme.surface,
            border: `1px solid ${theme.divider}`,
          }}
        >
          <div className="flex flex-wrap gap-2">
            {QUICK_TAGS.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                selected={mark.tag?.id === tag.id}
                onToggle={handleTagSelect}
                size="sm"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
