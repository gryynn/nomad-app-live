import { useEffect, useState } from "react";
import * as api from "../lib/api.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

const MODEL_OPTIONS = [
  { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6 (équilibré)" },
  { value: "anthropic/claude-opus-4-7", label: "Claude Opus 4.7 (top qualité)" },
  { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 (rapide, économe)" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/gpt-5-mini", label: "GPT-5 mini" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "moonshotai/kimi-k2-thinking", label: "Kimi K2 Thinking (FR fort)" },
  { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
];

const STARTER_PROMPTS = [
  {
    name: "Synthèse réunion",
    prompt_text:
      "Tu es un assistant de prise de notes. À partir de la transcription de réunion ci-dessous, produis une synthèse claire en français :\n\n## Synthèse\n(résumé en 5-7 phrases)\n\n## Décisions prises\n(liste à puces)\n\n## Tâches à faire\n(liste à puces avec — quand connu — qui s'en charge et la deadline)\n\n## Points à clarifier\n(liste à puces)",
  },
  {
    name: "Idées et insights",
    prompt_text:
      "À partir de cette transcription, extrais les idées et insights notables :\n\n## Idées clés\n(liste à puces, une idée par ligne)\n\n## Insights / connexions surprenantes\n(liste à puces)\n\n## Pistes à explorer\n(liste à puces, formulées comme actions)",
  },
  {
    name: "Email récapitulatif",
    prompt_text:
      "Rédige un email récapitulatif clair et professionnel basé sur cette transcription. Format :\n\nObjet : [proposer un objet d'email pertinent]\n\nBonjour,\n\n[corps de l'email — 3-5 paragraphes courts]\n\nProchaines étapes :\n- [liste]\n\nCordialement",
  },
];

export default function PromptTemplatesModal({ tags, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      setTemplates(await api.listPromptTemplates());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  async function save(payload) {
    try {
      if (payload.id) {
        await api.updatePromptTemplate(payload.id, payload);
      } else {
        await api.createPromptTemplate(payload);
      }
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(id) {
    if (!confirm("Supprimer ce prompt ?")) return;
    try {
      await api.deletePromptTemplate(id);
      await reload();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleEnabled(t) {
    try {
      await api.updatePromptTemplate(t.id, { enabled: !t.enabled });
      await reload();
    } catch (e) { setError(e.message); }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 1001,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "1.25rem",
          color: "var(--text)",
          maxHeight: "90dvh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "0.95rem", letterSpacing: "0.2em", fontWeight: 600 }}>
            PROMPTS AUTOMATIQUES
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-soft)", cursor: "pointer", fontSize: "1rem" }} aria-label="Fermer">✕</button>
        </div>

        {error && (
          <div style={{ padding: 8, background: "rgba(220,80,80,0.15)", border: "1px solid rgba(220,80,80,0.4)", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        {!editing && (
          <>
            <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 12 }}>
              Crée des prompts réutilisables. Chaque prompt peut s'auto-déclencher quand une session reçoit un tag précis (par ex. <code>#réunion</code> → "Synthèse réunion"). Sinon tu peux les lancer manuellement depuis n'importe quelle session.
            </p>

            {loading ? (
              <div style={{ opacity: 0.6, padding: 16 }}>Chargement…</div>
            ) : templates.length === 0 ? (
              <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 8, textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--text-soft)" }}>Aucun prompt pour l'instant.</p>
                <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
                  {STARTER_PROMPTS.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setEditing({ name: s.name, prompt_text: s.prompt_text, model: DEFAULT_MODEL, auto_trigger_tag_ids: [], enabled: true })}
                      style={chipBtn}
                    >
                      + {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {templates.map((t) => (
                  <li key={t.id} style={rowStyle(t.enabled)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong style={{ fontSize: 14 }}>{t.name}</strong>
                        <span style={{ fontSize: 11, color: "var(--text-soft)", opacity: 0.7 }}>{shortModel(t.model)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(t.auto_trigger_tag_ids || []).length === 0 ? (
                          <em>Manuel uniquement</em>
                        ) : (
                          (t.auto_trigger_tag_ids || []).map((tagId) => {
                            const tag = tags.find((x) => x.id === tagId);
                            return (
                              <span key={tagId} style={tagPill}>
                                {tag ? `${tag.emoji || ""} #${tag.name}` : "?"}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => toggleEnabled(t)} style={iconBtnSmall} title={t.enabled ? "Désactiver" : "Activer"}>
                        {t.enabled ? "●" : "○"}
                      </button>
                      <button onClick={() => setEditing(t)} style={iconBtnSmall} title="Éditer">✎</button>
                      <button onClick={() => remove(t.id)} style={iconBtnSmall} title="Supprimer">🗑</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setEditing({ name: "", prompt_text: "", model: DEFAULT_MODEL, auto_trigger_tag_ids: [], enabled: true })}
              style={{ marginTop: 12, ...primaryBtn }}
            >
              + Nouveau prompt
            </button>
          </>
        )}

        {editing && (
          <TemplateEditor
            template={editing}
            tags={tags}
            onCancel={() => setEditing(null)}
            onSave={save}
          />
        )}
      </div>
    </div>
  );
}

function TemplateEditor({ template, tags, onCancel, onSave }) {
  const [name, setName] = useState(template.name || "");
  const [promptText, setPromptText] = useState(template.prompt_text || "");
  const [model, setModel] = useState(template.model || DEFAULT_MODEL);
  const [tagIds, setTagIds] = useState(template.auto_trigger_tag_ids || []);
  const [enabled, setEnabled] = useState(template.enabled !== false);
  const [busy, setBusy] = useState(false);

  function toggleTag(id) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !promptText.trim()) return;
    setBusy(true);
    try {
      await onSave({
        ...(template.id ? { id: template.id } : {}),
        name: name.trim(),
        prompt_text: promptText,
        model,
        auto_trigger_tag_ids: tagIds,
        enabled,
      });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={labelStyle}>
        Nom
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={input} placeholder="Synthèse réunion" />
      </label>

      <label style={labelStyle}>
        Modèle
        <select value={model} onChange={(e) => setModel(e.target.value)} style={input}>
          {MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
          Tu peux aussi taper un slug OpenRouter custom : <code>provider/model</code>.
        </span>
      </label>

      <label style={labelStyle}>
        Prompt
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          required
          rows={10}
          style={{ ...input, fontFamily: "inherit", lineHeight: 1.4, resize: "vertical" }}
          placeholder="Tu es un assistant... À partir de la transcription, fais X..."
        />
        <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
          La transcription, les notes et les marques de la session seront automatiquement ajoutées sous ton prompt.
        </span>
      </label>

      <label style={labelStyle}>
        Auto-déclencher sur ces tags
        {tags.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-soft)" }}>Aucun tag dans ton compte. Crée des tags d'abord depuis une session.</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {tags.map((t) => {
              const selected = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  style={{
                    ...chipBtn,
                    borderColor: selected ? (t.hue || "var(--accent)") : "var(--border)",
                    background: selected ? `${t.hue || "var(--accent)"}22` : "transparent",
                    color: selected ? "var(--text)" : "var(--text-soft)",
                  }}
                >
                  {t.emoji || ""} #{t.name}
                </button>
              );
            })}
          </div>
        )}
        <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
          Sélectionne 0 tag pour un prompt purement manuel. Sinon, le prompt se lancera tout seul à la fin de la transcription dès qu'une session porte un de ces tags.
        </span>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Activé (auto-trigger + dispo dans la liste manuelle)
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={{ ...primaryBtn, background: "transparent", color: "var(--text-soft)", border: "1px solid var(--border)" }}>Annuler</button>
        <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.55 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
          {busy ? "…" : (template.id ? "Enregistrer" : "Créer")}
        </button>
      </div>
    </form>
  );
}

function shortModel(slug) {
  if (!slug) return "";
  const known = MODEL_OPTIONS.find((m) => m.value === slug);
  if (known) return known.label.split(" (")[0];
  return slug.split("/").pop();
}

const input = {
  width: "100%",
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.5rem 0.7rem",
  fontSize: "0.85rem",
  outline: "none",
};

const primaryBtn = {
  flex: 1,
  padding: "0.6rem",
  borderRadius: 6,
  border: "none",
  background: "var(--accent)",
  color: "var(--bg)",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

const chipBtn = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-soft)",
  cursor: "pointer",
};

const tagPill = {
  fontSize: 11,
  padding: "2px 6px",
  borderRadius: 4,
  background: "var(--bg)",
  border: "1px solid var(--border)",
};

const iconBtnSmall = {
  background: "none",
  border: "none",
  color: "var(--text-soft)",
  cursor: "pointer",
  fontSize: "0.9rem",
  padding: "2px 6px",
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "var(--text-soft)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

function rowStyle(enabled) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    opacity: enabled ? 1 : 0.55,
  };
}
