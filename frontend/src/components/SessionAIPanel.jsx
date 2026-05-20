import { useEffect, useState, useRef } from "react";
import * as api from "../lib/api.js";

const POLL_INTERVAL_MS = 4000;
const STATUS_LABEL = {
  pending: "En file…",
  running: "Analyse en cours…",
  done: "Terminé",
  error: "Erreur",
  cancelled: "Annulé",
};

export default function SessionAIPanel({ sessionId, hasTranscript }) {
  const [outputs, setOutputs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [busyTemplateId, setBusyTemplateId] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  async function reload() {
    try {
      const [outs, tpls] = await Promise.all([
        api.listSessionAIOutputs(sessionId),
        api.listPromptTemplates().catch(() => []),
      ]);
      setOutputs(outs);
      setTemplates(tpls);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [sessionId]);

  useEffect(() => {
    const hasInflight = outputs.some((o) => o.status === "pending" || o.status === "running");
    if (!hasInflight) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(() => { reload(); }, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    // eslint-disable-next-line
  }, [outputs]);

  async function run(templateId) {
    setBusyTemplateId(templateId);
    setPicking(false);
    try {
      const out = await api.processSessionAI(sessionId, templateId);
      setOutputs((prev) => [out, ...prev]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyTemplateId(null);
    }
  }

  async function removeOutput(id) {
    if (!confirm("Supprimer cette analyse ?")) return;
    try {
      await api.deleteAIOutput(id);
      setOutputs((prev) => prev.filter((o) => o.id !== id));
    } catch (e) { setError(e.message); }
  }

  async function rerun(id) {
    try {
      const out = await api.rerunAIOutput(id);
      setOutputs((prev) => [out, ...prev]);
    } catch (e) { setError(e.message); }
  }

  const enabledTemplates = templates.filter((t) => t.enabled !== false);

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <label style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-soft)" }}>
          Analyses IA
        </label>
        {hasTranscript && enabledTemplates.length > 0 && (
          <button
            onClick={() => setPicking((v) => !v)}
            style={smallBtn}
          >
            {picking ? "Annuler" : "+ Lancer une analyse"}
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: 8, background: "rgba(220,80,80,0.15)", border: "1px solid rgba(220,80,80,0.4)", borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
          {error}
        </div>
      )}

      {!hasTranscript && (
        <div style={{ fontSize: 12, color: "var(--text-soft)", fontStyle: "italic" }}>
          Transcris d'abord la session pour utiliser les prompts IA.
        </div>
      )}

      {hasTranscript && enabledTemplates.length === 0 && outputs.length === 0 && !loading && (
        <div style={{ fontSize: 12, color: "var(--text-soft)" }}>
          Aucun prompt configuré. Va dans <strong>Réglages → Assistant IA</strong> pour en créer un.
        </div>
      )}

      {picking && enabledTemplates.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 8, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 10 }}>
          {enabledTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => run(t.id)}
              disabled={busyTemplateId === t.id}
              style={{ ...smallBtn, opacity: busyTemplateId === t.id ? 0.5 : 1 }}
            >
              {busyTemplateId === t.id ? "…" : t.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, opacity: 0.6 }}>Chargement…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {outputs.map((o) => (
            <AIOutputCard key={o.id} output={o} onDelete={removeOutput} onRerun={rerun} />
          ))}
        </div>
      )}
    </div>
  );
}

function AIOutputCard({ output, onDelete, onRerun }) {
  const initial = output.output_text_edited ?? output.output_text ?? "";
  const [text, setText] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const debRef = useRef(null);

  useEffect(() => {
    setText(output.output_text_edited ?? output.output_text ?? "");
    setDirty(false);
  }, [output.id, output.output_text, output.output_text_edited]);

  function onChange(e) {
    const v = e.target.value;
    setText(v);
    setDirty(true);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => save(v), 1200);
  }

  async function save(v) {
    setSaving(true);
    try {
      await api.updateAIOutput(output.id, v);
      setDirty(false);
    } catch (e) {
      console.error("save ai output", e);
    } finally { setSaving(false); }
  }

  function saveNow() {
    if (debRef.current) clearTimeout(debRef.current);
    save(text);
  }

  const isInflight = output.status === "pending" || output.status === "running";
  const isError = output.status === "error";
  const isDone = output.status === "done";

  const created = new Date(output.created_at);
  const dateStr = created.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const timeStr = created.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>{output.template_name_snapshot || "Analyse"}</strong>
        <span style={{ fontSize: 10, color: "var(--text-soft)", opacity: 0.7 }}>{output.model?.split("/").pop()}</span>
        {output.trigger_source === "auto_tag" && (
          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "var(--accent)22", color: "var(--accent)" }}>auto</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-soft)" }}>
          {dateStr} · {timeStr}
        </span>
      </div>

      {isInflight && (
        <div style={{ fontSize: 12, color: "var(--text-soft)", fontStyle: "italic", padding: "8px 0" }}>
          {STATUS_LABEL[output.status]} <span className="dot-pulse">…</span>
        </div>
      )}

      {isError && (
        <div style={{ fontSize: 12, color: "rgb(220, 80, 80)", padding: "4px 0" }}>
          ❌ {output.error_message || "Erreur"}
        </div>
      )}

      {isDone && (
        <>
          <textarea
            value={text}
            onChange={onChange}
            rows={expanded ? 18 : 6}
            style={{ ...textareaStyle, minHeight: expanded ? 320 : 110 }}
            placeholder="(vide)"
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-soft)" }}>
              {saving ? "Sauvegarde…" : dirty ? "Modifié" : "Synchronisé"}
              {output.tokens_input && (
                <> · {output.tokens_input}+{output.tokens_output} tok</>
              )}
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {dirty && (
                <button
                  onClick={saveNow}
                  disabled={saving}
                  style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--accent)",
                    background: "var(--accent)22",
                    color: "var(--accent)",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "…" : "Sauvegarder"}
                </button>
              )}
              <button onClick={() => setExpanded((v) => !v)} style={iconBtnSmall} title="Agrandir/réduire">{expanded ? "▲" : "▼"}</button>
              <button
                onClick={() => { navigator.clipboard.writeText(text); }}
                style={iconBtnSmall}
                title="Copier"
              >📋</button>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
        {!isInflight && (
          <button onClick={() => onRerun(output.id)} style={iconBtnSmall} title="Relancer">↻</button>
        )}
        <button onClick={() => onDelete(output.id)} style={iconBtnSmall} title="Supprimer">🗑</button>
      </div>
    </div>
  );
}

const cardStyle = {
  padding: 10,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
};

const textareaStyle = {
  width: "100%",
  background: "var(--surface)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  lineHeight: 1.5,
  resize: "vertical",
  outline: "none",
};

const smallBtn = {
  fontSize: 12,
  padding: "3px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-soft)",
  cursor: "pointer",
};

const iconBtnSmall = {
  background: "none",
  border: "none",
  color: "var(--text-soft)",
  cursor: "pointer",
  fontSize: "0.85rem",
  padding: "2px 5px",
};
