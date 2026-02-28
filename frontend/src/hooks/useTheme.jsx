import { createContext, useContext, useState, useEffect } from "react";
import { THEMES } from "../styles/themes.js";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    return localStorage.getItem("nomad-theme") || "oled";
  });

  const theme = THEMES[mode];

  useEffect(() => {
    localStorage.setItem("nomad-theme", mode);
    document.documentElement.style.backgroundColor = theme.bg;
    document.body.style.backgroundColor = theme.bg;
    document.body.style.color = theme.text;
  }, [mode, theme]);

  const toggle = () => setMode((m) => (m === "oled" ? "light" : "oled"));

  return (
    <ThemeContext.Provider value={{ mode, theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
