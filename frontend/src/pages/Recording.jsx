import { useTheme } from "../hooks/useTheme.jsx";

export default function Recording() {
  const { theme } = useTheme();

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col items-center justify-center px-4"
    >
      <p style={{ color: theme.textMuted }}>Recording screen — coming soon</p>
    </div>
  );
}
