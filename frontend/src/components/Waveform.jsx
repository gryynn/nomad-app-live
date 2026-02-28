import { useTheme } from "../hooks/useTheme.jsx";
import { useEffect, useState } from "react";

export default function Waveform({ active = false, height = 72 }) {
  const { theme } = useTheme();
  const [barHeights, setBarHeights] = useState(
    Array.from({ length: 24 }).map(() => 0.2)
  );

  useEffect(() => {
    if (!active) {
      // Reset to minimal heights when inactive
      setBarHeights(Array.from({ length: 24 }).map(() => 0.2));
      return;
    }

    // Animate bars when active
    const interval = setInterval(() => {
      setBarHeights(
        Array.from({ length: 24 }).map(() => 0.2 + Math.random() * 0.8)
      );
    }, 120); // Update every 120ms for smooth animation

    return () => clearInterval(interval);
  }, [active]);

  return (
    <div
      style={{
        display: "flex",
        gap: 2.5,
        alignItems: "flex-end",
        height,
        justifyContent: "center",
      }}
    >
      {barHeights.map((heightRatio, i) => (
        <div
          key={i}
          style={{
            width: 2,
            height: height * heightRatio,
            borderRadius: 1,
            background: theme.waveform,
            opacity: 0.35,
            transition: "height 0.1s ease-out",
          }}
        />
      ))}
    </div>
  );
}
