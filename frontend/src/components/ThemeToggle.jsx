import { useTheme } from "../hooks/useTheme.jsx";

export default function ThemeToggle() {
  const { mode, toggle, theme } = useTheme();

  return (
    <button
      onClick={toggle}
      className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
      style={{ background: theme.surface, border: `1px solid ${theme.cardBorder}` }}
      title={mode === "oled" ? "Switch to Light" : "Switch to OLED"}
    >
      {mode === "oled" ? "☀️" : "🌙"}
    </button>
  );
}
