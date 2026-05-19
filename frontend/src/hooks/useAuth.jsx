import { useState, useEffect, useContext, createContext, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

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

  // Legacy OIDC path (PocketID). Kept for my GREEN-LAB prod.
  const signIn = useCallback(() => {
    window.location.href = "/api/auth/login";
  }, []);

  // Apply a Supabase session to the local app state.
  const applySupabaseSession = useCallback((session) => {
    if (!session?.access_token) return;
    localStorage.setItem(TOKEN_KEY, session.access_token);
    const u = session.user;
    setUser({ id: u?.id, email: u?.email || "" });
  }, []);

  const signInWithPassword = useCallback(async (email, password) => {
    if (!supabase) throw new Error("Supabase non configuré côté frontend (VITE_SUPABASE_*).");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    applySupabaseSession(data.session);
  }, [applySupabaseSession]);

  const signUpWithPassword = useCallback(async (email, password) => {
    if (!supabase) throw new Error("Supabase non configuré côté frontend (VITE_SUPABASE_*).");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // If email confirm is required by the Supabase project, no session yet.
    if (data.session) applySupabaseSession(data.session);
    return data;
  }, [applySupabaseSession]);

  const sendMagicLink = useCallback(async (email) => {
    if (!supabase) throw new Error("Supabase non configuré côté frontend (VITE_SUPABASE_*).");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(() => {
    if (supabase) supabase.auth.signOut().catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading,
      signIn, signInWithPassword, signUpWithPassword, sendMagicLink, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
