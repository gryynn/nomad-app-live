import { useTheme } from "../hooks/useTheme.jsx";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Waveform from "../components/Waveform.jsx";
import VuMeter from "../components/VuMeter.jsx";
import MarkItem from "../components/MarkItem.jsx";

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

  // LIVE mode state
  const [transcription, setTranscription] = useState("");
  const [vuLevel, setVuLevel] = useState(0);
  const [showTranscription, setShowTranscription] = useState(true);

  // Timer logic
  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused]);

  // LIVE mode: Progressive transcription simulation
  useEffect(() => {
    if (isRecMode || isPaused) return;

    const sampleText =
      "Bonjour, ceci est une démonstration de transcription en temps réel. " +
      "Le texte apparaît progressivement au fur et à mesure que les mots sont détectés. " +
      "Cette fonctionnalité permet de visualiser instantanément ce qui est capturé par le microphone. " +
      "N O M A D transforme votre appareil en un outil de transcription professionnel.";

    let charIndex = 0;

    const typeTimer = setInterval(() => {
      if (charIndex < sampleText.length) {
        setTranscription(sampleText.slice(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(typeTimer);
      }
    }, 80); // ~12.5 chars per second

    return () => clearInterval(typeTimer);
  }, [isRecMode, isPaused]);

  // LIVE mode: VU meter animation
  useEffect(() => {
    if (isRecMode || isPaused) return;

    const vuTimer = setInterval(() => {
      // Simulate varying audio levels
      setVuLevel(0.3 + Math.random() * 0.5); // 30% to 80%
    }, 100);

    return () => clearInterval(vuTimer);
  }, [isRecMode, isPaused]);

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

  const handleUpdateTag = (markId, tag) => {
    setMarks(
      marks.map((mark) => (mark.id === markId ? { ...mark, tag } : mark))
    );
  };

  // Timer color based on mode
  const timerColor = isRecMode ? theme.accent : theme.red;

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
          <div className="live-zone w-full max-w-md">
            {/* Mini VU Meter */}
            <div className="flex items-center justify-center mb-4">
              <VuMeter level={vuLevel} bars={12} height={24} />
            </div>

            {/* Transcription Text Zone */}
            <div
              className="transcription-zone relative"
              style={{
                minHeight: 200,
                maxHeight: 300,
                overflowY: "auto",
                padding: "16px",
                background: theme.surface,
                borderRadius: "8px",
                border: `1px solid ${theme.divider}`,
              }}
            >
              {showTranscription && (
                <>
                  <p
                    style={{
                      fontSize: "14px",
                      lineHeight: "1.6",
                      color: theme.text,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {transcription}
                    <span
                      className="cursor-blink"
                      style={{
                        display: "inline-block",
                        width: "1.5px",
                        height: "1em",
                        background: theme.accent,
                        marginLeft: "2px",
                        verticalAlign: "middle",
                        animation: "cursorBlink 1.3s infinite",
                      }}
                    />
                  </p>
                </>
              )}

              {/* Eye Toggle Button */}
              <button
                onClick={() => setShowTranscription(!showTranscription)}
                className="absolute top-2 right-2"
                style={{
                  width: 32,
                  height: 32,
                  background: theme.bg,
                  border: `1px solid ${theme.divider}`,
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  opacity: 0.7,
                  cursor: "pointer",
                }}
              >
                👁
              </button>
            </div>
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

      {/* Marks List */}
      {marks.length > 0 && (
        <div className="marks-list mt-6 px-2">
          <div
            className="marks-header mb-3"
            style={{
              fontSize: "10px",
              color: theme.textMuted,
              opacity: 0.5,
              fontWeight: 500,
              letterSpacing: "0.05em",
            }}
          >
            MARKS ({marks.length})
          </div>
          {marks.map((mark) => (
            <MarkItem
              key={mark.id}
              mark={mark}
              onUpdateTag={handleUpdateTag}
            />
          ))}
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes nBreath {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        @keyframes cursorBlink {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
