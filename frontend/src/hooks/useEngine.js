import { useState, useEffect, useCallback } from "react";

const DEFAULT_ENGINES = [
  { id: "groq-turbo", name: "Groq Turbo", icon: "⚡", status: "unknown", price: "$0.04/h" },
  { id: "groq-large", name: "Groq large-v3", icon: "⚡", status: "unknown", price: "$0.11/h" },
  { id: "deepgram-nova3", name: "Deepgram Nova-3", icon: "🌊", status: "unknown", price: "$0.46/h" },
  { id: "wynona-whisperx", name: "WYNONA WhisperX", icon: "🖥️", status: "unknown", price: "Gratuit" },
];

export function useEngine() {
  const [engines, setEngines] = useState(DEFAULT_ENGINES);
  const [activeId, setActiveId] = useState(() => {
    return localStorage.getItem("nomad-engine") || "auto";
  });

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/engines/status");
      if (res.ok) {
        const data = await res.json();
        setEngines((prev) =>
          prev.map((e) => {
            const remote = data.engines?.find((r) => r.id === e.id);
            return remote ? { ...e, status: remote.status } : e;
          })
        );
      }
    } catch {
      // Offline or backend not running — keep defaults
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 30_000); // Poll every 30s
    return () => clearInterval(interval);
  }, [poll]);

  const select = useCallback((id) => {
    setActiveId(id);
    localStorage.setItem("nomad-engine", id);
  }, []);

  const wakeWynona = useCallback(async () => {
    try {
      await fetch("/api/engines/wynona/wake", { method: "POST" });
    } catch {
      // Offline
    }
  }, []);

  return { engines, activeId, select, wakeWynona, refresh: poll };
}
