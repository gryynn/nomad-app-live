export default function TagChip({ tag, selected, onToggle, size = "md" }) {
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm";

  return (
    <button
      onClick={() => onToggle?.(tag.id)}
      className={`rounded-full inline-flex items-center gap-1.5 font-medium transition-all ${padding}`}
      style={{
        background: selected ? tag.hue + "22" : "transparent",
        border: `1px solid ${selected ? tag.hue : tag.hue + "44"}`,
        color: tag.hue,
        opacity: selected ? 1 : 0.65,
      }}
    >
      <span>{tag.emoji}</span>
      <span>{tag.name}</span>
    </button>
  );
}
