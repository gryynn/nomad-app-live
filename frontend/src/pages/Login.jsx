import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";

/**
 * OSS-friendly login: magic link by default, password sign-in / sign-up as
 * disclosures. Falls back to the PocketID OIDC button when the operator
 * wants SSO. The legacy `onLogin` prop is kept so existing callers that
 * triggered the OIDC redirect still work.
 */
export default function Login({ onLogin }) {
  const auth = useAuth();
  const [mode, setMode] = useState("magic"); // magic | password | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  async function submit(e) {
    e?.preventDefault?.();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "magic") {
        await auth.sendMagicLink(email.trim());
        setInfo(`Lien envoyé à ${email}. Vérifie ta boîte mail puis ouvre le lien.`);
      } else if (mode === "password") {
        await auth.signInWithPassword(email.trim(), password);
      } else if (mode === "signup") {
        const data = await auth.signUpWithPassword(email.trim(), password);
        if (!data.session) {
          setInfo("Compte créé. Confirme ton email puis reviens te connecter.");
        }
      }
    } catch (e2) {
      setError(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

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
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: "1.25rem",
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

        <label style={{ fontSize: 11, color: "var(--text-soft)" }}>Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@example.com"
          style={inputStyle}
        />

        {mode !== "magic" && (
          <>
            <label style={{ fontSize: 11, color: "var(--text-soft)" }}>Mot de passe</label>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </>
        )}

        <button
          type="submit"
          disabled={busy || !email}
          style={{
            ...primaryButton,
            opacity: busy || !email ? 0.55 : 1,
            cursor: busy || !email ? "not-allowed" : "pointer",
          }}
        >
          {busy
            ? "…"
            : mode === "magic"
              ? "Recevoir un lien par email"
              : mode === "password"
                ? "Se connecter"
                : "Créer le compte"}
        </button>

        {error && (
          <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center" }}>{error}</div>
        )}
        {info && (
          <div style={{ fontSize: 12, color: "var(--green)", textAlign: "center" }}>{info}</div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap", fontSize: 12 }}>
          {mode !== "magic" && (
            <button type="button" onClick={() => setMode("magic")} style={linkStyle}>
              Lien magique
            </button>
          )}
          {mode !== "password" && (
            <button type="button" onClick={() => setMode("password")} style={linkStyle}>
              Mot de passe
            </button>
          )}
          {mode !== "signup" && (
            <button type="button" onClick={() => setMode("signup")} style={linkStyle}>
              Créer un compte
            </button>
          )}
        </div>

        {onLogin && (
          <button
            type="button"
            onClick={onLogin}
            style={{ ...linkStyle, fontSize: 11, opacity: 0.45, marginTop: 6 }}
          >
            SSO (PocketID)
          </button>
        )}

        <p style={{ textAlign: "center", fontSize: "0.7rem", color: "var(--text-soft)" }}>
          v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "?"}
        </p>
      </form>
    </div>
  );
}

const inputStyle = {
  background: "var(--surface)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0.7rem 0.85rem",
  fontSize: 14,
  outline: "none",
};

const primaryButton = {
  width: "100%",
  padding: "0.8rem",
  borderRadius: 8,
  border: "none",
  background: "var(--accent)",
  color: "var(--bg)",
  fontSize: "0.95rem",
  fontWeight: 600,
};

const linkStyle = {
  background: "none",
  border: "none",
  color: "var(--text-soft)",
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
  fontSize: 12,
};
