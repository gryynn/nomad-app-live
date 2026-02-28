import { useState } from "react";
import { useTheme } from "../hooks/useTheme.jsx";
import { useEngine } from "../hooks/useEngine.js";

export default function EnginePanel() {
  const { theme } = useTheme();
  const { engines, activeId, select, wakeWynona } = useEngine();
  const [isOpen, setIsOpen] = useState(false);

  const selectedEngine = engines.find((e) => e.id === activeId) || engines[0];
  const engineLabel = selectedEngine?.name || "No engine selected";
  const isOnline = selectedEngine?.status === "online" || selectedEngine?.status === "unknown";
  const showWakeButton = selectedEngine?.status === "offline" && activeId === "wynona-whisperx";

  const handleToggle = () => setIsOpen(!isOpen);

  const handleSelect = (engineId) => {
    select(engineId);
    setIsOpen(false);
  };

  const handleWake = async (e) => {
    e.stopPropagation();
    await wakeWynona();
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Main selector button */}
      <div
        onClick={handleToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          background: theme.surface,
          borderRadius: 12,
          border: `1px solid ${theme.divider}`,
          transition: "all 0.2s",
          padding: "12px 16px",
        }}
      >
        {/* Status dot */}
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: isOnline ? theme.success : theme.textMuted,
            flexShrink: 0,
          }}
        />

        {/* Engine label */}
        <div style={{ flex: 1, fontSize: 14, color: theme.text }}>
          {engineLabel}
        </div>

        {/* Cost display */}
        {selectedEngine?.price && (
          <div
            style={{
              fontSize: 12,
              fontFamily: "JetBrains Mono, monospace",
              color: theme.textSecondary,
              paddingRight: 4,
            }}
          >
            {selectedEngine.price}
          </div>
        )}

        {/* Wake button (WYNONA offline only) */}
        {showWakeButton && (
          <button
            onClick={handleWake}
            style={{
              fontSize: 12,
              fontFamily: "Outfit, sans-serif",
              fontWeight: 400,
              color: theme.accent,
              background: theme.accentDim,
              border: `1px solid ${theme.accentBorder}`,
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.accentBorder;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = theme.accentDim;
            }}
          >
            Wake
          </button>
        )}
      </div>

      {/* Dropdown list */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: theme.surface,
            borderRadius: 12,
            border: `1px solid ${theme.divider}`,
            overflow: "hidden",
            zIndex: 100,
            animation: "fadeIn 0.2s",
          }}
        >
          {engines.length === 0 ? (
            <div
              style={{
                padding: "16px",
                fontSize: 13,
                color: theme.textSecondary,
                textAlign: "center",
              }}
            >
              No engines available
            </div>
          ) : (
            engines.map((engine) => {
              const isSelected = engine.id === activeId;
              const engineOnline = engine.status === "online" || engine.status === "unknown";
              return (
                <div
                  key={engine.id}
                  onClick={() => handleSelect(engine.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    cursor: "pointer",
                    background: isSelected ? theme.accentDim : "transparent",
                    borderBottom: `1px solid ${theme.divider}`,
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = theme.surfaceHover;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  {/* Status dot */}
                  <div
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: engineOnline ? theme.success : theme.textMuted,
                      flexShrink: 0,
                    }}
                  />

                  {/* Engine icon */}
                  <div
                    style={{
                      fontSize: 14,
                      opacity: 0.65,
                      lineHeight: 1,
                    }}
                  >
                    {engine.icon}
                  </div>

                  {/* Engine label */}
                  <div style={{ flex: 1, fontSize: 13, color: theme.text }}>
                    {engine.name || "Unnamed engine"}
                  </div>

                  {/* Price */}
                  {engine.price && (
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "JetBrains Mono, monospace",
                        color: theme.textSecondary,
                      }}
                    >
                      {engine.price}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Fade-in animation */}
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(-4px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
}
