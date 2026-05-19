export default function Login({ onLogin }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2rem",
        }}
      >
        <h1
          style={{
            textAlign: "center",
            letterSpacing: "0.45em",
            fontSize: "1.5rem",
            fontWeight: 300,
            color: "var(--accent)",
          }}
        >
          N O M A D
        </h1>

        <button
          onClick={onLogin}
          style={{
            width: "100%",
            padding: "0.85rem",
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "var(--bg)",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Se connecter
        </button>

        <p
          style={{
            textAlign: "center",
            fontSize: "0.75rem",
            color: "var(--text-soft)",
          }}
        >
          v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "?"}
        </p>
      </div>
    </div>
  );
}
