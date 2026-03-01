import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./lib/api.js";

// ─── Helpers ──────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTimer(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function inputModeEmoji(mode) {
  const map = { rec: "🎙️", live: "📡", import: "📁", paste: "📋" };
  return map[mode] || "📄";
}


// ═══════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════
export default function App() {
  // ─── State ────────────────────────────────────────
  const [mode, setMode] = useState(null); // null, "paste", "import"
  const [sessions, setSessions] = useState([]);
  const [tags, setTags] = useState([]);
  const [engines, setEngines] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedSession, setExpandedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Paste state
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasteSaving, setPasteSaving] = useState(false);

  // Import state
  const [importFile, setImportFile] = useState(null);
  const [importUploading, setImportUploading] = useState(false);

  // Recording state (shared by REC and LIVE)
  const [recMode, setRecMode] = useState(null); // "rec" or "live"
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [recMarks, setRecMarks] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Engine selection
  const [selectedEngine, setSelectedEngine] = useState("groq-turbo");

  // Note input
  const [noteText, setNoteText] = useState("");

  // ─── Load data ────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const data = await api.getSessions({ limit: 50 });
      setSessions(data);
    } catch (e) {
      console.error("Failed to load sessions:", e);
      setError(`Sessions: ${e.message}`);
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const data = await api.getTags();
      setTags(data);
    } catch (e) {
      console.error("Failed to load tags:", e);
    }
  }, []);

  const loadEngines = useCallback(async () => {
    try {
      const data = await api.getEngineStatus();
      setEngines(data.engines || []);
    } catch (e) {
      console.error("Failed to load engines:", e);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadSessions(), loadTags(), loadEngines()]).finally(() => setLoading(false));
  }, [loadSessions, loadTags, loadEngines]);

  // Auto-clear messages
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 4000); return () => clearTimeout(t); }
  }, [success]);
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 8000); return () => clearTimeout(t); }
  }, [error]);

  // ─── Flow A: Paste ──────────────────────────────
  async function handlePasteSave() {
    if (!pasteText.trim()) { setError("Le texte est vide"); return; }
    setPasteSaving(true);
    setError(null);
    try {
      const session = await api.createSession({
        input_mode: "paste",
        title: pasteTitle.trim() || `Paste ${new Date().toLocaleString("fr-FR")}`,
        transcript: pasteText.trim(),
      });
      console.log("Paste session created:", session);
      setSuccess(`Session "${session.title}" créée (${session.transcript_words} mots)`);
      setPasteTitle("");
      setPasteText("");
      setMode(null);
      await loadSessions();
    } catch (e) {
      setError(`Erreur paste: ${e.message}`);
    } finally {
      setPasteSaving(false);
    }
  }

  // ─── Flow B: Import ─────────────────────────────
  async function handleImportUpload() {
    if (!importFile) { setError("Aucun fichier sélectionné"); return; }
    setImportUploading(true);
    setError(null);
    try {
      const result = await api.uploadAudio(importFile);
      console.log("Upload result:", result);
      setSuccess(`Fichier "${importFile.name}" uploadé`);
      setImportFile(null);
      setMode(null);
      await loadSessions();
    } catch (e) {
      setError(`Erreur upload: ${e.message}`);
    } finally {
      setImportUploading(false);
    }
  }

  // ─── Flow C: REC (record only, no auto-transcribe) ──
  // ─── Flow D: LIVE (record + auto-transcribe on stop) ─
  async function startRecording(captureMode) {
    // captureMode: "rec" or "live"
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const durationSec = Math.round((Date.now() - startTimeRef.current) / 1000);
        console.log(`Recording stopped: ${blob.size} bytes, ${durationSec}s, mode=${captureMode}`);

        try {
          const file = new File([blob], `${captureMode}_${Date.now()}.webm`, { type: "audio/webm" });
          const result = await api.uploadAudio(file);
          console.log("Upload result:", result);

          if (captureMode === "live") {
            // LIVE: auto-transcribe
            setSuccess("Enregistrement uploadé. Transcription en cours...");
            try {
              await api.transcribe(result.session_id, selectedEngine);
              // Poll for result
              setTimeout(async () => {
                await loadSessions();
              }, 5000);
            } catch (te) {
              console.error("Auto-transcribe failed:", te);
              setError(`Transcription échouée: ${te.message}`);
              await loadSessions();
            }
          } else {
            // REC: just upload, no transcription
            setSuccess("Enregistrement uploadé (sans transcription)");
            await loadSessions();
          }
        } catch (e) {
          setError(`Erreur upload: ${e.message}`);
        }

        setRecMode(null);
        setMode(null);
      };

      recorder.start(1000);
      setRecMode(captureMode);
      setIsRecording(true);
      setIsPaused(false);
      setRecTime(0);
      setRecMarks([]);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setRecTime(Date.now() - startTimeRef.current);
      }, 100);
    } catch (e) {
      setError(`Micro non accessible: ${e.message}`);
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      clearInterval(timerRef.current);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  }

  function addRecMark() {
    setRecMarks((prev) => [...prev, { time: recTime, label: "" }]);
  }

  // ─── Session expand ─────────────────────────────
  async function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedSession(null);
      return;
    }
    setExpandedId(id);
    setExpandedSession(null);
    try {
      const detail = await api.getSession(id);
      setExpandedSession(detail);
    } catch (e) {
      setError(`Erreur chargement session: ${e.message}`);
    }
  }

  // ─── Transcribe ─────────────────────────────────
  async function handleTranscribe(sessionId) {
    setError(null);
    try {
      const result = await api.transcribe(sessionId, selectedEngine);
      setSuccess(`Transcription lancée (job: ${result.job_id})`);
      // Poll for completion
      const poll = async (attempts = 0) => {
        if (attempts > 12) return; // max 60s
        await loadSessions();
        const detail = await api.getSession(sessionId);
        if (detail.transcript) {
          setExpandedSession(detail);
          setSuccess(`Transcription terminée (${detail.transcript_words} mots)`);
        } else {
          setTimeout(() => poll(attempts + 1), 5000);
        }
      };
      setTimeout(() => poll(), 3000);
    } catch (e) {
      setError(`Erreur transcription: ${e.message}`);
    }
  }

  // ─── Delete ─────────────────────────────────────
  async function handleDelete(sessionId) {
    if (!confirm("Supprimer cette session ?")) return;
    try {
      await api.deleteSession(sessionId);
      setSuccess("Session supprimée");
      setExpandedId(null);
      setExpandedSession(null);
      await loadSessions();
    } catch (e) {
      setError(`Erreur suppression: ${e.message}`);
    }
  }

  // ─── Tags toggle on session ─────────────────────
  async function toggleSessionTag(sessionId, tagId, currentTagIds) {
    const has = currentTagIds.includes(tagId);
    const newIds = has ? currentTagIds.filter((t) => t !== tagId) : [...currentTagIds, tagId];
    try {
      const updated = await api.setSessionTags(sessionId, newIds);
      setExpandedSession(updated);
      await loadTags(); // refresh session_count
    } catch (e) {
      setError(`Erreur tags: ${e.message}`);
    }
  }

  // ─── Add note ───────────────────────────────────
  async function handleAddNote(sessionId) {
    if (!noteText.trim()) return;
    try {
      await api.addNote(sessionId, noteText.trim());
      setNoteText("");
      const detail = await api.getSession(sessionId);
      setExpandedSession(detail);
    } catch (e) {
      setError(`Erreur note: ${e.message}`);
    }
  }

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════
  return (
    <div className="app">
      {/* ─── HEADER ──────────────────────────────── */}
      <div className="header">
        <h1>N O M A D</h1>
        <div className={`status-dot ${loading ? "offline" : ""}`} title={loading ? "Chargement..." : "Connecté"} />
      </div>

      {/* Messages */}
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      {/* ─── CAPTURE SECTION ─────────────────────── */}
      <div className="section">
        <div className="section-title">Capture</div>

        {/* Engine selector — always visible */}
        {!isRecording && (
          <div style={{ marginBottom: 12 }}>
            <label>Moteur</label>
            <div className="engine-row">
              {engines.map((eng) => (
                <button
                  key={eng.id}
                  className={`engine-chip ${selectedEngine === eng.id ? "selected" : ""} ${eng.status === "offline" ? "offline" : ""}`}
                  onClick={() => eng.status === "online" && setSelectedEngine(eng.id)}
                  title={`${eng.name} — ${eng.status} — $${eng.cost_per_hour}/h`}
                >
                  {eng.id === "groq-turbo" ? "Groq" : eng.id === "groq-large" ? "Groq+" : eng.id === "deepgram" ? "DG" : "WYNONA"}
                  {eng.status === "offline" ? " ⛔" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mode buttons — one click to capture */}
        {!isRecording && mode === null && (
          <div className="mode-bar">
            <button className="mode-btn rec" onClick={() => startRecording("rec")}>
              🎙️ REC
            </button>
            <button className="mode-btn" onClick={() => startRecording("live")}>
              📡 LIVE
            </button>
            <button className="mode-btn" onClick={() => setMode("import")}>
              📁 Import
            </button>
            <button className="mode-btn" onClick={() => setMode("paste")}>
              📋 Paste
            </button>
          </div>
        )}

        {/* ─── RECORDING UI (REC or LIVE) ──────── */}
        {isRecording && (
          <div>
            {/* Mode badge */}
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <span className={`status ${recMode === "live" ? "processing" : "recording"}`} style={{ fontSize: 12, padding: "4px 10px" }}>
                {recMode === "live" ? "📡 LIVE" : "🎙️ REC"}
              </span>
            </div>

            <div className="timer" style={{ color: isPaused ? "var(--orange)" : recMode === "live" ? "var(--accent)" : "var(--red)" }}>
              {formatTimer(recTime)}
            </div>

            {!isPaused && (
              <div className="waveform">
                {Array.from({ length: 20 }, (_, i) => (
                  <div
                    key={i}
                    className="bar"
                    style={{
                      animationDelay: `${i * 0.05}s`,
                      background: recMode === "live" ? "var(--accent)" : "var(--red)",
                    }}
                  />
                ))}
              </div>
            )}
            {isPaused && <div style={{ textAlign: "center", color: "var(--orange)", padding: 16 }}>En pause</div>}

            {recMode === "live" && (
              <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-soft)", marginBottom: 8 }}>
                Transcription automatique au stop ({selectedEngine})
              </div>
            )}

            <div className="rec-controls">
              {recMode === "rec" && (
                <button className="btn btn-ghost" onClick={pauseRecording}>
                  {isPaused ? "Reprendre" : "Pause"}
                </button>
              )}
              <button className="btn btn-danger" onClick={stopRecording} style={{ flex: 2 }}>
                Stop
              </button>
              <button className="btn btn-ghost btn-sm" onClick={addRecMark}>
                + Mark
              </button>
            </div>

            {recMarks.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-soft)" }}>
                {recMarks.map((m, i) => (
                  <div key={i}>Mark {i + 1} — {formatTimer(m.time)}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── PASTE MODE ──────────────────────── */}
        {mode === "paste" && (
          <div>
            <div className="form-group">
              <label>Titre (optionnel)</label>
              <input
                type="text"
                placeholder="Ex: Notes réunion, idée projet..."
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Texte</label>
              <textarea
                placeholder="Collez ou tapez votre texte ici..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handlePasteSave}
                disabled={pasteSaving || !pasteText.trim()}
                style={{ flex: 1 }}
              >
                {pasteSaving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setMode(null); setPasteTitle(""); setPasteText(""); }}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ─── IMPORT MODE ─────────────────────── */}
        {mode === "import" && (
          <div>
            <div
              className="file-drop"
              onClick={() => document.getElementById("file-input").click()}
            >
              {importFile ? (
                <span>{importFile.name} ({(importFile.size / 1024 / 1024).toFixed(1)} MB)</span>
              ) : (
                <span>Cliquez pour sélectionner un fichier audio<br />.wav .mp3 .m4a .webm .ogg</span>
              )}
              <input
                id="file-input"
                type="file"
                accept=".wav,.mp3,.m4a,.webm,.ogg"
                onChange={(e) => setImportFile(e.target.files[0] || null)}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {importFile && (
                <button
                  className="btn btn-primary"
                  onClick={handleImportUpload}
                  disabled={importUploading}
                  style={{ flex: 1 }}
                >
                  {importUploading ? "Upload en cours..." : "Uploader"}
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => { setMode(null); setImportFile(null); }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── SESSIONS SECTION ────────────────────── */}
      <div className="section">
        <div className="section-title">
          Mes sessions ({sessions.length})
        </div>

        {loading && <div className="loading">Chargement...</div>}

        {!loading && sessions.length === 0 && (
          <div className="empty">Aucune session. Utilisez Capture ci-dessus.</div>
        )}

        {sessions.map((s) => (
          <div key={s.id} className="session-item">
            <div className="session-header" onClick={() => toggleExpand(s.id)}>
              <span className="emoji">{inputModeEmoji(s.input_mode)}</span>
              <div className="info">
                <div className="title">{s.title || "(sans titre)"}</div>
                <div className="meta">
                  <span className={`status ${s.status}`}>{s.status}</span>
                  {s.duration_seconds ? ` · ${formatDuration(s.duration_seconds)}` : ""}
                  {s.transcript_words ? ` · ${s.transcript_words} mots` : ""}
                  {" · "}{formatDate(s.created_at)}
                </div>
              </div>
              <span className={`chevron ${expandedId === s.id ? "open" : ""}`}>&#9656;</span>
            </div>

            {/* Expanded detail */}
            {expandedId === s.id && expandedSession && (
              <div className="session-detail">
                {/* Transcript */}
                {expandedSession.transcript ? (
                  <div>
                    <label>Transcription ({expandedSession.transcript_words} mots)</label>
                    <div className="transcript">{expandedSession.transcript}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--text-soft)", padding: "8px 0" }}>
                    Pas de transcription.
                    {s.audio_url && (
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ marginLeft: 8, width: "auto" }}
                        onClick={() => handleTranscribe(s.id)}
                      >
                        Transcrire ({selectedEngine})
                      </button>
                    )}
                  </div>
                )}

                {/* Tags */}
                <div style={{ marginTop: 12 }}>
                  <label>Tags</label>
                  <div className="tags-row">
                    {tags.map((tag) => {
                      const sessionTagIds = (expandedSession.tags || []).map((t) => t.id);
                      return (
                        <span
                          key={tag.id}
                          className={`tag-chip ${sessionTagIds.includes(tag.id) ? "selected" : ""}`}
                          onClick={() => toggleSessionTag(s.id, tag.id, sessionTagIds)}
                        >
                          {tag.emoji} {tag.name}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div style={{ marginTop: 12 }}>
                  <label>Notes</label>
                  {(expandedSession.notes || []).map((n) => (
                    <div key={n.id} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                      {n.content}
                      <span style={{ fontSize: 10, color: "var(--text-soft)", marginLeft: 8 }}>{formatDate(n.created_at)}</span>
                    </div>
                  ))}
                  <div className="note-row">
                    <input
                      type="text"
                      placeholder="Ajouter une note..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddNote(s.id)}
                    />
                    <button className="btn btn-sm btn-ghost" onClick={() => handleAddNote(s.id)}>+</button>
                  </div>
                </div>

                {/* Marks */}
                {expandedSession.marks && expandedSession.marks.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <label>Marks</label>
                    {expandedSession.marks.map((m, i) => (
                      <div key={i} style={{ fontSize: 12, color: "var(--text-soft)" }}>
                        Mark @ {formatTimer(m.time)} {m.label && `— ${m.label}`}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="actions">
                  {expandedSession.transcript && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => { navigator.clipboard.writeText(expandedSession.transcript); setSuccess("Copié !"); }}
                    >
                      Copier
                    </button>
                  )}
                  {s.audio_url && expandedSession.transcript && (
                    <button className="btn btn-sm btn-ghost" onClick={() => handleTranscribe(s.id)}>
                      Re-transcrire
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>
                    Supprimer
                  </button>
                </div>
              </div>
            )}

            {/* Loading state for expansion */}
            {expandedId === s.id && !expandedSession && (
              <div className="session-detail">
                <div className="loading">Chargement...</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ─── TAGS SECTION ────────────────────────── */}
      <div className="section">
        <div className="section-title">Tags ({tags.length})</div>
        <div className="tags-row">
          {tags.map((tag) => (
            <span key={tag.id} className="tag-chip">
              {tag.emoji} {tag.name}
              {tag.session_count > 0 && <span style={{ fontSize: 10, color: "var(--text-soft)" }}> ({tag.session_count})</span>}
            </span>
          ))}
        </div>
        {tags.length === 0 && !loading && (
          <div className="empty">Aucun tag.</div>
        )}
      </div>
    </div>
  );
}
