import { Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./hooks/useTheme.jsx";
import Home from "./pages/Home.jsx";
import Recording from "./pages/Recording.jsx";
import PostCapture from "./pages/PostCapture.jsx";
import Sessions from "./pages/Sessions.jsx";
import SessionDetail from "./pages/SessionDetail.jsx";
import Settings from "./pages/Settings.jsx";

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/record" element={<Recording />} />
        <Route path="/post-capture" element={<PostCapture />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </ThemeProvider>
  );
}
