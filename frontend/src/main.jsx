import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles/mvp.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register Service Worker with version-aware update detection
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      console.log("[SW] Registered, scope:", reg.scope);
      // Check for updates every 5 minutes
      setInterval(() => reg.update(), 5 * 60 * 1000);
    })
    .catch((err) => console.warn("[SW] Registration failed:", err));

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SW_UPDATED") {
      console.log(`[SW] New version active: ${event.data.version}`);
    }
  });
}
