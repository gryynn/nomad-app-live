import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./lib/api.js";
import useSpeechRecognition from "./hooks/useSpeechRecognition.js";
import { useOfflineSync } from "./hooks/useOfflineSync.js";

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

function getTimeFilterDate(preset) {
  const now = new Date();
  if (preset === "1h") return new Date(now - 3600_000).toISOString();
  if (preset === "today") { now.setHours(0, 0, 0, 0); return now.toISOString(); }
  if (preset === "week") return new Date(now - 7 * 86400_000).toISOString();
  if (preset === "month") return new Date(now - 30 * 86400_000).toISOString();
  return null;
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
  const [recNotesText, setRecNotesText] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedTimeRef = useRef(0);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const recNotesRef = useRef(null);
  const cancelledRef = useRef(false);

  // Engine selection
  const [selectedEngine, setSelectedEngine] = useState("groq-turbo");

  // Session title editing
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");

  // Session notes (expanded detail)
  const sessionNotesRef = useRef(null);
  const [sessionNotesText, setSessionNotesText] = useState("");
  const [sessionNotesDirty, setSessionNotesDirty] = useState(false);
  const [sessionTagSuggestions, setSessionTagSuggestions] = useState([]);
  const [sessionTagSuggestPos, setSessionTagSuggestPos] = useState(null);

  // Live transcription preview + post-stop choice
  const [livePreviewText, setLivePreviewText] = useState("");
  const [liveSessionId, setLiveSessionId] = useState(null);
  const [liveEditText, setLiveEditText] = useState("");
  const lastSpeechLenRef = useRef(0);

  // Post-stop review
  const [recTitle, setRecTitle] = useState("");
  const [pendingBlob, setPendingBlob] = useState(null);
  const [pendingDuration, setPendingDuration] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [tagSuggestPos, setTagSuggestPos] = useState(null);

  // Speech recognition
  const speech = useSpeechRecognition();

  // Stealth mode (LIVE)
  const [stealthMode, setStealthMode] = useState(false);

  // Section collapse states
  const [captureOpen, setCaptureOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  // Session filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterTagIds, setFilterTagIds] = useState([]);
  const [filterTime, setFilterTime] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterSearchTimer = useRef(null);

  // Editable transcript in session detail
  const [editingTranscript, setEditingTranscript] = useState("");
  const [transcriptDirty, setTranscriptDirty] = useState(false);

  // Offline sync + autosave
  const offline = useOfflineSync();
  const [autoSaving, setAutoSaving] = useState(false);
  const autoSaveTranscriptTimer = useRef(null);
  const autoSaveNotesTimer = useRef(null);

  // ─── Load data ────────────────────────────────────
  const loadSessions = useCallback(async (filters = {}) => {
    try {
      const params = { limit: 50 };
      const st = filters.status ?? filterStatus;
      const sq = filters.search ?? filterSearch;
      const stags = filters.tags ?? filterTagIds;
      const stime = filters.time ?? filterTime;
      if (st && st !== "all") params.status = st;
      if (sq) params.search = sq;
      if (stags && stags.length > 0) params.tag = stags.join(",");
      const createdAfter = getTimeFilterDate(stime);
      if (createdAfter) params.created_after = createdAfter;
      const data = await api.getSessions(params);
      setSessions(data);
    } catch (e) {
      console.error("Failed to load sessions:", e);
      setError(`Sessions: ${e.message}`);
    }
  }, [filterStatus, filterSearch, filterTagIds, filterTime]);

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

  // Reload sessions when filters change (debounce search)
  useEffect(() => {
    // Skip on initial mount (loading still true)
    if (loading) return;
    loadSessions();
  }, [filterStatus, filterTagIds, filterTime]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading) return;
    if (filterSearchTimer.current) clearTimeout(filterSearchTimer.current);
    filterSearchTimer.current = setTimeout(() => loadSessions(), 400);
    return () => clearTimeout(filterSearchTimer.current);
  }, [filterSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-clear messages
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 4000); return () => clearTimeout(t); }
  }, [success]);
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 8000); return () => clearTimeout(t); }
  }, [error]);

  // ─── Garde-fou navigation (beforeunload) ──────────
  useEffect(() => {
    const hasUnsaved = isRecording || showReview || transcriptDirty || sessionNotesDirty || pasteSaving || importUploading;
    if (!hasUnsaved) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRecording, showReview, transcriptDirty, sessionNotesDirty, pasteSaving, importUploading]);

  // ─── Autosave transcript (debounced 3s) ───────────
  useEffect(() => {
    if (!transcriptDirty || !expandedId) return;
    if (autoSaveTranscriptTimer.current) clearTimeout(autoSaveTranscriptTimer.current);
    autoSaveTranscriptTimer.current = setTimeout(async () => {
      try {
        setAutoSaving(true);
        const wordCount = editingTranscript.trim().split(/\s+/).filter(Boolean).length;
        await api.updateSession(expandedId, { transcript: editingTranscript.trim(), transcript_words: wordCount });
        setTranscriptDirty(false);
        const detail = await api.getSession(expandedId);
        setExpandedSession(detail);
      } catch (e) {
        console.error("[AUTOSAVE] transcript failed:", e);
      } finally {
        setAutoSaving(false);
      }
    }, 3000);
    return () => clearTimeout(autoSaveTranscriptTimer.current);
  }, [editingTranscript, transcriptDirty, expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Autosave notes (debounced 3s) ───────────────
  useEffect(() => {
    if (!sessionNotesDirty || !expandedId) return;
    if (autoSaveNotesTimer.current) clearTimeout(autoSaveNotesTimer.current);
    autoSaveNotesTimer.current = setTimeout(async () => {
      try {
        setAutoSaving(true);
        await api.addNote(expandedId, sessionNotesText.trim());
        const hashtags = extractHashtags(sessionNotesText);
        if (hashtags.length > 0) {
          const sessionTagIds = (expandedSession?.tags || []).map((t) => t.id);
          const newTagIds = await ensureTagsExist(hashtags);
          const mergedIds = [...new Set([...sessionTagIds, ...newTagIds])];
          if (mergedIds.length > sessionTagIds.length) {
            await api.setSessionTags(expandedId, mergedIds);
          }
        }
        setSessionNotesDirty(false);
        const detail = await api.getSession(expandedId);
        setExpandedSession(detail);
        const updatedNotes = (detail.notes || []).map((n) => n.content).join("\n");
        setSessionNotesText(updatedNotes);
      } catch (e) {
        console.error("[AUTOSAVE] notes failed:", e);
      } finally {
        setAutoSaving(false);
      }
    }, 3000);
    return () => clearTimeout(autoSaveNotesTimer.current);
  }, [sessionNotesText, sessionNotesDirty, expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [isRecording, isPaused, recMode, captureOpen]);

  // Append new speech text to editable live transcript
  useEffect(() => {
    if (!isRecording || recMode !== "live") return;
    const full = speech.transcript || "";
    console.log("[LIVE] speech.transcript changed:", { len: full.length, lastLen: lastSpeechLenRef.current, listening: speech.isListening, interim: speech.interimText?.length || 0 });
    if (full.length > lastSpeechLenRef.current) {
      const delta = full.slice(lastSpeechLenRef.current);
      console.log("[LIVE] Appending delta:", delta);
      setLiveEditText((prev) => prev + delta);
      lastSpeechLenRef.current = full.length;
    }
  }, [speech.transcript, isRecording, recMode, speech.isListening, speech.interimText]);

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
      // For LIVE mode: start speech recognition FIRST, then get stream for recording.
      // The Speech API needs its own mic access before getUserMedia locks it.
      if (captureMode === "live") {
        speech.start("fr-FR");
        setLivePreviewText("");
        setLiveEditText("");
        lastSpeechLenRef.current = 0;
        // Small delay to let speech API grab the mic
        await new Promise((r) => setTimeout(r, 300));
        console.log("[REC] speech started, isListening:", speech.isListening);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[REC] getUserMedia OK, tracks:", stream.getAudioTracks().length);

      // Web Audio API for real-time visualizer
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      // Check supported mimeType
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
        : "";
      console.log("[REC] MediaRecorder mimeType:", mimeType || "default");
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelledRef.current) {
          cancelledRef.current = false;
          setRecMode(null);
          setMode(null);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        const durationSec = Math.round((Date.now() - startTimeRef.current) / 1000);
        console.log(`[REC] stopped: ${blob.size} bytes, ${durationSec}s, mode=${captureMode}, chunks=${chunksRef.current.length}`);
        setPendingBlob(blob);
        setPendingDuration(durationSec);
        setShowReview(true);
      };

      recorder.start(1000);
      console.log("[REC] MediaRecorder started, state:", recorder.state);
      setRecMode(captureMode);
      setIsRecording(true);
      setIsPaused(false);
      setRecTime(0);
      setRecNotesText("");
      setRecTitle("");
      setShowReview(false);
      setTagSuggestions([]);
      cancelledRef.current = false;
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setRecTime(Date.now() - startTimeRef.current);
      }, 100);
    } catch (e) {
      console.error("[REC] startRecording failed:", e);
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
      // Save edited live transcript before stopping speech
      if (recMode === "live" && liveEditText) {
        setLivePreviewText(liveEditText.trim());
      }
      speech.stop();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      setStealthMode(false);
    }
  }

  function insertMark() {
    const ta = recNotesRef.current;
    if (!ta) return;
    const stamp = `[${formatTimer(recTime)}] `;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newText = recNotesText.substring(0, start) + stamp + recNotesText.substring(end);
    setRecNotesText(newText);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + stamp.length; ta.focus(); }, 0);
  }

  function insertTag(tagName) {
    const ta = recNotesRef.current;
    if (!ta) return;
    const hashtag = `#${tagName} `;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newText = recNotesText.substring(0, start) + hashtag + recNotesText.substring(end);
    setRecNotesText(newText);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + hashtag.length; ta.focus(); }, 0);
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      cancelledRef.current = true;
      clearInterval(timerRef.current);
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; analyserRef.current = null; }
      speech.stop();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      setStealthMode(false);
      setSuccess("Enregistrement annulé");
    }
  }

  // ─── Auto-create tags that don't exist yet ─────────
  async function ensureTagsExist(hashtags) {
    if (!hashtags.length) return [];
    let needRefresh = false;
    const ids = [];
    for (const ht of hashtags) {
      const existing = tags.find((t) => t.name.toLowerCase() === ht);
      if (existing) {
        ids.push(existing.id);
      } else {
        try {
          const created = await api.createTag({ name: ht, emoji: "🏷️" });
          ids.push(created.id);
          needRefresh = true;
        } catch (e) {
          console.error(`Failed to create tag "${ht}":`, e);
        }
      }
    }
    if (needRefresh) await loadTags();
    return ids;
  }

  // ─── Post-stop review: save session with all metadata ───
  function extractHashtags(text) {
    const matches = text.match(/#(\w+)/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
  }

  function handleNotesChange(e) {
    const text = e.target.value;
    setRecNotesText(text);
    const cursor = e.target.selectionStart;
    const beforeCursor = text.slice(0, cursor);
    const hashMatch = beforeCursor.match(/#(\w*)$/);
    if (hashMatch && hashMatch[1].length > 0) {
      const query = hashMatch[1].toLowerCase();
      const matching = tags.filter(
        (t) => t.name.toLowerCase().startsWith(query) && t.name.toLowerCase() !== query
      );
      setTagSuggestions(matching.slice(0, 5));
      setTagSuggestPos({ start: cursor - hashMatch[0].length, end: cursor });
    } else {
      setTagSuggestions([]);
      setTagSuggestPos(null);
    }
  }

  function selectTagSuggestion(tagName) {
    if (!tagSuggestPos) return;
    const before = recNotesText.slice(0, tagSuggestPos.start);
    const after = recNotesText.slice(tagSuggestPos.end);
    const newText = before + `#${tagName} ` + after;
    setRecNotesText(newText);
    setTagSuggestions([]);
    setTagSuggestPos(null);
    setTimeout(() => {
      const ta = recNotesRef.current;
      if (ta) {
        const pos = before.length + tagName.length + 2;
        ta.selectionStart = ta.selectionEnd = pos;
        ta.focus();
      }
    }, 0);
  }

  async function handleSaveReview(doTranscribe = false) {
    if (!pendingBlob) {
      setError("Pas de données audio enregistrées");
      return;
    }
    console.log("[SAVE] pendingBlob:", pendingBlob.size, "bytes, type:", pendingBlob.type);
    setReviewSaving(true);
    setError(null);
    try {
      // 1. Upload audio
      const ext = pendingBlob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([pendingBlob], `${recMode}_${Date.now()}.${ext}`, { type: pendingBlob.type });
      console.log("[SAVE] uploading file:", file.name, file.size, "bytes");

      let result;
      try {
        result = await api.uploadAudio(file);
      } catch (uploadErr) {
        // Offline fallback: save to IndexedDB
        console.warn("[SAVE] Upload failed, saving offline:", uploadErr);
        await offline.saveRecordingOffline({
          id: `rec_${Date.now()}`,
          blob: pendingBlob,
          filename: file.name,
          mode: recMode,
          title: recTitle.trim(),
          notes: recNotesText.trim(),
          liveTranscript: recMode === "live" ? livePreviewText : null,
          duration: pendingDuration,
          engine: doTranscribe ? selectedEngine : null,
          savedAt: new Date().toISOString(),
        });
        setSuccess(`Sauvegardé hors-ligne (${offline.pendingCount + 1} en attente)`);
        setPendingBlob(null); setShowReview(false); setRecTitle(""); setRecNotesText("");
        setLivePreviewText(""); setLiveEditText(""); lastSpeechLenRef.current = 0;
        setLiveSessionId(null); setRecMode(null); setMode(null); setTagSuggestions([]);
        setReviewSaving(false);
        return;
      }

      console.log("[SAVE] upload result:", result);
      const sessionId = result.session_id;

      // 2. Update session metadata
      const updates = { input_mode: recMode };
      if (recTitle.trim()) updates.title = recTitle.trim();
      if (pendingDuration) updates.duration_seconds = pendingDuration;
      if (recMode === "live" && livePreviewText) {
        updates.transcript = livePreviewText;
        updates.status = "transcribed";
      }
      await api.updateSession(sessionId, updates);

      // 3. Save notes
      if (recNotesText.trim()) {
        await api.addNote(sessionId, recNotesText.trim());
      }

      // 4. Extract tags from notes, auto-create missing ones, and apply to session
      const hashtags = extractHashtags(recNotesText);
      if (hashtags.length > 0) {
        const tagIds = await ensureTagsExist(hashtags);
        if (tagIds.length > 0) {
          await api.setSessionTags(sessionId, tagIds);
        }
      }

      // 5. Optionally trigger transcription
      if (doTranscribe) {
        console.log("[SAVE] triggering transcription, engine:", selectedEngine);
        const trResult = await api.transcribe(sessionId, selectedEngine);
        console.log("[SAVE] transcribe result:", trResult);
        setSuccess("Session sauvegardée, transcription lancée");
      } else {
        setSuccess("Session sauvegardée");
      }

      // Cleanup
      setPendingBlob(null);
      setShowReview(false);
      setRecTitle("");
      setRecNotesText("");
      setLivePreviewText("");
      setLiveEditText("");
      lastSpeechLenRef.current = 0;
      setLiveSessionId(null);
      setRecMode(null);
      setMode(null);
      setTagSuggestions([]);
      await loadSessions();
    } catch (e) {
      setError(`Erreur: ${e.message}`);
    } finally {
      setReviewSaving(false);
    }
  }

  function handleDiscardReview() {
    setPendingBlob(null);
    setShowReview(false);
    setRecTitle("");
    setRecNotesText("");
    setLivePreviewText("");
    setLiveEditText("");
    lastSpeechLenRef.current = 0;
    setLiveSessionId(null);
    setRecMode(null);
    setMode(null);
    setTagSuggestions([]);
    setSuccess("Enregistrement annulé");
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
    setSessionNotesDirty(false);
    setTranscriptDirty(false);
    setSessionTagSuggestions([]);
    try {
      const detail = await api.getSession(id);
      setExpandedSession(detail);
      setEditingTranscript(detail.transcript || "");
      const existingNotes = (detail.notes || []).map((n) => n.content).join("\n");
      setSessionNotesText(existingNotes);
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
          setEditingTranscript(detail.transcript);
          setTranscriptDirty(false);
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

  // ─── Rename session title ──────────────────────
  async function handleSaveTitle(sessionId) {
    const newTitle = editingTitleValue.trim();
    setEditingTitleId(null);
    if (!newTitle) return;
    try {
      await api.updateSession(sessionId, { title: newTitle });
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, title: newTitle } : s));
      if (expandedSession?.id === sessionId) setExpandedSession((prev) => ({ ...prev, title: newTitle }));
    } catch (e) {
      setError(`Erreur renommage: ${e.message}`);
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

  // ─── Session notes (in expanded detail) ─────────
  function handleSessionNotesChange(e) {
    const text = e.target.value;
    setSessionNotesText(text);
    setSessionNotesDirty(true);
    const cursor = e.target.selectionStart;
    const beforeCursor = text.slice(0, cursor);
    const hashMatch = beforeCursor.match(/#(\w*)$/);
    if (hashMatch && hashMatch[1].length > 0) {
      const query = hashMatch[1].toLowerCase();
      const matching = tags.filter(
        (t) => t.name.toLowerCase().startsWith(query) && t.name.toLowerCase() !== query
      );
      setSessionTagSuggestions(matching.slice(0, 5));
      setSessionTagSuggestPos({ start: cursor - hashMatch[0].length, end: cursor });
    } else {
      setSessionTagSuggestions([]);
      setSessionTagSuggestPos(null);
    }
  }

  function selectSessionTagSuggestion(tagName) {
    if (!sessionTagSuggestPos) return;
    const before = sessionNotesText.slice(0, sessionTagSuggestPos.start);
    const after = sessionNotesText.slice(sessionTagSuggestPos.end);
    const newText = before + `#${tagName} ` + after;
    setSessionNotesText(newText);
    setSessionNotesDirty(true);
    setSessionTagSuggestions([]);
    setSessionTagSuggestPos(null);
    setTimeout(() => {
      const ta = sessionNotesRef.current;
      if (ta) {
        const pos = before.length + tagName.length + 2;
        ta.selectionStart = ta.selectionEnd = pos;
        ta.focus();
      }
    }, 0);
  }

  async function handleSaveSessionNotes(sessionId) {
    if (!sessionNotesText.trim()) return;
    try {
      await api.addNote(sessionId, sessionNotesText.trim());
      // Apply #tags from notes to session, auto-create missing ones
      const hashtags = extractHashtags(sessionNotesText);
      if (hashtags.length > 0) {
        const sessionTagIds = (expandedSession.tags || []).map((t) => t.id);
        const newTagIds = await ensureTagsExist(hashtags);
        const mergedIds = [...new Set([...sessionTagIds, ...newTagIds])];
        if (mergedIds.length > sessionTagIds.length) {
          await api.setSessionTags(sessionId, mergedIds);
        }
      }
      setSessionNotesDirty(false);
      const detail = await api.getSession(sessionId);
      setExpandedSession(detail);
      const updatedNotes = (detail.notes || []).map((n) => n.content).join("\n");
      setSessionNotesText(updatedNotes);
      setSuccess("Notes sauvegardées");
    } catch (e) {
      setError(`Erreur: ${e.message}`);
    }
  }

  // ─── Save edited transcript ─────────────────────
  async function handleSaveTranscript(sessionId) {
    try {
      const wordCount = editingTranscript.trim().split(/\s+/).filter(Boolean).length;
      await api.updateSession(sessionId, {
        transcript: editingTranscript.trim(),
        transcript_words: wordCount,
      });
      setTranscriptDirty(false);
      const detail = await api.getSession(sessionId);
      setExpandedSession(detail);
      setEditingTranscript(detail.transcript || "");
      await loadSessions();
      setSuccess("Transcription mise à jour");
    } catch (e) {
      setError(`Erreur: ${e.message}`);
    }
  }

  // ─── Filter helpers ────────────────────────────────
  const activeFilterCount = [
    filterStatus !== "all",
    filterSearch !== "",
    filterTime !== "all",
    filterTagIds.length > 0,
  ].filter(Boolean).length;

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════
  return (
    <div className="app">
      {/* ─── HEADER ──────────────────────────────── */}
      <div className="header">
        <h1>N O M A D</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {autoSaving && <span className="autosave-indicator">sauvegarde...</span>}
          {!offline.isOnline && <span className="offline-badge">hors-ligne</span>}
          {offline.pendingCount > 0 && <span className="pending-badge" title={`${offline.pendingCount} élément(s) en attente de sync`}>{offline.pendingCount}</span>}
          <div className={`status-dot ${!offline.isOnline ? "offline" : loading ? "offline" : ""}`} title={!offline.isOnline ? "Hors-ligne" : loading ? "Chargement..." : "Connecté"} />
        </div>
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
            {!isRecording && !showReview && (
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
            {!isRecording && mode === null && !showReview && (
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
                    {recMode === "live" && (
                      <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: speech.isListening ? "var(--green)" : "var(--red)" }} />
                    )}
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
                  <div>
                    {/* Stealth toggle + status line */}
                    <div style={{ fontSize: 11, color: "var(--text-soft)", padding: "2px 0 6px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: speech.isListening ? "var(--green)" : "var(--red)" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                        {speech.isListening ? "Écoute" : speech.isSupported ? "Inactif" : "Non supporté"}
                      </span>
                      {!stealthMode && speech.isListening && !liveEditText && !speech.interimText && (
                        <span style={{ fontStyle: "italic" }}>Parlez...</span>
                      )}
                      {!stealthMode && liveEditText && (
                        <span>{liveEditText.trim().split(/\s+/).filter(Boolean).length} mots</span>
                      )}
                      {!speech.isListening && isRecording && !isPaused && speech.isSupported && (
                        <button className="btn btn-sm btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }} onClick={() => speech.start("fr-FR")}>
                          Relancer
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-ghost stealth-toggle"
                        style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 10, opacity: stealthMode ? 1 : 0.5 }}
                        onClick={() => setStealthMode((v) => !v)}
                        title={stealthMode ? "Afficher la transcription" : "Masquer la transcription (mode discret)"}
                      >
                        {stealthMode ? "👁️" : "👁️‍🗨️"}
                      </button>
                    </div>

                    {stealthMode ? (
                      /* ─── STEALTH: minimal pulsing indicator ─── */
                      <div className="stealth-indicator">
                        <div className="stealth-pulse" style={{ background: speech.isListening ? "var(--green)" : "var(--text-soft)" }} />
                        <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
                          {liveEditText ? `${liveEditText.trim().split(/\s+/).filter(Boolean).length} mots capturés` : "En attente..."}
                        </span>
                      </div>
                    ) : (
                      /* ─── NORMAL: full transcript view ─── */
                      <>
                        <textarea
                          className="live-edit-textarea"
                          placeholder={speech.isSupported ? "La transcription apparaît ici... vous pouvez aussi éditer" : "Web Speech API non supportée — utilisez Chrome sur desktop/Android"}
                          value={liveEditText}
                          onChange={(e) => setLiveEditText(e.target.value)}
                        />
                        {speech.interimText && (
                          <div className="live-interim">{speech.interimText}...</div>
                        )}
                        {speech.error && (
                          <div className="error-msg" style={{ fontSize: 12, padding: "6px 10px" }}>
                            {speech.error}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="rec-controls">
                  <button className="btn btn-ghost" onClick={pauseRecording}>
                    {isPaused ? "Reprendre" : "Pause"}
                  </button>
                  <button className="btn btn-danger" onClick={stopRecording} style={{ flex: 2 }}>
                    Stop
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={cancelRecording}>
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* ─── POST-STOP REVIEW ─────────────────── */}
            {!isRecording && showReview && (
              <div className="review-screen">
                <div className="review-header">
                  <span className={`status ${recMode === "live" ? "processing" : "recording"}`}>
                    {recMode === "live" ? "📡 LIVE" : "🎙️ REC"} — {formatTimer(pendingDuration * 1000)}
                  </span>
                  <div style={{ fontSize: 10, color: "var(--text-soft)", marginTop: 4, fontFamily: "monospace" }}>
                    audio: {pendingBlob ? `${(pendingBlob.size / 1024).toFixed(0)} KB ${pendingBlob.type}` : "aucun blob!"}
                  </div>
                </div>

                <div className="form-group">
                  <label>Titre</label>
                  <input
                    type="text"
                    placeholder="Titre de la session..."
                    value={recTitle}
                    onChange={(e) => setRecTitle(e.target.value)}
                  />
                </div>

                {recMode === "live" && livePreviewText && (
                  <div className="form-group">
                    <label>Transcription live ({livePreviewText.split(/\s+/).filter(Boolean).length} mots)</label>
                    <textarea
                      value={livePreviewText}
                      onChange={(e) => setLivePreviewText(e.target.value)}
                      style={{ minHeight: 80 }}
                    />
                  </div>
                )}

                <div className="form-group" style={{ position: "relative" }}>
                  <label>Notes</label>
                  <textarea
                    ref={recNotesRef}
                    placeholder="Notes libres... tapez # pour ajouter un tag"
                    value={recNotesText}
                    onChange={handleNotesChange}
                    style={{ minHeight: 80 }}
                  />
                  {tagSuggestions.length > 0 && (
                    <div className="tag-suggest">
                      {tagSuggestions.map((t) => (
                        <div key={t.id} className="tag-suggest-item" onClick={() => selectTagSuggestion(t.name)}>
                          {t.emoji} #{t.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {extractHashtags(recNotesText).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <label>Tags détectés</label>
                    <div className="tags-row">
                      {extractHashtags(recNotesText).map((ht) => {
                        const match = tags.find((t) => t.name.toLowerCase() === ht);
                        return (
                          <span key={ht} className={`tag-chip ${match ? "selected" : ""}`}>
                            {match ? match.emoji : "🏷️"} {ht}
                            {!match && <span style={{ fontSize: 9, opacity: 0.5 }}> (nouveau)</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSaveReview(false)}
                    disabled={reviewSaving}
                    style={{ flex: 1 }}
                  >
                    {reviewSaving ? "Sauvegarde..." : "Sauvegarder"}
                  </button>
                  <div className="transcribe-row">
                    <select
                      className="engine-select"
                      value={selectedEngine}
                      onChange={(e) => setSelectedEngine(e.target.value)}
                    >
                      {engines.filter((e) => e.status === "online").map((eng) => (
                        <option key={eng.id} value={eng.id}>
                          {eng.id === "groq-turbo" ? "Groq" : eng.id === "groq-large" ? "Groq+" : eng.id === "deepgram" ? "DG" : "WYNONA"}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleSaveReview(true)}
                      disabled={reviewSaving}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      Transcrire
                    </button>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleDiscardReview}
                  disabled={reviewSaving}
                  style={{ width: "100%", marginTop: 8 }}
                >
                  Annuler
                </button>
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
            Notes de session
          </div>

          {notesOpen && (
            <>
              <div className="form-group">
                <label>Titre</label>
                <input
                  type="text"
                  placeholder="Titre de la session..."
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                />
              </div>
              <div style={{ position: "relative" }}>
                <textarea
                  ref={recNotesRef}
                  className="rec-notes-textarea"
                  placeholder="Notes libres... utilisez Mark pour insérer un timestamp, ou tapez #tag"
                  value={recNotesText}
                  onChange={handleNotesChange}
                />
                {tagSuggestions.length > 0 && (
                  <div className="tag-suggest">
                    {tagSuggestions.map((t) => (
                      <div key={t.id} className="tag-suggest-item" onClick={() => selectTagSuggestion(t.name)}>
                        {t.emoji} #{t.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rec-notes-bar">
                <button className="btn btn-sm btn-ghost" onClick={insertMark}>
                  Mark ⏱
                </button>
                {tags.length > 0 && (
                  <div className="tags-shortcuts">
                    {tags.map((tag) => (
                      <span key={tag.id} className="tag-shortcut" onClick={() => insertTag(tag.name)}>
                        {tag.emoji} {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── SESSIONS SECTION ────────────────────── */}
      <div className="section">
        <div className="section-title clickable" onClick={() => setSessionsOpen((v) => !v)}>
          <span className={`section-chevron ${sessionsOpen ? "open" : ""}`}>&#9656;</span>
          Mes sessions ({sessions.length})
          {activeFilterCount > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4, textTransform: "none", letterSpacing: 0 }}>
              {activeFilterCount} filtre{activeFilterCount > 1 ? "s" : ""}
              <span onClick={(e) => { e.stopPropagation(); setFilterStatus("all"); setFilterSearch(""); setFilterTagIds([]); setFilterTime("all"); }} style={{ cursor: "pointer", marginLeft: 2 }}>✕</span>
            </span>
          )}
        </div>

        {sessionsOpen && (
          <>
            {/* Collapsible filter bar */}
            <div className="filter-toggle" onClick={() => setFiltersOpen((v) => !v)}>
              <span className={`section-chevron ${filtersOpen ? "open" : ""}`}>&#9656;</span>
              <span>Filtres</span>
              {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
            </div>
            {filtersOpen && (
              <div className="filter-bar">
                <input
                  className="filter-search"
                  type="text"
                  placeholder="Rechercher..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
                <div className="filter-chips">
                  {[
                    { val: "all", label: "Tout" },
                    { val: "1h", label: "1h" },
                    { val: "today", label: "Aujourd'hui" },
                    { val: "week", label: "7j" },
                    { val: "month", label: "30j" },
                  ].map((t) => (
                    <button
                      key={t.val}
                      className={`filter-chip ${filterTime === t.val ? "active" : ""}`}
                      onClick={() => setFilterTime(t.val)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="filter-chips">
                  {["all", "pending", "uploaded", "transcribed", "error"].map((st) => (
                    <button
                      key={st}
                      className={`filter-chip ${filterStatus === st ? "active" : ""}`}
                      onClick={() => setFilterStatus(st)}
                    >
                      {st === "all" ? "Tout" : st}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && <div className="loading">Chargement...</div>}

            {!loading && sessions.length === 0 && (
              <div className="empty">Aucune session{activeFilterCount > 0 ? " pour ces filtres" : ". Utilisez Capture ci-dessus"}.</div>
            )}

            {sessions.map((s) => (
              <div key={s.id} className="session-item">
                <div className="session-header" onClick={() => toggleExpand(s.id)}>
                  <span className="emoji">{inputModeEmoji(s.input_mode)}</span>
                  <div className="info">
                    {editingTitleId === s.id ? (
                      <input
                        className="title-edit-input"
                        autoFocus
                        value={editingTitleValue}
                        onChange={(e) => setEditingTitleValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(s.id); if (e.key === "Escape") setEditingTitleId(null); }}
                        onBlur={() => handleSaveTitle(s.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="title" onDoubleClick={(e) => { e.stopPropagation(); setEditingTitleId(s.id); setEditingTitleValue(s.title || ""); }}>
                        {s.title || "(sans titre)"}
                      </div>
                    )}
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
                        <label>Transcription ({(editingTranscript || expandedSession.transcript).trim().split(/\s+/).filter(Boolean).length} mots)</label>
                        <textarea
                          className="transcript-edit"
                          value={editingTranscript || expandedSession.transcript}
                          onChange={(e) => { setEditingTranscript(e.target.value); setTranscriptDirty(true); }}
                        />
                        {transcriptDirty && (
                          <button
                            className="btn btn-sm btn-primary"
                            style={{ marginTop: 6, width: "auto" }}
                            onClick={() => handleSaveTranscript(s.id)}
                          >
                            Sauvegarder transcription
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--text-soft)", padding: "8px 0" }}>
                        Pas de transcription.
                        {s.audio_url && (
                          <div className="transcribe-row">
                            <select
                              className="engine-select"
                              value={selectedEngine}
                              onChange={(e) => setSelectedEngine(e.target.value)}
                            >
                              {engines.filter((e) => e.status === "online").map((eng) => (
                                <option key={eng.id} value={eng.id}>
                                  {eng.name} — ${eng.cost_per_hour}/h
                                </option>
                              ))}
                            </select>
                            <button
                              className="btn btn-sm btn-primary"
                              style={{ width: "auto", whiteSpace: "nowrap" }}
                              onClick={() => handleTranscribe(s.id)}
                            >
                              Transcrire
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tags */}
                    {(() => {
                      const sessionTagIds = (expandedSession.tags || []).map((t) => t.id);
                      const selectedTags = tags.filter((t) => sessionTagIds.includes(t.id));
                      const availableTags = tags.filter((t) => !sessionTagIds.includes(t.id));
                      return (
                        <div style={{ marginTop: 12 }}>
                          <label>Tags {selectedTags.length > 0 && <span style={{ color: "var(--accent)", fontWeight: 400 }}>({selectedTags.length})</span>}</label>
                          {/* Selected tags — prominent */}
                          {selectedTags.length > 0 && (
                            <div className="tags-row" style={{ marginBottom: 6 }}>
                              {selectedTags.map((tag) => (
                                <span key={tag.id} className="tag-chip selected" onClick={() => toggleSessionTag(s.id, tag.id, sessionTagIds)}>
                                  {tag.emoji} {tag.name} <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>✕</span>
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Available tags — subdued */}
                          <div className="tags-row tags-available">
                            {availableTags.map((tag) => (
                              <span key={tag.id} className="tag-chip" onClick={() => toggleSessionTag(s.id, tag.id, sessionTagIds)}>
                                {tag.emoji} {tag.name}
                              </span>
                            ))}
                            {/* Quick-create tag */}
                            <span
                              className="tag-chip tag-create"
                              onClick={async () => {
                                const name = prompt("Nouveau tag :");
                                if (!name?.trim()) return;
                                try {
                                  const newTag = await api.createTag({ name: name.trim(), emoji: "🏷️" });
                                  await loadTags();
                                  const newIds = [...sessionTagIds, newTag.id];
                                  const updated = await api.setSessionTags(s.id, newIds);
                                  setExpandedSession(updated);
                                } catch (e) {
                                  setError(`Erreur création tag: ${e.message}`);
                                }
                              }}
                            >
                              + tag
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Notes */}
                    <div style={{ marginTop: 12, position: "relative" }}>
                      <label>Notes</label>
                      <textarea
                        ref={sessionNotesRef}
                        className="rec-notes-textarea"
                        placeholder="Notes de session... tapez # pour ajouter un tag"
                        value={sessionNotesText}
                        onChange={handleSessionNotesChange}
                        style={{ minHeight: 60 }}
                      />
                      {sessionTagSuggestions.length > 0 && (
                        <div className="tag-suggest">
                          {sessionTagSuggestions.map((t) => (
                            <div key={t.id} className="tag-suggest-item" onClick={() => selectSessionTagSuggestion(t.name)}>
                              {t.emoji} #{t.name}
                            </div>
                          ))}
                        </div>
                      )}
                      {sessionNotesDirty && (
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ marginTop: 6, width: "auto" }}
                          onClick={() => handleSaveSessionNotes(s.id)}
                        >
                          Sauvegarder notes
                        </button>
                      )}
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
                          onClick={() => { navigator.clipboard.writeText((editingTranscript || expandedSession.transcript) ?? ""); setSuccess("Copié !"); }}
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

      {/* ─── TAGS SECTION ──────────────────────────── */}
      <div className="section">
        <div className="section-title clickable" onClick={() => setTagsOpen((v) => !v)}>
          <span className={`section-chevron ${tagsOpen ? "open" : ""}`}>&#9656;</span>
          Tags ({tags.length})
        </div>
        {tagsOpen && (
          <>
            <div className="tags-row">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className={`tag-chip ${filterTagIds.includes(tag.id) ? "selected" : ""}`}
                  onClick={() => {
                    setFilterTagIds((prev) =>
                      prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                    );
                    setSessionsOpen(true);
                  }}
                >
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

      {/* ─── VERSION FOOTER ──────────────────────── */}
      <div className="version-footer">v0.4.1</div>
    </div>
  );
}
