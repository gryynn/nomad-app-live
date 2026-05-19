export default function VuMeter({ level = 0, bars = 10, height = 16 }) {
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height }}>
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars;
        const active = level >= threshold;
        const color = threshold > 0.85
          ? "var(--red)"
          : threshold > 0.65
            ? "var(--orange)"
            : "var(--green)";
        return (
          <div
            key={i}
            style={{
              width: 6,
              height: height * (0.4 + 0.6 * threshold),
              borderRadius: 2,
              background: active ? color : "var(--border)",
              transition: "background 0.1s",
            }}
          />
        );
      })}
    </div>
  );
}
