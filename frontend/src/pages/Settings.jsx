import { useTheme } from "../hooks/useTheme.jsx";

export default function Settings() {
  const { theme, toggle, mode } = useTheme();

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      <h1 className="text-lg font-light tracking-[0.45em] mb-6">Settings</h1>

      <button
        onClick={toggle}
        className="rounded-xl p-4 text-left"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
      >
        <span style={{ color: theme.textSecondary }}>Theme: </span>
        <span style={{ color: theme.accent }}>{mode === "oled" ? "OLED (Dark)" : "Light"}</span>
      </button>
    </div>
  );
}
