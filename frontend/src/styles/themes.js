export const THEMES = {
  oled: {
    name: "oled",
    bg: "#000000",
    surface: "#060606",
    text: "#D0D0D0",
    textSoft: "#666666",
    textGhost: "#383838",
    accent: "#D8CAA0",
    accentSoft: "rgba(216,202,160,0.05)",
    accentMid: "rgba(216,202,160,0.10)",
    red: "#D08070",
    green: "#80B885",
    orange: "#CCA85E",
    blue: "#7A9EC4",
    sep: "rgba(255,255,255,0.03)",
    sepStrong: "rgba(255,255,255,0.055)",
    cardBg: "rgba(255,255,255,0.015)",
    cardBorder: "rgba(255,255,255,0.025)",
  },
  light: {
    name: "light",
    bg: "#F0EFEB",
    surface: "#F8F7F4",
    text: "#222222",
    textSoft: "#7A7A7A",
    textGhost: "#BABABA",
    accent: "#5A5245",
    accentSoft: "rgba(90,82,69,0.04)",
    accentMid: "rgba(90,82,69,0.08)",
    red: "#B85C55",
    green: "#4E8A55",
    orange: "#A07C2E",
    blue: "#4A78A5",
    sep: "rgba(0,0,0,0.035)",
    sepStrong: "rgba(0,0,0,0.06)",
    cardBg: "#FFFFFF",
    cardBorder: "rgba(0,0,0,0.04)",
  },
};

export const FONTS = {
  body: "'Outfit', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
  weights: {
    thin: 200,
    light: 300,
    regular: 400,
    medium: 500,
    semi: 600
  }
};

export const DEFAULT_TAGS = [
  { id: "1", name: "Insight", emoji: "🧠", hue: "#8888BB" },
  { id: "2", name: "Call", emoji: "📞", hue: "#BB8888" },
  { id: "3", name: "Podcast", emoji: "🎙️", hue: "#B8A060" },
  { id: "4", name: "Mémo", emoji: "📝", hue: "#6BAA88" },
  { id: "5", name: "Music", emoji: "🎵", hue: "#B080A0" },
  { id: "6", name: "Sample", emoji: "🎹", hue: "#9080B0" },
  { id: "7", name: "Travail", emoji: "💼", hue: "#7098BB" },
  { id: "8", name: "Idée", emoji: "💡", hue: "#C09060" },
  { id: "9", name: "Learning", emoji: "🎓", hue: "#60A898" },
  { id: "10", name: "Perso", emoji: "🏠", hue: "#888888" }
];
