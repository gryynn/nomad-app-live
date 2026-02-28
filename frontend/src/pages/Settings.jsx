import { useNavigate } from "react-router-dom";
import { useTheme } from "../hooks/useTheme.jsx";

export default function Settings() {
  const { theme, toggle, mode } = useTheme();
  const navigate = useNavigate();

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <header className="flex items-center mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-lg font-mono mr-2"
          style={{ color: theme.text }}
        >
          ←
        </button>
        <h1
          className="text-lg font-light tracking-[0.45em]"
          style={{ color: theme.text }}
        >
          Settings
        </h1>
      </header>

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
