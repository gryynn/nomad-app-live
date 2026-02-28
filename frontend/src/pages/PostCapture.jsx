import { useTheme } from "../hooks/useTheme.jsx";

export default function PostCapture() {
  const { theme } = useTheme();

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      <p style={{ color: theme.textMuted }}>Post-capture screen — coming soon</p>
    </div>
  );
}
