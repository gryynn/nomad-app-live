import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./lib/api.js";
import useSpeechRecognition from "./hooks/useSpeechRecognition.js";

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
  const [recNotes, setRecNotes] = useState([]);
  const [recNoteInput, setRecNoteInput] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedTimeRef = useRef(0);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  // Engine selection
  const [selectedEngine, setSelectedEngine] = useState("groq-turbo");

  // Note input
  const [noteText, setNoteText] = useState("");

  // Live transcription preview (persists after stop until Groq finishes)
  const [livePreviewText, setLivePreviewText] = useState("");

  // Speech recognition
  const speech = useSpeechRecognition();

  // Section collapse states
  const [captureOpen, setCaptureOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

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

  // Canvas audio visualizer animation loop
  useEffect(() => {
    if (!isRecording || isPaused || !analyserRef.current || !canvasRef.current) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const barCount = 40;
      const gap = 2;
      const barW = (w - gap * (barCount - 1)) / barCount;
      const color = recMode === "live" ? "rgba(255,255,255,0.85)" : "rgba(255,68,68,0.85)";
      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i * bufferLength) / barCount);
        const val = dataArray[idx];
        const barH = Math.max(2, (val / 255) * h * 0.85);
        ctx.fillStyle = color;
        ctx.beginPath();
        const x = i * (barW + gap);
        const y = (h - barH) / 2;
        ctx.roundRect(x, y, barW, barH, 1);
        ctx.fill();
      }
    };
    draw();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isRecording, isPaused, recMode]);

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

      // Web Audio API for real-time visualizer
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

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
            // LIVE: auto-transcribe with Groq
            setSuccess("Audio uploadé. Transcription Groq en cours...");
            try {
              await api.transcribe(result.session_id, selectedEngine);
              // Poll for high-quality result
              const poll = async (attempts = 0) => {
                if (attempts > 12) { setLivePreviewText(""); return; }
                await loadSessions();
                try {
                  const detail = await api.getSession(result.session_id);
                  if (detail.transcript) {
                    setLivePreviewText("");
                    setSuccess(`Transcription terminée (${detail.transcript_words} mots)`);
                  } else {
                    setTimeout(() => poll(attempts + 1), 5000);
                  }
                } catch (_) {
                  setTimeout(() => poll(attempts + 1), 5000);
                }
              };
              setTimeout(() => poll(), 3000);
            } catch (te) {
              console.error("Auto-transcribe failed:", te);
              setError(`Transcription échouée: ${te.message}`);
              setLivePreviewText("");
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
      setRecNotes([]);
      setRecNoteInput("");
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setRecTime(Date.now() - startTimeRef.current);
      }, 100);

      // Start speech recognition for LIVE mode
      if (captureMode === "live") {
        speech.start("fr-FR");
        setLivePreviewText("");
      }
    } catch (e) {
      setError(`Micro non accessible: ${e.message}`);
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        // Resume: adjust startTime to compensate for pause duration
        mediaRecorderRef.current.resume();
        startTimeRef.current = Date.now() - pausedTimeRef.current;
        timerRef.current = setInterval(() => {
          setRecTime(Date.now() - startTimeRef.current);
        }, 100);
        if (recMode === "live") speech.resume("fr-FR");
        setIsPaused(false);
      } else {
        // Pause: save elapsed time and stop the interval
        mediaRecorderRef.current.pause();
        clearInterval(timerRef.current);
        pausedTimeRef.current = Date.now() - startTimeRef.current;
        if (recMode === "live") speech.pause();
        setIsPaused(true);
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      clearInterval(timerRef.current);
      // Cleanup animation
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      // Cleanup AudioContext
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
        analyserRef.current = null;
      }
      // Save live transcript before stopping speech
      if (recMode === "live" && speech.transcript) {
        setLivePreviewText(speech.transcript.trim());
      }
      speech.stop();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  }

  function addRecNote() {
    const text = recNoteInput.trim();
    const hashtags = (text.match(/#[\w\u00C0-\u024F]+/g) || []).map((t) => t.slice(1));
    setRecNotes((prev) => [...prev, { time: recTime, text, hashtags }]);
    setRecNoteInput("");
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
        <div className="section-title clickable" onClick={() => setCaptureOpen((v) => !v)}>
          <span className={`section-chevron ${captureOpen ? "open" : ""}`}>&#9656;</span>
          Capture
          {isRecording && !captureOpen && (
            <span className={`rec-badge ${recMode === "live" ? "live" : ""}`}>
              <span className="rec-dot" /> {formatTimer(recTime)}
            </span>
          )}
        </div>

        {captureOpen && (
          <>
            {/* Engine selector */}
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

                <div className="waveform">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={60}
                    style={{ width: "100%", height: 60, opacity: isPaused ? 0.3 : 1, transition: "opacity 0.2s" }}
                  />
                </div>
                {isPaused && <div style={{ textAlign: "center", color: "var(--orange)", fontSize: 13, padding: "4px 0" }}>En pause</div>}

                {recMode === "live" && (
                  <div className="live-transcript">
                    {speech.transcript && <span>{speech.transcript}</span>}
                    {speech.interimText && <span className="interim">{speech.interimText}</span>}
                    {!speech.transcript && !speech.interimText && (
                      <span className="placeholder">En écoute... parlez maintenant</span>
                    )}
                    <span className="cursor">|</span>
                  </div>
                )}

                <div className="rec-controls">
                  <button className="btn btn-ghost" onClick={pauseRecording}>
                    {isPaused ? "Reprendre" : "Pause"}
                  </button>
                  <button className="btn btn-danger" onClick={stopRecording} style={{ flex: 2 }}>
                    Stop
                  </button>
                </div>
              </div>
            )}

            {/* ─── LIVE PREVIEW (after stop, waiting for Groq) ─ */}
            {!isRecording && livePreviewText && (
              <div className="live-preview">
                <label>Transcription live (en attente Groq...)</label>
                <div className="transcript">{livePreviewText}</div>
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
          </>
        )}
      </div>

      {/* ─── SESSION NOTES (during recording) ──────── */}
      {isRecording && (
        <div className="section">
          <div className="section-title clickable" onClick={() => setNotesOpen((v) => !v)}>
            <span className={`section-chevron ${notesOpen ? "open" : ""}`}>&#9656;</span>
            Notes de session {recNotes.length > 0 && `(${recNotes.length})`}
          </div>

          {notesOpen && (
            <>
              <div className="rec-note-input">
                <input
                  type="text"
                  placeholder="Note ou #tag... (Entrée pour ajouter)"
                  value={recNoteInput}
                  onChange={(e) => setRecNoteInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRecNote()}
                />
                <button className="btn btn-sm btn-ghost" onClick={addRecNote}>
                  + Note
                </button>
              </div>

              {recNotes.length === 0 && (
                <div className="empty" style={{ padding: "12px 0" }}>
                  Ajoutez des notes, marks ou #tags pendant l'enregistrement
                </div>
              )}

              {recNotes.map((n, i) => (
                <div key={i} className="rec-note-item">
                  <span className="rec-note-time">{formatTimer(n.time)}</span>
                  <div className="rec-note-body">
                    {n.text ? (
                      <span>{n.text.replace(/#[\w\u00C0-\u024F]+/g, "").trim() || "mark"}</span>
                    ) : (
                      <span className="rec-note-mark">mark</span>
                    )}
                    {n.hashtags.length > 0 && (
                      <span className="rec-note-tags">
                        {n.hashtags.map((t, j) => (
                          <span key={j} className="hashtag">#{t}</span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ─── SESSIONS SECTION ────────────────────── */}
      <div className="section">
        <div className="section-title clickable" onClick={() => setSessionsOpen((v) => !v)}>
          <span className={`section-chevron ${sessionsOpen ? "open" : ""}`}>&#9656;</span>
          Mes sessions ({sessions.length})
        </div>

        {sessionsOpen && (
          <>
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
          </>
        )}
      </div>

      {/* ─── TAGS SECTION ────────────────────────── */}
      <div className="section">
        <div className="section-title clickable" onClick={() => setTagsOpen((v) => !v)}>
          <span className={`section-chevron ${tagsOpen ? "open" : ""}`}>&#9656;</span>
          Tags ({tags.length})
        </div>
        {tagsOpen && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
