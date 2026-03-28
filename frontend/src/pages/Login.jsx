import { useState } from "react";
import { useTheme } from "../hooks/useTheme.jsx";

export default function Login({ onLogin }) {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message || "Connexion impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.bg,
        padding: "1rem",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {/* Branding */}
        <h1
          style={{
            textAlign: "center",
            letterSpacing: "0.45em",
            fontSize: "1.5rem",
            fontWeight: 300,
            color: theme.accent,
            marginBottom: "1.5rem",
          }}
        >
          N O M A D
        </h1>

        {error && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: 6,
              background: `${theme.red}15`,
              color: theme.red,
              fontSize: "0.85rem",
              border: `1px solid ${theme.red}30`,
            }}
          >
            {error}
          </div>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          style={{
            padding: "0.75rem 1rem",
            borderRadius: 8,
            border: `1px solid ${theme.sepStrong}`,
            background: theme.surface,
            color: theme.text,
            fontSize: "1rem",
            outline: "none",
          }}
        />

        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={{
            padding: "0.75rem 1rem",
            borderRadius: 8,
            border: `1px solid ${theme.sepStrong}`,
            background: theme.surface,
            color: theme.text,
            fontSize: "1rem",
            outline: "none",
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.75rem",
            borderRadius: 8,
            border: "none",
            background: theme.accent,
            color: theme.bg,
            fontSize: "1rem",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
            marginTop: "0.5rem",
          }}
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        <p
          style={{
            textAlign: "center",
            fontSize: "0.75rem",
            color: theme.textSoft,
            marginTop: "1rem",
          }}
        >
          v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "?"}
        </p>
      </form>
    </div>
  );
}
