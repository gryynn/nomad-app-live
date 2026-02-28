import { useState, useEffect } from "react";
import { useTheme } from "../hooks/useTheme.jsx";
import { useDevices } from "../hooks/useDevices.js";
import VuMeter from "./VuMeter.jsx";

export default function DeviceSelector() {
  const { theme } = useTheme();
  const { devices, selectedId, select } = useDevices();
  const [isOpen, setIsOpen] = useState(false);
  const [vuLevel, setVuLevel] = useState(0);

  // Simulated VU meter animation (3s breath cycle)
  useEffect(() => {
    const interval = setInterval(() => {
      const time = Date.now() / 3000; // 3s cycle
      const breath = Math.sin(time) * 0.5 + 0.5; // 0-1 oscillation
      setVuLevel(breath * 0.7); // Max at 70%
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const selectedDevice = devices.find((d) => d.deviceId === selectedId);
  const deviceLabel = selectedDevice?.label || "No device selected";
  const isOnline = !!selectedDevice;

  const handleToggle = () => setIsOpen(!isOpen);

  const handleSelect = (deviceId) => {
    select(deviceId);
    setIsOpen(false);
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

        {/* Device label */}
        <div style={{ flex: 1, fontSize: 14, color: theme.text }}>
          {deviceLabel}
        </div>

        {/* Inline VuMeter */}
        {isOnline && <VuMeter level={vuLevel} bars={8} height={14} />}
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
          {devices.length === 0 ? (
            <div
              style={{
                padding: "16px",
                fontSize: 13,
                color: theme.textSecondary,
                textAlign: "center",
              }}
            >
              No devices found
            </div>
          ) : (
            devices.map((device) => {
              const isSelected = device.deviceId === selectedId;
              return (
                <div
                  key={device.deviceId}
                  onClick={() => handleSelect(device.deviceId)}
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
                      background: theme.success,
                      flexShrink: 0,
                    }}
                  />

                  {/* Device label */}
                  <div style={{ flex: 1, fontSize: 13, color: theme.text }}>
                    {device.label || "Unnamed device"}
                  </div>
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
