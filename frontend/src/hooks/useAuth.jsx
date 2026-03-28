import { useState, useEffect, useContext, createContext, useCallback } from "react";

const AuthContext = createContext(null);
const TOKEN_KEY = "nomad_token";

function parseToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return { id: payload.sub, email: payload.email || "" };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check URL for OIDC token (callback from PocketID)
    const params = new URLSearchParams(window.location.search);
    const oidcToken = params.get("oidc_token");
    const authError = params.get("auth_error");

    if (oidcToken) {
      localStorage.setItem(TOKEN_KEY, oidcToken);
      // Strip token from URL
      window.history.replaceState({}, "", window.location.pathname);
      const parsed = parseToken(oidcToken);
      setUser(parsed);
      setLoading(false);
      return;
    }

    if (authError) {
      console.error("[AUTH] OIDC error:", authError);
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Check localStorage for existing token
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      const parsed = parseToken(stored);
      if (parsed) {
        setUser(parsed);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    setLoading(false);
  }, []);

  const signIn = useCallback(() => {
    window.location.href = "/api/auth/login";
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
