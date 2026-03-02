import { useState, useRef } from "react";

export default function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const stoppingRef = useRef(false);
  const accumulatedRef = useRef("");
  const transcriptRef = useRef(""); // mirrors transcript state for safe pause capture
  const langRef = useRef("fr-FR");

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function makeRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langRef.current;

    let sessionFinal = "";

    rec.onresult = (e) => {
      sessionFinal = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          sessionFinal += e.results[i][0].transcript + " ";
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      const full = accumulatedRef.current + sessionFinal;
      transcriptRef.current = full;
      console.log("[Speech] onresult:", { final: sessionFinal.length, interim: interim.length, total: full.length });
      setTranscript(full);
      setInterimText(interim);
    };

    rec.onerror = (e) => {
      console.warn("[Speech] onerror:", e.error);
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(e.error);
      }
    };

    rec.onend = () => {
      console.log("[Speech] onend, stopping:", stoppingRef.current, "accumulated:", accumulatedRef.current.length);
      accumulatedRef.current += sessionFinal;
      sessionFinal = "";
      if (!stoppingRef.current) {
        try {
          const next = makeRecognition();
          next.start();
          recognitionRef.current = next;
          console.log("[Speech] auto-restarted");
        } catch (err) {
          console.warn("[Speech] auto-restart failed:", err);
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    return rec;
  }

  function start(lang = "fr-FR") {
    if (!isSupported) {
      console.warn("[Speech] API not supported in this browser");
      setError("Web Speech API non supportée — utilisez Chrome");
      return;
    }
    stoppingRef.current = false;
    langRef.current = lang;
    accumulatedRef.current = "";
    transcriptRef.current = "";
    setTranscript("");
    setInterimText("");
    setError(null);
    try {
      const rec = makeRecognition();
      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
      console.log("[Speech] started, lang:", lang);
    } catch (e) {
      console.error("[Speech] start failed:", e);
      setError(e.message);
    }
  }

  function stop() {
    stoppingRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText("");
  }

  function pause() {
    // Capture current transcript BEFORE aborting to prevent data loss
    accumulatedRef.current = transcriptRef.current;
    stoppingRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText("");
  }

  function resume(lang) {
    if (!isSupported) return;
    stoppingRef.current = false;
    if (lang) langRef.current = lang;
    try {
      const rec = makeRecognition();
      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
    } catch (e) {
      setError(e.message);
    }
  }

  function reset() {
    setTranscript("");
    setInterimText("");
    setError(null);
    accumulatedRef.current = "";
    transcriptRef.current = "";
  }

  return { isSupported, isListening, transcript, interimText, error, start, stop, pause, resume, reset };
}
