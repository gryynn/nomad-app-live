import { useTheme } from "../hooks/useTheme.jsx";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Waveform from "../components/Waveform.jsx";

export default function Recording() {
  const { theme } = useTheme();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get("mode") || "rec";
  const isRecMode = mode === "rec";

  // Timer state
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Marks state (for future subtasks)
  const [marks, setMarks] = useState([]);

  // Timer logic
  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused]);

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  // Control handlers
  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleStop = () => {
    navigate("/post-capture", {
      state: {
        duration: elapsed,
        marks,
        mode,
      },
    });
  };

  const handleMark = () => {
    // Prevent duplicate marks within 1 second
    const lastMark = marks[marks.length - 1];
    if (lastMark && elapsed - lastMark.time < 1) return;

    setMarks([...marks, { id: Date.now(), time: elapsed, tag: null }]);
  };

  // Timer color based on mode
  const timerColor = isRecMode ? "#D8CAA0" : theme.danger;

  return (
    <div
      style={{ background: theme.bg, color: theme.text, minHeight: "100vh" }}
      className="flex flex-col px-4 py-6 max-w-lg mx-auto"
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between mb-6">
        {/* Back Button */}
        <button
          onClick={() => navigate("/")}
          className="text-2xl"
          style={{ opacity: 0.5 }}
        >
          ←
        </button>

        {/* Timer */}
        <div
          className="timer"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "30px",
            fontWeight: 400,
            color: timerColor,
            opacity: 0.7,
          }}
        >
          {formatTime(elapsed)}
        </div>

        {/* Mode Badge */}
        <div
          className="mode-badge"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "8.5px",
            fontWeight: 500,
            letterSpacing: "0.05em",
            color: theme.textMuted,
            animation: "nBreath 3.5s ease-in-out infinite",
          }}
        >
          {isRecMode ? "REC" : "LIVE"}
        </div>
      </header>

      {/* Info Line */}
      <div
        className="info-line mb-8 text-center"
        style={{
          fontSize: "11px",
          color: theme.textMuted,
          opacity: 0.5,
          fontWeight: 200,
        }}
      >
        Device · Engine · Language
      </div>

      {/* Main Zone */}
      <div className="main-zone flex-1 flex flex-col items-center justify-center mb-8">
        {isRecMode ? (
          <div className="rec-zone flex flex-col items-center">
            {/* Waveform */}
            <Waveform active={!isPaused} height={72} />

            {/* dBFS Indicator */}
            <div
              className="dbfs-indicator mt-4"
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "10px",
                color: theme.textMuted,
                opacity: 0.4,
              }}
            >
              -18 dBFS
            </div>
          </div>
        ) : (
          <div className="live-zone">
            {/* LIVE mode content - placeholder for future subtask */}
            <p style={{ color: theme.textMuted }}>LIVE mode — coming soon</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="controls flex items-center justify-center gap-6 mb-6">
        {/* Pause Button */}
        <button
          onClick={handlePause}
          className="control-btn rounded-full flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            background: theme.surface,
            border: `1px solid ${theme.divider}`,
            color: theme.text,
            fontSize: "20px",
          }}
        >
          {isPaused ? "▶️" : "⏸"}
        </button>

        {/* Stop Button */}
        <button
          onClick={handleStop}
          className="control-btn rounded-full flex items-center justify-center"
          style={{
            width: 60,
            height: 60,
            background: theme.surface,
            border: `2px solid ${isRecMode ? theme.recordRing : theme.danger}`,
            color: theme.text,
            fontSize: "24px",
          }}
        >
          ⏹
        </button>

        {/* Mark Button */}
        <button
          onClick={handleMark}
          className="control-btn rounded-full flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            background: theme.surface,
            border: `1px solid ${theme.divider}`,
            color: theme.text,
            fontSize: "20px",
          }}
        >
          📌
        </button>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes nBreath {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
