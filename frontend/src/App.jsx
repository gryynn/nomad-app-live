import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./lib/api.js";
import useSpeechRecognition from "./hooks/useSpeechRecognition.js";
import { useOfflineSync } from "./hooks/useOfflineSync.js";
import { useChunkUploader } from "./hooks/useChunkUploader.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";

// ─── Helpers ──────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(sec) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
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


// ─── Draft autosave (post-capture review) ────────────
const DRAFT_KEY = "nomad-postcapture-draft";

function saveDraft(data) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); }
  catch (e) { /* quota exceeded — ignore */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.savedAt && Date.now() - d.savedAt > 24 * 3600_000) { localStorage.removeItem(DRAFT_KEY); return null; }
    return d;
  } catch { localStorage.removeItem(DRAFT_KEY); return null; }
}

function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

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
  const [importProgress, setImportProgress] = useState(0);

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

  // Progressive chunk save refs
  const recordingIdRef = useRef(null);
  const flushSeqRef = useRef(0);
  const flushTimerRef = useRef(null);
  const recMimeTypeRef = useRef("audio/webm");
  const recNotesTextRef = useRef(""); // mirror for timer access

  // Recovery state
  const [recoveryData, setRecoveryData] = useState(null);

  // Engine selection
  const [selectedEngine, setSelectedEngine] = useState("auto");

  // Session title editing
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  // Tag popover (add tags from header)
  const [tagPopoverId, setTagPopoverId] = useState(null);
  const [tagPopoverSearch, setTagPopoverSearch] = useState("");

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

  // Whisper chunk-by-chunk transcription (LIVE mode)
  const whisperSegmentsRef = useRef([]); // [{seq, text}] ordered by seq
  const [whisperText, setWhisperText] = useState(""); // concatenated Whisper transcript

  // Post-stop review
  const [recTitle, setRecTitle] = useState("");
  const [pendingBlob, setPendingBlob] = useState(null);
  const [pendingDuration, setPendingDuration] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [saveStep, setSaveStep] = useState(""); // "chunks", "assemble", "upload", "tags", ""
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

  // Session filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterTagIds, setFilterTagIds] = useState([]);
  const [filterTime, setFilterTime] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterTagsExpanded, setFilterTagsExpanded] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showDateRange, setShowDateRange] = useState(false);
  const filterSearchTimer = useRef(null);

  // Editable transcript in session detail
  const [editingTranscript, setEditingTranscript] = useState("");
  const [transcriptDirty, setTranscriptDirty] = useState(false);
  const [transcriptViewMode, setTranscriptViewMode] = useState("plain"); // plain | timestamps | speakers
  const audioPlayerRef = useRef(null);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const playerProgressRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const waveformDataRef = useRef(null);
  const waveformAnimRef = useRef(null);

  // Offline sync
  const offline = useOfflineSync();
  const chunkUploader = useChunkUploader();
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [syncPanelItems, setSyncPanelItems] = useState([]);
  const [syncingItemId, setSyncingItemId] = useState(null);

  // ─── Keyboard shortcuts ──────────────────────────
  useKeyboardShortcuts({
    isRecording,
    isPaused,
    showReview,
    mode,
    expandedId,
    startRecording,
    stopRecording,
    pauseRecording,
    cancelRecording,
    insertMark,
  });

  // ─── Load data ────────────────────────────────────
  const loadSessions = useCallback(async (filters = {}) => {
    try {
      const params = { limit: 50 };
      const st = filters.status ?? filterStatus;
      const sq = filters.search ?? filterSearch;
      const stags = filters.tags ?? filterTagIds;
      const stime = filters.time ?? filterTime;
      const sDateFrom = filters.dateFrom ?? filterDateFrom;
      const sDateTo = filters.dateTo ?? filterDateTo;
      if (st && st !== "all") params.status = st;
      if (sq) params.search = sq;
      if (stags && stags.length > 0) params.tag = stags.join(",");
      // Date range takes priority over preset
      if (sDateFrom) {
        params.created_after = new Date(sDateFrom).toISOString();
      } else {
        const createdAfter = getTimeFilterDate(stime);
        if (createdAfter) params.created_after = createdAfter;
      }
      if (sDateTo) {
        params.created_before = new Date(sDateTo + "T23:59:59").toISOString();
      }
      const data = await api.getSessions(params);
      setSessions(data);
    } catch (e) {
      console.error("Failed to load sessions:", e);
      setError(`Sessions: ${e.message}`);
    }
  }, [filterStatus, filterSearch, filterTagIds, filterTime, filterDateFrom, filterDateTo]);

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
  }, [filterStatus, filterTagIds, filterTime, filterDateFrom, filterDateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading) return;
    if (filterSearchTimer.current) clearTimeout(filterSearchTimer.current);
    filterSearchTimer.current = setTimeout(() => loadSessions(), 400);
    return () => clearTimeout(filterSearchTimer.current);
  }, [filterSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close popovers on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (tagPopoverId && !e.target.closest(".tag-add-wrap")) {
        setTagPopoverId(null);
        setTagPopoverSearch("");
      }
      if (showDateRange && !e.target.closest(".date-range-popover") && !e.target.closest(".filter-chip")) {
        setShowDateRange(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [tagPopoverId, showDateRange]);

  // Auto-clear messages
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 4000); return () => clearTimeout(t); }
  }, [success]);

  // ─── Sync upload function (used by auto-sync and manual sync) ──
  const syncUploadFn = useCallback(async (item) => {
    const blob = item.blob;
    if (!blob) throw new Error("Pas de blob audio");
    const ext = blob.type?.includes("mp4") ? "mp4" : "webm";
    const file = new File([blob], item.filename || `sync_${Date.now()}.${ext}`, { type: blob.type || "audio/webm" });
    const result = await api.uploadAudio(file);
    const sessionId = result.session_id;
    // Apply metadata
    const updates = { input_mode: item.mode || "rec" };
    if (item.title) updates.title = item.title;
    if (item.duration) updates.duration_seconds = item.duration;
    if (item.liveTranscript) {
      updates.transcript = item.liveTranscript;
      updates.status = "transcribed";
    }
    await api.updateSession(sessionId, updates);
    if (item.notes) await api.addNote(sessionId, item.notes);
    if (item.engine) await api.transcribe(sessionId, item.engine);
  }, []);

  // Auto-sync on mount: register uploadFn so online event works
  useEffect(() => {
    offline.syncPending(syncUploadFn).then((result) => {
      if (result && result.synced > 0) {
        setSuccess(`${result.synced} enregistrement(s) synchronisé(s)`);
        loadSessions();
      }
      if (result && result.failed > 0) {
        setError(`Sync: ${result.failed} échec(s) — ${result.errors.join(", ")}`);
      }
    });
    // Draft restore: recover post-capture review state after refresh
    const draft = loadDraft();
    if (draft && draft.recordingId) {
      setRecMode(draft.recMode || null);
      setPendingDuration(draft.pendingDuration || 0);
      setRecTitle(draft.recTitle || "");
      setRecNotesText(draft.recNotesText || "");
      setLivePreviewText(draft.livePreviewText || "");
      setSelectedEngine(draft.selectedEngine || "auto");
      recordingIdRef.current = draft.recordingId;
      offline.assembleRecording(draft.recordingId).then(blob => {
        if (blob) { setPendingBlob(blob); setShowReview(true); }
        else { clearDraft(); } // chunks gone, draft stale
      });
    } else {
      // Recovery: detect orphaned recordings from crash (skip if draft restoring)
      offline.getOrphanedRecordings().then((orphaned) => {
        if (orphaned.length > 0) {
          const rec = orphaned[0]; // recover first one
          console.log("[RECOVERY] Found orphaned recording:", rec);
          setRecoveryData(rec);
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 8000); return () => clearTimeout(t); }
  }, [error]);

  // ─── Garde-fou navigation (beforeunload) ──────────
  useEffect(() => {
    const hasUnsaved = isRecording || showReview || transcriptDirty || sessionNotesDirty || pasteSaving || importUploading;
    if (!hasUnsaved) return;
    const handler = (e) => {
      if (showReview) {
        saveDraft({ recMode, pendingDuration, recTitle, recNotesText,
          livePreviewText, selectedEngine, recordingId: recordingIdRef.current });
      }
      e.preventDefault(); e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRecording, showReview, transcriptDirty, sessionNotesDirty, pasteSaving, importUploading,
      recMode, pendingDuration, recTitle, recNotesText, livePreviewText, selectedEngine]);

  // ─── Draft autosave (debounced 1s) ─────────────────
  useEffect(() => {
    if (!showReview) return;
    const t = setTimeout(() => {
      saveDraft({
        recMode, pendingDuration, recTitle, recNotesText,
        livePreviewText, selectedEngine,
        recordingId: recordingIdRef.current,
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [showReview, recTitle, recNotesText, livePreviewText, selectedEngine, recMode, pendingDuration]);

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

  // LIVE mode: transcribe each chunk via Whisper as it's uploaded
  useEffect(() => {
    chunkUploader.setOnUploaded((sessionId, seq) => {
      if (recMode !== "live" || !isRecording) return;
      console.log(`[LIVE-WHISPER] Chunk ${seq} uploaded, requesting transcription...`);
      api.transcribeChunk(sessionId, seq)
        .then((result) => {
          if (!result.text) return;
          console.log(`[LIVE-WHISPER] Chunk ${seq}: "${result.text.slice(0, 60)}..."`);
          // Insert segment in order
          const segments = whisperSegmentsRef.current;
          const existing = segments.findIndex((s) => s.seq === seq);
          if (existing >= 0) {
            segments[existing] = { seq, text: result.text };
          } else {
            segments.push({ seq, text: result.text });
            segments.sort((a, b) => a.seq - b.seq);
          }
          // Build concatenated transcript
          const full = segments.map((s) => s.text).join(" ");
          setWhisperText(full);
        })
        .catch((err) => {
          console.warn(`[LIVE-WHISPER] Chunk ${seq} transcription failed:`, err.message);
        });
    });
    return () => chunkUploader.setOnUploaded(null);
  }, [recMode, isRecording]);

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
    setImportProgress(0);
    setError(null);
    try {
      const result = await api.uploadAudio(importFile, (pct) => setImportProgress(pct));
      console.log("Upload result:", result);
      setSuccess(`Fichier "${importFile.name}" uploadé`);
      setImportFile(null);
      setMode(null);
      await loadSessions();
    } catch (e) {
      setError(`Erreur upload: ${e.message}`);
    } finally {
      setImportUploading(false);
      setImportProgress(0);
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

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelledRef.current) {
          cancelledRef.current = false;
          // Clean up chunk data on cancel
          if (recordingIdRef.current) {
            offline.clearRecordingChunks(recordingIdRef.current);
          }
          recordingIdRef.current = null;
          setRecMode(null);
          setMode(null);
          return;
        }
        const durationSec = Math.round((Date.now() - startTimeRef.current) / 1000);

        // Flush remaining chunks in RAM → IDB + upload
        if (chunksRef.current.length > 0) {
          const lastSnapshot = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
          chunksRef.current = [];
          const seq = flushSeqRef.current++;
          await offline.flushChunkSnapshot(recordingIdRef.current, seq, lastSnapshot);
          chunkUploader.uploadChunk(recordingIdRef.current, seq, lastSnapshot);
          console.log(`[FLUSH] final chunk #${seq}, ${(lastSnapshot.size / 1024).toFixed(0)} KB`);
        }

        // Assemble blob from IDB (always available as fallback)
        const assembledBlob = await offline.assembleRecording(recordingIdRef.current, mimeType || "audio/webm");
        const blob = assembledBlob || new Blob([], { type: mimeType || "audio/webm" });
        console.log(`[REC] stopped: ${blob.size} bytes, ${durationSec}s, mode=${captureMode}, flushSeq=${flushSeqRef.current}`);
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

      // Progressive chunk save: init
      const recId = "rec_" + Date.now();
      recordingIdRef.current = recId;
      flushSeqRef.current = 0;
      recNotesTextRef.current = "";
      recMimeTypeRef.current = mimeType || "audio/webm";
      chunkUploader.reset();
      whisperSegmentsRef.current = [];
      setWhisperText("");
      offline.startActiveRecording(recId, captureMode, mimeType || "audio/webm");

      // Flush timer: every 30s, snapshot chunks → IDB + upload
      flushTimerRef.current = setInterval(() => {
        if (chunksRef.current.length === 0) return;
        const snapshot = new Blob(chunksRef.current, { type: recMimeTypeRef.current });
        chunksRef.current = []; // free RAM
        const seq = flushSeqRef.current++;
        offline.flushChunkSnapshot(recId, seq, snapshot);
        chunkUploader.uploadChunk(recId, seq, snapshot);
        // Persist notes/transcript metadata
        offline.updateActiveRecordingMeta(recId, {
          notes: recNotesTextRef.current,
        });
        console.log(`[FLUSH] chunk #${seq}, ${(snapshot.size / 1024).toFixed(0)} KB`);
      }, 30_000);

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
        // Resume flush timer
        const recId = recordingIdRef.current;
        flushTimerRef.current = setInterval(() => {
          if (chunksRef.current.length === 0) return;
          const snapshot = new Blob(chunksRef.current, { type: recMimeTypeRef.current });
          chunksRef.current = [];
          const seq = flushSeqRef.current++;
          offline.flushChunkSnapshot(recId, seq, snapshot);
          chunkUploader.uploadChunk(recId, seq, snapshot);
          offline.updateActiveRecordingMeta(recId, { notes: recNotesTextRef.current });
          console.log(`[FLUSH] chunk #${seq}, ${(snapshot.size / 1024).toFixed(0)} KB`);
        }, 30_000);
        if (recMode === "live") speech.resume("fr-FR");
        setIsPaused(false);
      } else {
        // Pause: save elapsed time and stop the interval
        mediaRecorderRef.current.pause();
        clearInterval(timerRef.current);
        clearInterval(flushTimerRef.current);
        pausedTimeRef.current = Date.now() - startTimeRef.current;
        if (recMode === "live") speech.pause();
        setIsPaused(true);
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      clearInterval(timerRef.current);
      clearInterval(flushTimerRef.current);
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
      // Save live transcript: prefer Whisper (higher quality) over Speech API
      if (recMode === "live") {
        if (whisperText.trim()) {
          console.log("[LIVE] Using Whisper transcript:", whisperText.length, "chars");
          setLivePreviewText(whisperText.trim());
        } else if (liveEditText) {
          setLivePreviewText(liveEditText.trim());
        }
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
      clearInterval(flushTimerRef.current);
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
    const matches = text.match(/#([\p{L}\p{N}_.\-]+)/gu);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
  }

  function handleNotesChange(e) {
    const text = e.target.value;
    setRecNotesText(text);
    recNotesTextRef.current = text;
    const cursor = e.target.selectionStart;
    const beforeCursor = text.slice(0, cursor);
    const hashMatch = beforeCursor.match(/#([\p{L}\p{N}_.\-]*)$/u);
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
    setSaveStep("chunks");
    setError(null);

    const ext = pendingBlob.type.includes("mp4") ? "mp4" : "webm";
    const fileName = `${recMode}_${Date.now()}.${ext}`;
    const offlineId = `rec_${Date.now()}`;
    const recId = recordingIdRef.current;
    const totalChunks = flushSeqRef.current;

    // Save-first: always persist to IndexedDB before attempting upload
    const offlineItem = {
      id: offlineId,
      blob: pendingBlob,
      filename: fileName,
      mode: recMode,
      title: recTitle.trim(),
      notes: recNotesText.trim(),
      liveTranscript: recMode === "live" ? livePreviewText : null,
      duration: pendingDuration,
      engine: doTranscribe ? selectedEngine : null,
      savedAt: new Date().toISOString(),
    };

    try {
      await offline.saveRecordingOffline(offlineItem);
      console.log("[SAVE] Blob saved to IndexedDB as safety net");
    } catch (dbErr) {
      console.error("[SAVE] IndexedDB save failed:", dbErr);
    }

    try {
      let sessionId;
      let assemblyUsed = false;

      // Try server-side assembly if chunks were uploaded
      if (recId && totalChunks > 0) {
        try {
          // Wait for in-flight chunk uploads (usually just the last one)
          setSaveStep("chunks");
          await chunkUploader.waitForAllUploads();
          const failed = chunkUploader.getFailedChunks();

          if (failed.length === 0) {
            // All chunks uploaded — create session + queue background assembly
            setSaveStep("assemble");
            console.log(`[SAVE] All ${totalChunks} chunks uploaded, requesting background assembly`);
            const assembleResult = await api.assembleChunks({
              session_id: recId,
              chunk_count: totalChunks,
              mime_type: pendingBlob.type || "audio/webm",
              title: recTitle.trim(),
              notes: recNotesText.trim(),
              duration_seconds: pendingDuration,
              input_mode: recMode,
              live_transcript: recMode === "live" ? livePreviewText : "",
            });
            sessionId = assembleResult.session_id;
            assemblyUsed = true;
            console.log("[SAVE] Session created, assembly running in background");
          } else {
            console.warn(`[SAVE] ${failed.length} chunks failed upload, falling back to direct upload`);
          }
        } catch (assembleErr) {
          console.warn("[SAVE] Assembly request failed, falling back to direct upload:", assembleErr.message);
        }
      }

      // Fallback: direct upload of assembled blob (only if chunk path failed)
      if (!assemblyUsed) {
        setSaveStep("upload");
        const file = new File([pendingBlob], fileName, { type: pendingBlob.type });
        console.log("[SAVE] uploading file:", file.name, file.size, "bytes");
        const result = await api.uploadAudio(file);
        console.log("[SAVE] upload result:", result);
        sessionId = result.session_id;

        // Update session metadata
        const updates = { input_mode: recMode };
        if (recTitle.trim()) updates.title = recTitle.trim();
        if (pendingDuration) updates.duration_seconds = pendingDuration;
        if (recMode === "live" && livePreviewText) {
          updates.transcript = livePreviewText;
          updates.status = "transcribed";
        }
        await api.updateSession(sessionId, updates);

        // Save notes
        if (recNotesText.trim()) {
          await api.addNote(sessionId, recNotesText.trim());
        }
      }

      // Extract tags from notes, auto-create missing ones, and apply to session
      setSaveStep("tags");
      const hashtags = extractHashtags(recNotesText);
      if (hashtags.length > 0) {
        const tagIds = await ensureTagsExist(hashtags);
        if (tagIds.length > 0) {
          await api.setSessionTags(sessionId, tagIds);
        }
      }

      // Optionally trigger transcription
      if (doTranscribe && !assemblyUsed) {
        // Direct upload path — audio_url is ready, can transcribe now
        console.log("[SAVE] triggering transcription, engine:", selectedEngine);
        const trResult = await api.transcribe(sessionId, selectedEngine);
        console.log("[SAVE] transcribe result:", trResult);
        setSuccess(`Session sauvegardée, transcription lancée (${selectedEngine})...`);
        pollTranscription(sessionId);
      } else if (doTranscribe && assemblyUsed) {
        // Assembly path — audio not ready yet, user will transcribe from session list
        setSuccess("Session sauvegardée ! Assembly en cours... Transcription disponible dans quelques instants.");
      } else {
        setSuccess(assemblyUsed ? "Session sauvegardée ! Assembly audio en cours..." : "Session sauvegardée");
      }

      // Upload succeeded → clean up
      await offline.removePendingItem({ id: offlineId, _store: "recording" });
      if (recId) await offline.clearRecordingChunks(recId);
      clearDraft();

      // Reset
      setPendingBlob(null);
      setShowReview(false);
      setRecTitle("");
      setRecNotesText("");
      setLivePreviewText("");
      setLiveEditText("");
      setWhisperText("");
      whisperSegmentsRef.current = [];
      lastSpeechLenRef.current = 0;
      setLiveSessionId(null);
      setRecMode(null);
      setMode(null);
      setTagSuggestions([]);
      recordingIdRef.current = null;
      await loadSessions();
    } catch (e) {
      // Upload failed — blob is already safe in IndexedDB
      const sizeMB = (pendingBlob.size / 1024 / 1024).toFixed(1);
      const errDetail = e.message.includes("413") ? " (fichier trop gros — augmenter limite Supabase)"
        : e.message.includes("CORS") ? " (CORS — vérifier RLS policy Supabase)"
        : e.message.includes("Network") || e.message.includes("Connexion") ? " (réseau indisponible)"
        : "";
      setError(`Upload échoué${errDetail} — audio ${sizeMB} MB sauvegardé localement. Cliquez le badge orange pour réessayer.`);
      console.error("[SAVE] Upload failed:", e);
      clearDraft();
      // Clean up review screen
      setPendingBlob(null);
      setShowReview(false);
      setRecTitle("");
      setRecNotesText("");
      setLivePreviewText("");
      setLiveEditText("");
      setWhisperText("");
      whisperSegmentsRef.current = [];
      lastSpeechLenRef.current = 0;
      setLiveSessionId(null);
      setRecMode(null);
      setMode(null);
      setTagSuggestions([]);
      recordingIdRef.current = null;
    } finally {
      setReviewSaving(false);
      setSaveStep("");
    }
  }

  function handleDiscardReview() {
    // Clean up chunks from IDB
    if (recordingIdRef.current) {
      offline.clearRecordingChunks(recordingIdRef.current);
    }
    clearDraft();
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
    recordingIdRef.current = null;
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
    setTranscriptViewMode("plain");
    setPlayerPlaying(false);
    setPlayerTime(0);
    // Revoke old blob URL if any
    const oldAudio = audioPlayerRef.current;
    if (oldAudio?.src?.startsWith("blob:")) URL.revokeObjectURL(oldAudio.src);
    waveformDataRef.current = null;
    setSessionTagSuggestions([]);
    // Pre-set duration from session data so seek works immediately
    const sessionData = sessions.find((s) => s.id === id);
    setPlayerDuration(sessionData?.duration_seconds || 0);
    try {
      const detail = await api.getSession(id);
      setExpandedSession(detail);
      if (detail.duration_seconds) setPlayerDuration(detail.duration_seconds);
      setEditingTranscript(detail.transcript || "");
      const existingNotes = (detail.notes || []).map((n) => n.content).join("\n");
      setSessionNotesText(existingNotes);
    } catch (e) {
      setError(`Erreur chargement session: ${e.message}`);
    }
  }

  // ─── Transcribe ─────────────────────────────────
  function pollTranscription(sessionId) {
    const poll = async (attempts = 0) => {
      if (attempts > 60) {
        setError("Transcription timeout — vérifiez la session manuellement");
        return;
      }
      try {
        const detail = await api.getSession(sessionId);
        if (detail.status === "transcribed" && detail.transcript) {
          await loadSessions();
          setExpandedSession(detail);
          setEditingTranscript(detail.transcript);
          setTranscriptDirty(false);
          setSuccess(`Transcription terminée (${detail.transcript_words} mots)`);
          return;
        }
        if (detail.status === "error") {
          await loadSessions();
          setExpandedSession(detail);
          setError(`Transcription échouée: ${detail.error_message || "erreur inconnue"}`);
          return;
        }
      } catch (e) {
        console.warn("[POLL] fetch error:", e.message);
      }
      setTimeout(() => poll(attempts + 1), 3000);
    };
    setTimeout(() => poll(), 2000);
  }

  async function handleTranscribe(sessionId) {
    setError(null);
    try {
      const result = await api.transcribe(sessionId, selectedEngine);
      setSuccess(`Transcription lancée (${selectedEngine})...`);
      pollTranscription(sessionId);
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

  // ─── Tags toggle on session (bidirectional sync with notes) ──
  async function toggleSessionTag(sessionId, tagId, currentTagIds) {
    const has = currentTagIds.includes(tagId);
    const newIds = has ? currentTagIds.filter((t) => t !== tagId) : [...currentTagIds, tagId];
    const tag = tags.find((t) => t.id === tagId);
    // Sync notes text: add/remove #tagname
    if (tag) {
      const hashtagPattern = new RegExp(`#${tag.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'gi');
      if (has) {
        // Removing tag → remove #tagname from notes
        setSessionNotesText((prev) => prev.replace(hashtagPattern, '').replace(/\s{2,}/g, ' ').trim());
        setSessionNotesDirty(true);
      } else {
        // Adding tag → append #tagname to notes if not present
        if (!hashtagPattern.test(sessionNotesText)) {
          setSessionNotesText((prev) => (prev ? prev.trimEnd() + ' ' : '') + `#${tag.name}`);
          setSessionNotesDirty(true);
        }
      }
    }
    // Optimistic UI update — instant feedback
    const newTagObjects = newIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean);
    setSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, tags: newTagObjects } : s)
    );
    if (expandedSession && expandedSession.id === sessionId) {
      setExpandedSession((prev) => prev ? { ...prev, tags: newTagObjects } : prev);
    }

    // Background sync — no blocking await
    api.setSessionTags(sessionId, newIds).then(() => {
      loadTags(); // refresh session_count
    }).catch((e) => {
      setError(`Erreur tags: ${e.message}`);
      loadSessions(); // rollback on error
    });
  }

  // ─── Session notes (in expanded detail) ─────────
  const pendingTagSyncRef = useRef(null);
  function handleSessionNotesChange(e) {
    const text = e.target.value;
    setSessionNotesText(text);
    setSessionNotesDirty(true);
    // Autocomplete suggestions
    const cursor = e.target.selectionStart;
    const beforeCursor = text.slice(0, cursor);
    const hashMatch = beforeCursor.match(/#([\p{L}\p{N}_.\-]*)$/u);
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
    // Sync hashtags → tag chips (debounced, bidirectional: add AND remove)
    if (pendingTagSyncRef.current) clearTimeout(pendingTagSyncRef.current);
    pendingTagSyncRef.current = setTimeout(async () => {
      if (!expandedId || !expandedSession) return;
      const noteHashtags = extractHashtags(text);
      const matchingTagIds = tags.filter((t) => noteHashtags.includes(t.name.toLowerCase())).map((t) => t.id);
      const currentTagIds = (expandedSession.tags || []).map((t) => t.id);
      const sortedCurrent = [...currentTagIds].sort().join(",");
      const sortedNew = [...matchingTagIds].sort().join(",");
      if (sortedCurrent !== sortedNew) {
        // Optimistic UI
        const newTagObjects = matchingTagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean);
        setExpandedSession((prev) => prev ? { ...prev, tags: newTagObjects } : prev);
        setSessions((prev) =>
          prev.map((s) => s.id === expandedId ? { ...s, tags: newTagObjects } : s)
        );
        api.setSessionTags(expandedId, matchingTagIds).then(() => loadTags()).catch((e) => {
          console.error("[TAG-SYNC] failed:", e);
        });
      }
    }, 1500);
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
      await api.replaceNotes(sessionId, sessionNotesText.trim());
      // Sync tags from notes hashtags (bidirectional: add new, remove absent)
      const hashtags = extractHashtags(sessionNotesText);
      const newTagIds = hashtags.length > 0 ? await ensureTagsExist(hashtags) : [];
      const currentTagIds = (expandedSession.tags || []).map((t) => t.id);
      const sortedCurrent = [...currentTagIds].sort().join(",");
      const sortedNew = [...newTagIds].sort().join(",");
      if (sortedCurrent !== sortedNew) {
        await api.setSessionTags(sessionId, newTagIds);
      }
      // Optimistic UI update
      const newTagObjects = newTagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean);
      setSessions((prev) =>
        prev.map((s) => s.id === sessionId ? { ...s, tags: newTagObjects } : s)
      );
      setSessionNotesDirty(false);
      const detail = await api.getSession(sessionId);
      setExpandedSession(detail);
      const updatedNotes = (detail.notes || []).map((n) => n.content).join("\n");
      setSessionNotesText(updatedNotes);
      loadTags();
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

  // ─── Audio player helpers ─────────────────────────
  function formatPlayerTime(s) {
    if (!s || !isFinite(s) || isNaN(s)) return "–:––";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function handlePlayerDuration(e) {
    const d = e.target.duration;
    if (d && isFinite(d) && d > 0) setPlayerDuration(d);
  }

  // Fallback: if browser can't get duration from metadata, try after canplay or use session duration
  function ensurePlayerDuration(sessionDurationSec) {
    const a = audioPlayerRef.current;
    if (playerDuration && isFinite(playerDuration) && playerDuration > 0) return;
    if (a && a.duration && isFinite(a.duration) && a.duration > 0) {
      setPlayerDuration(a.duration);
      return;
    }
    // Use session's stored duration as last resort
    if (sessionDurationSec && sessionDurationSec > 0) {
      setPlayerDuration(sessionDurationSec);
    }
  }

  function togglePlayPause() {
    const a = audioPlayerRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlayerPlaying(true); }
    else { a.pause(); setPlayerPlaying(false); }
  }

  function seekFromEvent(e) {
    const a = audioPlayerRef.current;
    const track = playerProgressRef.current;
    if (!a || !track) return;
    // Use best available duration: audio element > state > fallback
    const dur = (a.duration && isFinite(a.duration) && a.duration > 0)
      ? a.duration
      : (playerDuration && isFinite(playerDuration) && playerDuration > 0)
        ? playerDuration
        : 0;
    if (!dur) return;
    const rect = track.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    if (clientX == null) return;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = pct * dur;
    setPlayerTime(a.currentTime);
    if (dur !== playerDuration) setPlayerDuration(dur);
  }

  function handlePlayerSeek(e) {
    seekFromEvent(e);
  }

  function handleThumbDrag(e) {
    e.preventDefault();
    const onMove = (ev) => seekFromEvent(ev);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  }

  function skipPlayer(delta) {
    const a = audioPlayerRef.current;
    if (!a) return;
    const dur = (a.duration && isFinite(a.duration)) ? a.duration : playerDuration;
    const maxTime = (dur && isFinite(dur)) ? dur : a.currentTime + Math.abs(delta) + 60;
    a.currentTime = Math.max(0, Math.min(maxTime, a.currentTime + delta));
    setPlayerTime(a.currentTime);
  }

  // Decode audio, extract waveform peaks, create Blob URL for instant seek
  // For files > 30MB, skip blob download (too heavy for 3h+ meetings)
  const BLOB_SIZE_LIMIT = 30 * 1024 * 1024; // 30 MB

  async function loadWaveform(url) {
    try {
      // HEAD request first to check file size
      const head = await fetch(url, { method: "HEAD" });
      const size = parseInt(head.headers.get("content-length") || "0", 10);

      if (size > BLOB_SIZE_LIMIT) {
        console.log(`[WAVEFORM] File too large (${(size / 1024 / 1024).toFixed(1)} MB), skipping blob download`);
        waveformDataRef.current = null;
        return;
      }

      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();

      // Create Blob URL from downloaded data — enables instant seeking
      const contentType = resp.headers.get("content-type") || "audio/mpeg";
      const blob = new Blob([arrayBuf], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      const a = audioPlayerRef.current;
      if (a) {
        const wasPlaying = !a.paused;
        const curTime = a.currentTime;
        a.src = blobUrl;
        a.currentTime = curTime;
        if (wasPlaying) a.play();
      }

      // Decode for waveform visualization
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuf = await actx.decodeAudioData(arrayBuf.slice(0)); // slice to avoid detached buffer
      actx.close();
      if (audioBuf.duration && isFinite(audioBuf.duration)) {
        setPlayerDuration(audioBuf.duration);
      }
      const raw = audioBuf.getChannelData(0);
      const samples = 200;
      const blockSize = Math.floor(raw.length / samples);
      const peaks = [];
      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(raw[i * blockSize + j]);
        }
        peaks.push(sum / blockSize);
      }
      const maxPeak = Math.max(...peaks) || 1;
      waveformDataRef.current = peaks.map((p) => p / maxPeak);
      drawWaveform();
    } catch (e) {
      console.warn("[WAVEFORM] decode failed:", e);
      waveformDataRef.current = null;
    }
  }

  function drawWaveform() {
    const canvas = waveformCanvasRef.current;
    const peaks = waveformDataRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cs = getComputedStyle(canvas);
    const accentColor = cs.getPropertyValue("--accent").trim() || "#fff";
    const softColor = cs.getPropertyValue("--text-soft").trim() || "#444";
    const pct = (playerDuration && isFinite(playerDuration)) ? playerTime / playerDuration : 0;
    const barW = Math.max(1.5, (w / peaks.length) - 1);

    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * w;
      const barH = Math.max(1, peaks[i] * h * 0.9);
      const played = (i / peaks.length) <= pct;
      ctx.fillStyle = played ? accentColor : softColor;
      ctx.globalAlpha = played ? 0.9 : 0.35;
      ctx.fillRect(x, h - barH, barW, barH);
    }
    ctx.globalAlpha = 1;
  }

  // Redraw waveform on every time update
  useEffect(() => {
    if (waveformDataRef.current) drawWaveform();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Recovery handlers ──────────────────────────────
  async function handleRecoverRecording() {
    if (!recoveryData) return;
    try {
      const blob = await offline.assembleRecording(recoveryData.id, recoveryData.mimeType || "audio/webm");
      if (!blob || blob.size === 0) {
        setError("Aucune donnée récupérable");
        await offline.clearRecordingChunks(recoveryData.id);
        setRecoveryData(null);
        return;
      }
      recordingIdRef.current = recoveryData.id;
      // Force flushSeq to 0 → skip server-side assembly (chunks not in Supabase Storage)
      flushSeqRef.current = 0;
      setPendingBlob(blob);
      setPendingDuration(0); // unknown
      setRecMode(recoveryData.mode || "rec");
      setShowReview(true);
      setRecoveryData(null);
      setSuccess(`${recoveryData.chunkCount || 0} chunk(s) récupéré(s) — ajoutez titre/notes puis sauvegardez`);
    } catch (e) {
      setError(`Erreur récupération: ${e.message}`);
    }
  }

  async function handleDiscardRecovery() {
    if (!recoveryData) return;
    await offline.clearRecordingChunks(recoveryData.id);
    setRecoveryData(null);
    setSuccess("Enregistrement orphelin supprimé");
  }

  // ─── Filter helpers ────────────────────────────────
  const activeFilterCount = [
    filterStatus !== "all",
    filterSearch !== "",
    filterTime !== "all" || filterDateFrom || filterDateTo,
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
          {!offline.isOnline && <span className="offline-badge">hors-ligne</span>}
          {offline.pendingCount > 0 && <span className="pending-badge" title={`${offline.pendingCount} élément(s) en attente de sync`} onClick={async () => { const items = await offline.getAllPending(); setSyncPanelItems(items); setSyncPanelOpen(true); }}>{offline.pendingCount}</span>}
          <div className={`status-dot ${!offline.isOnline ? "offline" : loading ? "offline" : ""}`} title={!offline.isOnline ? "Hors-ligne" : loading ? "Chargement..." : "Connecté"} />
        </div>
      </div>

      {/* Messages */}
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      {/* ─── RECOVERY BANNER ─────────────────────── */}
      {recoveryData && !isRecording && !showReview && (
        <div className="recovery-banner">
          <div className="recovery-banner-info">
            <div className="title">Enregistrement interrompu détecté</div>
            <div className="meta">
              {recoveryData.mode === "live" ? "LIVE" : "REC"}
              {recoveryData.chunkCount > 0 && ` · ${recoveryData.chunkCount} chunk(s)`}
              {recoveryData.startedAt && ` · ${new Date(recoveryData.startedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
            </div>
          </div>
          <div className="recovery-banner-actions">
            <button className="btn btn-sm btn-primary" style={{ width: "auto", padding: "6px 12px" }} onClick={handleRecoverRecording}>
              Récupérer
            </button>
            <button className="btn btn-sm btn-ghost" style={{ padding: "6px 10px" }} onClick={handleDiscardRecovery}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ─── SYNC PANEL ──────────────────────────── */}
      {syncPanelOpen && (
        <div className="sync-panel">
          <div className="sync-panel-header">
            <span style={{ fontWeight: 700, fontSize: 14 }}>Éléments en attente</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setSyncPanelOpen(false)} style={{ padding: "4px 10px" }}>✕</button>
          </div>
          {syncPanelItems.length === 0 ? (
            <div className="empty" style={{ padding: 16 }}>Aucun élément en attente</div>
          ) : (
            <div className="sync-panel-list">
              {syncPanelItems.map((item) => (
                <div key={item.id} className="sync-item">
                  <div className="sync-item-info">
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title || item.filename || item.id}</div>
                    <div style={{ fontSize: 11, color: "var(--text-soft)" }}>
                      {item.blob ? `${(item.blob.size / 1024 / 1024).toFixed(1)} MB` : "—"}
                      {item.savedAt && ` · ${new Date(item.savedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                      {item.mode && ` · ${item.mode}`}
                    </div>
                  </div>
                  <div className="sync-item-actions">
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={syncingItemId === item.id}
                      style={{ padding: "4px 10px", width: "auto" }}
                      onClick={async () => {
                        setSyncingItemId(item.id);
                        try {
                          await syncUploadFn(item);
                          await offline.removePendingItem(item);
                          setSyncPanelItems((prev) => prev.filter((i) => i.id !== item.id));
                          setSuccess("Synchronisé !");
                          loadSessions();
                        } catch (err) {
                          setError(`Sync échoué: ${err.message}`);
                        } finally {
                          setSyncingItemId(null);
                        }
                      }}
                    >
                      {syncingItemId === item.id ? "..." : "Sync"}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ padding: "4px 10px" }}
                      onClick={() => {
                        if (!item.blob) return;
                        const url = URL.createObjectURL(item.blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = item.filename || `recording_${item.id}.webm`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ padding: "4px 10px" }}
                      onClick={async () => {
                        await offline.removePendingItem(item);
                        setSyncPanelItems((prev) => prev.filter((i) => i.id !== item.id));
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {syncPanelItems.length > 1 && (
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 8, width: "100%" }}
              disabled={syncingItemId !== null}
              onClick={async () => {
                setSyncingItemId("all");
                const result = await offline.syncPending(syncUploadFn);
                if (result.synced > 0) {
                  setSuccess(`${result.synced} élément(s) synchronisé(s)`);
                  loadSessions();
                }
                if (result.failed > 0) {
                  setError(`${result.failed} échec(s): ${result.errors.join(", ")}`);
                }
                const items = await offline.getAllPending();
                setSyncPanelItems(items);
                setSyncingItemId(null);
                if (items.length === 0) setSyncPanelOpen(false);
              }}
            >
              {syncingItemId === "all" ? "Synchronisation..." : "Tout synchroniser"}
            </button>
          )}
        </div>
      )}

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
                  <button
                    className={`engine-chip ${selectedEngine === "auto" ? "selected" : ""}`}
                    onClick={() => setSelectedEngine("auto")}
                    title="Auto: Groq pour < 25 MB, Deepgram pour les longs fichiers"
                  >Auto</button>
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
            {!isRecording && mode === null && !showReview && (<>
              <div className="mode-bar">
                <button className="mode-btn rec" onClick={() => startRecording("rec")} title="Raccourci: R">
                  🎙️ REC
                </button>
                <button className="mode-btn" onClick={() => startRecording("live")} title="Raccourci: L">
                  📡 LIVE
                </button>
                <button className="mode-btn" onClick={() => setMode("import")}>
                  📁 Import
                </button>
                <button className="mode-btn" onClick={() => setMode("paste")}>
                  📋 Paste
                </button>
              </div>
              <div className="shortcut-hint">
                <kbd>R</kbd> REC {"\u00A0"} <kbd>L</kbd> LIVE {"\u00A0"} En cours: <kbd>Space</kbd> Stop {"\u00A0"} <kbd>P</kbd> Pause {"\u00A0"} <kbd>Esc</kbd> Annuler
              </div>
            </>)}

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

                {/* Chunk upload indicator */}
                {flushSeqRef.current > 0 && (
                  <div style={{ textAlign: "center", marginBottom: 4 }}>
                    <span className={`chunk-indicator ${
                      chunkUploader.getFailedChunks().length > 0 ? "failed" :
                      chunkUploader.progress.isUploading ? "uploading" : "synced"
                    }`}>
                      {chunkUploader.getFailedChunks().length > 0 ? "!" :
                       chunkUploader.progress.isUploading ? "↑" : "✓"}
                      {" "}{chunkUploader.progress.uploaded}/{chunkUploader.progress.total}
                    </span>
                  </div>
                )}

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
                        {whisperText && (
                          <div style={{ fontSize: 11, color: "var(--accent)", padding: "4px 8px", opacity: 0.8 }}>
                            Whisper: {whisperSegmentsRef.current.length} chunks transcrits · {whisperText.split(/\s+/).filter(Boolean).length} mots
                          </div>
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
                  {tags.length > 0 && (
                    <div className="rec-notes-bar">
                      <div className="tags-shortcuts">
                        {tags.map((tag) => (
                          <span key={tag.id} className="tag-shortcut" onClick={() => insertTag(tag.name)}>
                            {tag.emoji} {tag.name}
                          </span>
                        ))}
                      </div>
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

                {/* Chunk upload progress (visible during review) */}
                {chunkUploader.progress.total > 0 && !reviewSaving && (
                  <div className="chunk-progress-bar">
                    <div className="chunk-progress-track">
                      <div
                        className="chunk-progress-fill"
                        style={{ width: `${Math.round((chunkUploader.progress.uploaded / chunkUploader.progress.total) * 100)}%` }}
                      />
                    </div>
                    <span className="chunk-progress-label">
                      {chunkUploader.progress.uploaded === chunkUploader.progress.total
                        ? "✓ Chunks synchronisés"
                        : `Sync ${chunkUploader.progress.uploaded}/${chunkUploader.progress.total} chunks...`}
                    </span>
                  </div>
                )}

                {/* Save step progress */}
                {reviewSaving && saveStep && (
                  <div className="save-step-indicator">
                    <div className="save-step-spinner" />
                    <span>
                      {saveStep === "chunks" && `Synchronisation chunks ${chunkUploader.progress.uploaded}/${chunkUploader.progress.total}...`}
                      {saveStep === "assemble" && "Assemblage audio sur le serveur..."}
                      {saveStep === "upload" && "Upload du fichier audio..."}
                      {saveStep === "tags" && "Finalisation..."}
                    </span>
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
                      disabled={reviewSaving}
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
                      style={{ flex: 1, position: "relative", overflow: "hidden" }}
                    >
                      {importUploading && (
                        <span
                          style={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: importProgress < 0 ? "100%" : `${importProgress}%`,
                            background: importProgress < 0 ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.2)",
                            transition: "width 0.3s",
                            animation: importProgress < 0 ? "pulse 1.5s infinite" : "none",
                          }}
                        />
                      )}
                      <span style={{ position: "relative" }}>
                        {importUploading
                          ? (importProgress < 0 ? "Upload en cours..." : `Upload ${importProgress}%`)
                          : "Uploader"}
                      </span>
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
              <span onClick={(e) => { e.stopPropagation(); setFilterStatus("all"); setFilterSearch(""); setFilterTagIds([]); setFilterTime("all"); setFilterDateFrom(""); setFilterDateTo(""); }} style={{ cursor: "pointer", marginLeft: 2 }}>✕</span>
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
                {/* Time presets + date range button */}
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
                      className={`filter-chip ${filterTime === t.val && !filterDateFrom && !filterDateTo ? "active" : ""}`}
                      onClick={() => { setFilterTime(t.val); setFilterDateFrom(""); setFilterDateTo(""); setShowDateRange(false); }}
                    >
                      {t.label}
                    </button>
                  ))}
                  <div style={{ position: "relative" }}>
                    <button
                      className={`filter-chip ${filterDateFrom || filterDateTo ? "active" : ""}`}
                      onClick={() => setShowDateRange((v) => !v)}
                    >
                      {filterDateFrom || filterDateTo
                        ? `${filterDateFrom || "..."} → ${filterDateTo || "..."}`
                        : "Dates"}
                    </button>
                    {showDateRange && (
                      <div className="date-range-popover">
                        <label style={{ fontSize: 10, color: "var(--text-soft)", margin: 0 }}>Depuis</label>
                        <input
                          type="date"
                          className="filter-date"
                          value={filterDateFrom}
                          onChange={(e) => { setFilterDateFrom(e.target.value); if (e.target.value) setFilterTime("all"); }}
                        />
                        <label style={{ fontSize: 10, color: "var(--text-soft)", margin: 0 }}>Jusqu'à</label>
                        <input
                          type="date"
                          className="filter-date"
                          value={filterDateTo}
                          onChange={(e) => { setFilterDateTo(e.target.value); if (e.target.value) setFilterTime("all"); }}
                        />
                        {(filterDateFrom || filterDateTo) && (
                          <button
                            className="filter-chip"
                            style={{ fontSize: 10, width: "100%" }}
                            onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setShowDateRange(false); }}
                          >
                            Effacer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Status */}
                <div className="filter-chips">
                  {["all", "pending", "assembling", "uploaded", "transcribed", "error"].map((st) => (
                    <button
                      key={st}
                      className={`filter-chip ${filterStatus === st ? "active" : ""}`}
                      onClick={() => setFilterStatus(st)}
                    >
                      {st === "all" ? "Tout" : st}
                    </button>
                  ))}
                </div>
                {/* Tags — single row with "+" expander */}
                {tags.length > 0 && (() => {
                  const VISIBLE_COUNT = 4;
                  // Always show active filter tags + first N
                  const visibleTags = filterTagsExpanded
                    ? tags
                    : tags.filter((tag, i) => i < VISIBLE_COUNT || filterTagIds.includes(tag.id));
                  const hiddenCount = tags.length - visibleTags.length;
                  const hasMore = hiddenCount > 0;
                  return (
                    <div className="filter-chips">
                      {visibleTags.map((tag) => (
                        <button
                          key={tag.id}
                          className={`filter-chip ${filterTagIds.includes(tag.id) ? "active" : ""}`}
                          onClick={() => {
                            setFilterTagIds((prev) =>
                              prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                            );
                          }}
                        >
                          {tag.emoji} {tag.name}
                          {tag.session_count > 0 && <span style={{ opacity: 0.5 }}> {tag.session_count}</span>}
                        </button>
                      ))}
                      {hasMore && !filterTagsExpanded && (
                        <button
                          className="filter-chip"
                          onClick={() => setFilterTagsExpanded(true)}
                          style={{ fontStyle: "italic" }}
                        >
                          +{hiddenCount}
                        </button>
                      )}
                      {filterTagsExpanded && tags.length > VISIBLE_COUNT && (
                        <button
                          className="filter-chip"
                          onClick={() => setFilterTagsExpanded(false)}
                          style={{ fontStyle: "italic" }}
                        >
                          −
                        </button>
                      )}
                    </div>
                  );
                })()}
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
                  {s.duration_seconds > 0 && (
                    <span className="session-duration">{formatDuration(s.duration_seconds)}</span>
                  )}
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
                      <span className={`status ${s.status}`}>
                        {(s.status === "processing" || s.status === "assembling") && <span className="status-spinner" />}
                        {s.status === "transcribed" ? "transcrit" : s.status === "uploaded" ? "uploadé" : s.status === "processing" ? "en cours..." : s.status === "assembling" ? "assembly..." : s.status === "error" ? "erreur" : s.status}
                      </span>
                      {s.engine_used ? ` · ${s.engine_used}` : ""}
                      {s.duration_seconds ? ` · ${formatDuration(s.duration_seconds)}` : ""}
                      {s.transcript_words ? ` · ${s.transcript_words} mots` : ""}
                      {" · "}{formatDate(s.created_at)}
                    </div>
                  </div>
                  {/* Tags — right side: selected only + add button */}
                  <div className="header-tags" onClick={(e) => e.stopPropagation()}>
                    {(s.tags || []).map((tag) => (
                      <span
                        key={tag.id}
                        className="tag-chip selected"
                        onClick={() => toggleSessionTag(s.id, tag.id, (s.tags || []).map((t) => t.id))}
                        title="Retirer"
                      >
                        <span className="tag-label">{tag.emoji} {tag.name}</span>
                        <span className="tag-remove">✕</span>
                      </span>
                    ))}
                    <div className="tag-add-wrap">
                      <span
                        className="tag-chip tag-create"
                        onClick={() => { setTagPopoverId(tagPopoverId === s.id ? null : s.id); setTagPopoverSearch(""); }}
                      >+</span>
                      {tagPopoverId === s.id && (() => {
                        const available = tags.filter((t) => !(s.tags || []).find((st) => st.id === t.id));
                        const filtered = tagPopoverSearch
                          ? available.filter((t) => t.name.toLowerCase().includes(tagPopoverSearch.toLowerCase()))
                          : available;
                        const showCreate = tagPopoverSearch && !tags.find((t) => t.name.toLowerCase() === tagPopoverSearch.toLowerCase());
                        return (
                          <div className="tag-popover">
                            <input
                              className="tag-popover-search"
                              type="text"
                              placeholder="Chercher / créer..."
                              value={tagPopoverSearch}
                              onChange={(e) => setTagPopoverSearch(e.target.value)}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            {filtered.map((tag) => (
                              <div
                                key={tag.id}
                                className="tag-popover-item"
                                onClick={() => {
                                  toggleSessionTag(s.id, tag.id, (s.tags || []).map((t) => t.id));
                                  setTagPopoverId(null);
                                  setTagPopoverSearch("");
                                }}
                              >
                                {tag.emoji} {tag.name}
                              </div>
                            ))}
                            {showCreate && (
                              <div
                                className="tag-popover-item tag-popover-create"
                                onClick={async () => {
                                  const name = tagPopoverSearch.trim();
                                  if (!name) return;
                                  try {
                                    const newTag = await api.createTag({ name, emoji: "🏷️" });
                                    await loadTags();
                                    const currentIds = (s.tags || []).map((t) => t.id);
                                    const newTagObjects = [...(s.tags || []), newTag];
                                    setSessions((prev) => prev.map((ss) => ss.id === s.id ? { ...ss, tags: newTagObjects } : ss));
                                    api.setSessionTags(s.id, [...currentIds, newTag.id]);
                                  } catch (e) {
                                    setError(`Erreur: ${e.message}`);
                                  }
                                  setTagPopoverId(null);
                                  setTagPopoverSearch("");
                                }}
                              >
                                + Créer "{tagPopoverSearch.trim()}"
                              </div>
                            )}
                            {filtered.length === 0 && !showCreate && (
                              <div className="tag-popover-item" style={{ color: "var(--text-soft)", fontStyle: "italic" }}>
                                Aucun tag
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <span className={`chevron ${expandedId === s.id ? "open" : ""}`}>&#9656;</span>
                </div>

                {/* Expanded detail */}
                {expandedId === s.id && expandedSession && (
                  <div className="session-detail">
                    {/* Audio Player */}
                    {s.audio_url && (
                      <div className="custom-player">
                        <audio
                          ref={audioPlayerRef}
                          src={s.audio_url}
                          preload="auto"
                          onLoadedMetadata={(e) => { handlePlayerDuration(e); if (!waveformDataRef.current) loadWaveform(s.audio_url); }}
                          onDurationChange={handlePlayerDuration}
                          onCanPlay={(e) => { handlePlayerDuration(e); ensurePlayerDuration(s.duration_seconds); }}
                          onTimeUpdate={(e) => {
                            setPlayerTime(e.target.currentTime);
                            if (!playerDuration || !isFinite(playerDuration)) {
                              handlePlayerDuration(e);
                              ensurePlayerDuration(s.duration_seconds);
                            }
                          }}
                          onEnded={() => setPlayerPlaying(false)}
                          onPlay={() => setPlayerPlaying(true)}
                          onPause={() => setPlayerPlaying(false)}
                        />
                        <button className="player-btn" onClick={togglePlayPause} title={playerPlaying ? "Pause" : "Play"}>
                          {playerPlaying ? "❚❚" : "▶"}
                        </button>
                        <button className="player-skip-btn" onClick={() => skipPlayer(-10)} title="-10s">-10</button>
                        <div className="player-track" onClick={handlePlayerSeek} ref={playerProgressRef}>
                          <canvas ref={waveformCanvasRef} className="waveform-canvas" />
                          <div
                            className="player-progress"
                            style={{ width: playerDuration && isFinite(playerDuration) ? `${(playerTime / playerDuration) * 100}%` : "0%" }}
                          />
                          <div
                            className="player-thumb"
                            style={{ left: playerDuration && isFinite(playerDuration) ? `${(playerTime / playerDuration) * 100}%` : "0%" }}
                            onMouseDown={handleThumbDrag}
                            onTouchStart={handleThumbDrag}
                          />
                        </div>
                        <button className="player-skip-btn" onClick={() => skipPlayer(30)} title="+30s">+30</button>
                        <span className="player-time">{formatPlayerTime(playerTime)} / {formatPlayerTime(playerDuration)}</span>
                      </div>
                    )}

                    {/* Transcript */}
                    {expandedSession.transcript ? (
                      <div>
                        <div className="transcript-header">
                          <label>Transcription ({(editingTranscript || expandedSession.transcript).trim().split(/\s+/).filter(Boolean).length} mots)</label>
                          <div className="transcript-view-toggle">
                            <button
                              className={`view-mode-btn ${transcriptViewMode === "plain" ? "active" : ""}`}
                              onClick={() => setTranscriptViewMode("plain")}
                              title="Texte brut éditable"
                            >
                              Texte
                            </button>
                            <button
                              className={`view-mode-btn ${transcriptViewMode === "timestamps" ? "active" : ""}`}
                              onClick={() => setTranscriptViewMode("timestamps")}
                              title="Avec horodatage"
                            >
                              Horodatage
                            </button>
                            <button
                              className={`view-mode-btn ${transcriptViewMode === "speakers" ? "active" : ""}`}
                              onClick={() => setTranscriptViewMode("speakers")}
                              title="Par locuteur"
                            >
                              Locuteurs
                            </button>
                          </div>
                        </div>

                        {transcriptViewMode === "plain" && (
                          <>
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
                          </>
                        )}

                        {transcriptViewMode === "timestamps" && (
                          <div className="transcript-segments">
                            {expandedSession.transcript_segments?.length > 0 ? (
                              expandedSession.transcript_segments.map((seg, i) => (
                                <div
                                  key={i}
                                  className="segment-row"
                                  onClick={() => {
                                    if (audioPlayerRef.current) {
                                      audioPlayerRef.current.currentTime = seg.start;
                                      audioPlayerRef.current.play();
                                    }
                                  }}
                                >
                                  <span className="segment-time">
                                    [{Math.floor(seg.start / 60).toString().padStart(2, "0")}:{Math.floor(seg.start % 60).toString().padStart(2, "0")}]
                                  </span>
                                  <span className="segment-text">{seg.text}</span>
                                </div>
                              ))
                            ) : (
                              <div className="empty">Pas de données horodatées. Re-transcrivez pour obtenir les timestamps.</div>
                            )}
                          </div>
                        )}

                        {transcriptViewMode === "speakers" && (
                          <div className="transcript-segments">
                            {expandedSession.transcript_segments?.length > 0 ? (
                              (() => {
                                const segments = expandedSession.transcript_segments;
                                const hasSpeakers = segments.some((seg) => seg.speaker != null);
                                if (!hasSpeakers) {
                                  return <div className="empty">Pas de données de locuteurs. Utilisez un moteur avec diarisation (WhisperX).</div>;
                                }
                                let lastSpeaker = null;
                                return segments.map((seg, i) => {
                                  const showSpeaker = seg.speaker !== lastSpeaker;
                                  lastSpeaker = seg.speaker;
                                  return (
                                    <div key={i}>
                                      {showSpeaker && (
                                        <div className="speaker-label">Locuteur {(seg.speaker ?? 0) + 1}</div>
                                      )}
                                      <div
                                        className="segment-row"
                                        onClick={() => {
                                          if (audioPlayerRef.current) {
                                            audioPlayerRef.current.currentTime = seg.start;
                                            audioPlayerRef.current.play();
                                          }
                                        }}
                                      >
                                        <span className="segment-time">
                                          [{Math.floor(seg.start / 60).toString().padStart(2, "0")}:{Math.floor(seg.start % 60).toString().padStart(2, "0")}]
                                        </span>
                                        <span className="segment-text">{seg.text}</span>
                                      </div>
                                    </div>
                                  );
                                });
                              })()
                            ) : (
                              <div className="empty">Pas de données de segments. Re-transcrivez pour obtenir les locuteurs.</div>
                            )}
                          </div>
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

      {/* ─── VERSION FOOTER ──────────────────────── */}
      <div className="version-footer">v{__APP_VERSION__}</div>
    </div>
  );
}
