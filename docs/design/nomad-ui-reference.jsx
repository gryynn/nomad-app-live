import { useState, useEffect, useRef } from "react";

// ══════════════════════════════════════════════════
// "Whisper" — L'app est à peine là.
// Noir pur, accent sable doux (#D4C5A0).
// La couleur n'apparaît que pour les statuts.
// Tout est retenu, calme, sûr de soi.
// ══════════════════════════════════════════════════

const T = {
  oled: {
    name: "oled",
    bg: "#000000",
    text: "#C0C0C0",
    textSoft: "#5A5A5A",
    textGhost: "#2E2E2E",
    accent: "#D4C5A0",
    accentSoft: "rgba(212,197,160,0.04)",
    red: "#C47A72",
    green: "#7AAF7F",
    orange: "#C4A45C",
    blue: "#7A9EC4",
    sep: "rgba(255,255,255,0.028)",
    cardBg: "rgba(255,255,255,0.012)",
    cardBorder: "rgba(255,255,255,0.025)",
  },
  light: {
    name: "light",
    bg: "#F7F6F3",
    text: "#2A2A2A",
    textSoft: "#8A8A8A",
    textGhost: "#C0C0C0",
    accent: "#5C5445",
    accentSoft: "rgba(92,84,69,0.04)",
    red: "#A85C55",
    green: "#5C8A60",
    orange: "#A08240",
    blue: "#5C7FA0",
    sep: "rgba(0,0,0,0.04)",
    cardBg: "#FFFFFF",
    cardBorder: "rgba(0,0,0,0.04)",
  }
};

const TAGS = [
  { id: "1", name: "Insight", emoji: "🧠", hue: "#8888BB" },
  { id: "2", name: "Call", emoji: "📞", hue: "#BB8888" },
  { id: "3", name: "Podcast", emoji: "🎙️", hue: "#B8A060" },
  { id: "4", name: "Mémo", emoji: "📝", hue: "#6BAA88" },
  { id: "5", name: "Music", emoji: "🎵", hue: "#B080A0" },
  { id: "6", name: "Sample", emoji: "🎹", hue: "#9080B0" },
  { id: "7", name: "Travail", emoji: "💼", hue: "#7098BB" },
  { id: "8", name: "Idée", emoji: "💡", hue: "#C09060" },
  { id: "9", name: "Learning", emoji: "🎓", hue: "#60A898" },
  { id: "10", name: "Perso", emoji: "🏠", hue: "#888888" },
];

const ENGINES = [
  { id: "groq-turbo", name: "Groq Turbo", icon: "⚡", cost: "$0.04/h" },
  { id: "groq-large", name: "Groq large-v3", icon: "⚡", cost: "$0.11/h" },
  { id: "deepgram", name: "Deepgram Nova-3", icon: "🌊", cost: "$0.46/h" },
  { id: "wynona", name: "WYNONA WhisperX", icon: "🖥️", cost: "Gratuit" },
];

const DEVICES = [
  { id: "dji-usbc", label: "DJI Mic 3 (USB-C)", short: "DJI Mic 3", connected: true, level: 0.72 },
  { id: "dji-bt", label: "DJI Mic 3 (Bluetooth)", short: "DJI BT", connected: false, level: 0 },
  { id: "builtin", label: "Micro intégré", short: "Intégré", connected: true, level: 0.35 },
  { id: "system", label: "Système (loopback)", short: "Système", connected: true, level: 0, isSystem: true },
];

const RECENT = [
  { id: "r1", title: "Théophile — Agora", dur: 36, date: "25 fév", tag: "Travail", done: true },
  { id: "r2", title: "Société égalitaire", dur: 162, date: "18 fév", tag: "Insight", done: true, who: "C.H. Denis" },
  { id: "r3", title: "L'art c'est quoi", dur: 1830, date: "17 fév", tag: "Insight", done: true },
  { id: "r4", title: "dictaphone_20221126", dur: 750, date: "nov 22", tag: null, done: false },
  { id: "r5", title: "Timeline modification", dur: 912, date: "16 fév", tag: "Idée", done: true },
];

const MARK_TAGS = [
  { id: "m1", label: "💡 Important", hue: "#C09060" },
  { id: "m2", label: "❓ Question", hue: "#8888BB" },
  { id: "m3", label: "✅ Action", hue: "#6BAA88" },
  { id: "m4", label: "⚠️ Risque", hue: "#BB8888" },
  { id: "m5", label: "🔑 Clé", hue: "#B8A060" },
  { id: "m6", label: "👤 Personne", hue: "#7098BB" },
];

const fmt = s => {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
};
const clock = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function Reveal({ children, delay = 0, style = {} }) {
  return <div style={{ animation: `nFade 0.7s ease ${delay}s both`, ...style }}>{children}</div>;
}

function Vu({ level, c, w = 44, h = 9 }) {
  const n = 6;
  return (
    <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", height: h }}>
      {Array.from({ length: n }).map((_, i) => {
        const th = (i + 1) / n;
        const on = level >= th;
        return <div key={i} style={{
          width: w / n - 1.5, height: `${35 + i * 10}%`, borderRadius: 1,
          backgroundColor: on ? c.accent : c.name === "oled" ? "#111" : "#E0E0E0",
          opacity: on ? 0.4 : 1,
          transition: "background-color 0.15s",
        }} />;
      })}
    </div>
  );
}

function Wave({ active, c, h = 48 }) {
  const [bars, setBars] = useState(Array(24).fill(0.06));
  useEffect(() => {
    if (!active) { setBars(Array(24).fill(0.06)); return; }
    const iv = setInterval(() => {
      setBars(p => p.map((_, i) => {
        const t = Date.now() / 360;
        return Math.max(0.05, Math.min(0.8, 0.15 + Math.sin(t + i * 0.5) * 0.2 + Math.sin(t * 1.4 + i * 0.2) * 0.1 + Math.random() * 0.15));
      }));
    }, 80);
    return () => clearInterval(iv);
  }, [active]);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2.5, height: h, padding: "0 16px" }}>
      {bars.map((v, i) => (
        <div key={i} style={{
          width: 2, borderRadius: 2, height: `${v * 100}%`,
          backgroundColor: c.accent, opacity: active ? 0.35 : 0.06,
          transition: "height 0.08s ease-out, opacity 0.5s",
        }} />
      ))}
    </div>
  );
}

function TagPill({ tag, on, onClick, c, sm }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: sm ? 3 : 4,
      padding: sm ? "3px 8px" : "4px 10px",
      borderRadius: 99, cursor: "pointer", fontFamily: "inherit",
      fontSize: sm ? 10.5 : 11.5,
      border: on ? `1px solid ${tag.hue}30` : `1px solid ${c.sep}`,
      backgroundColor: on ? `${tag.hue}08` : "transparent",
      color: on ? tag.hue : c.textSoft,
      transition: "all 0.3s ease",
      opacity: on ? 0.85 : 0.7,
    }}>
      <span style={{ fontSize: sm ? 10 : 11 }}>{tag.emoji}</span>
      <span style={{ fontWeight: on ? 500 : 300 }}>{tag.name}</span>
      {on && <span style={{ opacity: 0.3, marginLeft: 1, fontSize: 8 }}>✕</span>}
    </button>
  );
}

function MarkItem({ mark, idx, c, onTag }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: c.textSoft, minWidth: 36, opacity: 0.7 }}>{clock(mark.time)}</span>
        {mark.tag ? (
          <button onClick={() => setOpen(!open)} style={{
            padding: "2px 7px", borderRadius: 99, fontSize: 9.5, fontFamily: "inherit",
            border: `1px solid ${mark.tag.hue}25`, backgroundColor: `${mark.tag.hue}08`,
            color: mark.tag.hue, cursor: "pointer", opacity: 0.8,
          }}>{mark.tag.label}</button>
        ) : (
          <button onClick={() => setOpen(!open)} style={{
            padding: "2px 7px", borderRadius: 99, fontSize: 9.5, fontFamily: "inherit",
            border: `1px dashed ${c.sep}`, backgroundColor: "transparent",
            color: c.textGhost, cursor: "pointer",
          }}>+ tag</button>
        )}
      </div>
      {open && (
        <div style={{ marginLeft: 44, marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
          {MARK_TAGS.map(mt => (
            <button key={mt.id} onClick={() => { onTag(idx, mt); setOpen(false); }} style={{
              padding: "2px 6px", borderRadius: 99, fontSize: 8.5, fontFamily: "inherit",
              border: `1px solid ${mt.hue}22`, backgroundColor: `${mt.hue}06`,
              color: mt.hue, cursor: "pointer", opacity: 0.8,
            }}>{mt.label}</button>
          ))}
          {!showCustom ? (
            <button onClick={() => setShowCustom(true)} style={{
              padding: "2px 6px", borderRadius: 99, fontSize: 8.5, fontFamily: "inherit",
              border: `1px dashed ${c.sep}`, backgroundColor: "transparent",
              color: c.textGhost, cursor: "pointer",
            }}>✏️</button>
          ) : (
            <input value={custom} onChange={e => setCustom(e.target.value)} autoFocus placeholder="label"
              onKeyDown={e => { if (e.key === "Enter" && custom.trim()) { onTag(idx, { id: "c", label: custom, hue: c.accent }); setOpen(false); setShowCustom(false); setCustom(""); } }}
              style={{ width: 56, padding: "2px 5px", borderRadius: 4, fontSize: 8.5, border: `1px solid ${c.sep}`, backgroundColor: "transparent", color: c.text, outline: "none", fontFamily: "inherit" }} />
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════
export default function Nomad() {
  const [theme, setTheme] = useState("oled");
  const [view, setView] = useState("home");
  const [selDev, setSelDev] = useState("dji-usbc");
  const [devOpen, setDevOpen] = useState(false);
  const [selEngine, setSelEngine] = useState("groq-turbo");
  const [engStatus, setEngStatus] = useState({ "groq-turbo": "on", "groq-large": "on", deepgram: "on", wynona: "off" });
  const [engOpen, setEngOpen] = useState(false);
  const [sticky, setSticky] = useState(["7", "1"]);
  const [tagOpen, setTagOpen] = useState(false);
  const [rec, setRec] = useState(false);
  const [live, setLive] = useState(false);
  const [time, setTime] = useState(0);
  const [marks, setMarks] = useState([]);
  const [liveText, setLiveText] = useState("");
  const [stats, setStats] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [txProg, setTxProg] = useState(0);
  const [txText, setTxText] = useState("");

  const c = T[theme];
  const isOled = theme === "oled";
  const timer = useRef(null);
  const dev = DEVICES.find(d => d.id === selDev);
  const eng = ENGINES.find(e => e.id === selEngine);
  const font = "'Outfit', system-ui, sans-serif";
  const mono = "'JetBrains Mono', monospace";

  const [vu, setVu] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      if (rec || live) setVu(0.2 + Math.random() * 0.4);
      else setVu(DEVICES.find(d => d.id === selDev)?.level || 0);
    }, 150);
    return () => clearInterval(iv);
  }, [rec, live, selDev]);

  const go = mode => {
    setRec(true); setLive(mode === "live"); setTime(0); setMarks([]);
    setLiveText(""); setTxStatus(null); setTxText(""); setTxProg(0);
    setView("rec");
    timer.current = setInterval(() => setTime(t => t + 1), 1000);
    if (mode === "live") {
      const ph = ["Et donc là je pensais que ", "pour le projet Nomad on pourrait ", "utiliser une approche différente ", "avec un PWA universel qui marche ", "sur tous les appareils. ", "L'avantage c'est que même au bureau ", "je peux juste ouvrir l'URL ", "et capturer directement."];
      let i = 0;
      const add = () => { if (i < ph.length) { setLiveText(p => p + ph[i]); i++; setTimeout(add, 1600 + Math.random() * 2200); } };
      setTimeout(add, 800);
    }
  };
  const stop = () => { setRec(false); clearInterval(timer.current); setView("post"); };
  const addMark = () => setMarks(p => [...p, { time, tag: null }]);
  const tagMark = (i, tag) => setMarks(p => p.map((m, j) => j === i ? { ...m, tag } : m));
  const wake = () => { setEngStatus(p => ({ ...p, wynona: "starting" })); setTimeout(() => { setEngStatus(p => ({ ...p, wynona: "on" })); setSelEngine("wynona"); }, 4000); };
  const togTag = id => setSticky(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const home = () => { setView("home"); setRec(false); setLive(false); clearInterval(timer.current); };
  const launchTx = () => {
    setTxStatus("processing"); setTxProg(0);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 11 + 3;
      if (p >= 100) { p = 100; clearInterval(iv); setTxStatus("done"); setTxText("Alors je pensais que pour le projet, on devrait revoir l'architecture complètement. Le problème actuel c'est qu'on dépend trop du Raspberry Pi, et ça limite l'utilisation. Si on passait sur une PWA, n'importe qui pourrait enregistrer depuis n'importe quel appareil."); }
      setTxProg(Math.min(p, 100));
    }, 400);
  };

  const shell = { width: "100%", maxWidth: 420, margin: "0 auto", minHeight: "100vh", backgroundColor: c.bg, color: c.text, fontFamily: font, WebkitFontSmoothing: "antialiased" };
  const lbl = { fontSize: 8.5, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.16em", color: c.textGhost, marginBottom: 10 };
  const sec = (x = {}) => ({ padding: "18px 24px", borderBottom: `1px solid ${c.sep}`, ...x });
  const css = `
    @keyframes nFade{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nPulse{0%,100%{opacity:0.7}50%{opacity:0.25}}
    @keyframes nBlink{0%,48%{opacity:0.6}50%,100%{opacity:0}}
    @keyframes nBreath{0%,100%{opacity:0.4}50%{opacity:0.7}}
  `;

  // ═══════════════════
  // HOME
  // ═══════════════════
  if (view === "home") return (
    <div style={shell}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{css}</style>
      <div style={{ padding: "0 0 80px" }}>

        <Reveal>
          <div style={{ padding: "28px 24px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ fontFamily: mono, fontSize: 13, fontWeight: 400, letterSpacing: "0.5em", margin: 0, color: c.text, opacity: 0.5 }}>NOMAD</h1>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setTheme(isOled ? "light" : "oled")} style={{
                width: 28, height: 28, borderRadius: "50%", border: "none",
                backgroundColor: "transparent", cursor: "pointer", fontSize: 11,
                display: "flex", alignItems: "center", justifyContent: "center", color: c.textGhost, opacity: 0.5,
              }}>{isOled ? "☀" : "●"}</button>
              <button onClick={() => setStats(true)} style={{
                width: 28, height: 28, borderRadius: "50%", border: "none",
                backgroundColor: "transparent", cursor: "pointer", fontSize: 10,
                display: "flex", alignItems: "center", justifyContent: "center", color: c.textGhost, opacity: 0.5,
              }}>⚙</button>
            </div>
          </div>
        </Reveal>

        {/* Device */}
        <Reveal delay={0.07}>
          <div style={sec()}>
            <button onClick={() => setDevOpen(!devOpen)} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: font, color: c.text,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: dev?.connected ? c.green : c.textGhost, opacity: 0.6 }} />
                <span style={{ fontSize: 13, fontWeight: 300 }}>{dev?.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Vu level={vu} c={c} />
                <span style={{ fontSize: 8, color: c.textGhost, opacity: 0.4, transition: "transform 0.3s", transform: devOpen ? "rotate(180deg)" : "none" }}>▾</span>
              </div>
            </button>
            {devOpen && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                {DEVICES.map(d => (
                  <button key={d.id} onClick={() => { setSelDev(d.id); setDevOpen(false); }} style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 8px", background: "none", border: "none", borderRadius: 6,
                    cursor: "pointer", fontFamily: font, color: c.text,
                    backgroundColor: d.id === selDev ? c.accentSoft : "transparent",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: d.connected ? c.green : c.textGhost, opacity: 0.5 }} />
                      <span style={{ fontSize: 12, fontWeight: 300 }}>{d.label}</span>
                    </div>
                    {d.connected && !d.isSystem && <Vu level={d.level} c={c} w={32} h={8} />}
                    {d.isSystem && <span style={{ fontSize: 9, color: c.blue, opacity: 0.5 }}>loopback</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Reveal>

        {/* Engine */}
        <Reveal delay={0.11}>
          <div style={sec()}>
            <button onClick={() => setEngOpen(!engOpen)} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: font, color: c.text,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, opacity: 0.6 }}>{eng?.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 300 }}>{eng?.name}</span>
                <span style={{ fontSize: 7, color: engStatus[selEngine] === "on" ? c.green : c.orange, opacity: 0.5 }}>●</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: c.textGhost, fontFamily: mono, fontWeight: 300 }}>{eng?.cost}</span>
                <span style={{ fontSize: 8, color: c.textGhost, opacity: 0.4, transition: "transform 0.3s", transform: engOpen ? "rotate(180deg)" : "none" }}>▾</span>
              </div>
            </button>
            {engOpen && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                {ENGINES.map(e => {
                  const st = engStatus[e.id];
                  const active = selEngine === e.id;
                  return (
                    <button key={e.id} onClick={() => st === "on" && setSelEngine(e.id)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 8px",
                      borderRadius: 6, border: "none", cursor: st === "on" ? "pointer" : "default",
                      fontFamily: font, color: c.text,
                      backgroundColor: active ? c.accentSoft : "transparent",
                    }}>
                      <span style={{ fontSize: 12, width: 16, textAlign: "center", opacity: 0.6 }}>{e.icon}</span>
                      <span style={{ flex: 1, textAlign: "left", fontSize: 12, fontWeight: active ? 400 : 300 }}>{e.name}</span>
                      <span style={{ fontSize: 7, color: st === "on" ? c.green : st === "starting" ? c.orange : c.textGhost, opacity: 0.5 }}>●</span>
                      <span style={{ fontSize: 9.5, color: c.textGhost, fontFamily: mono, fontWeight: 300, minWidth: 44, textAlign: "right" }}>{e.cost}</span>
                      {st === "off" && e.id === "wynona" && (
                        <button onClick={ev => { ev.stopPropagation(); wake(); }} style={{
                          padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 400,
                          border: `1px solid ${c.sep}`, backgroundColor: "transparent",
                          color: c.textSoft, cursor: "pointer", fontFamily: font, opacity: 0.6,
                        }}>⏻</button>
                      )}
                      {st === "starting" && <span style={{ fontSize: 8, color: c.orange, fontFamily: mono, fontWeight: 300, animation: "nPulse 2.5s infinite" }}>~3min</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Reveal>

        {/* Actions */}
        <Reveal delay={0.15}>
          <div style={sec()}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { icon: "🎙️", name: "REC", sub: "Enregistrer", clr: c.red, act: () => go("rec") },
                { icon: "✍️", name: "LIVE", sub: "Transcrire", clr: c.accent, act: () => go("live") },
                { icon: "📂", name: "Import", sub: "Fichier(s)", clr: null },
                { icon: "📋", name: "Paste", sub: "Texte", clr: null },
              ].map((b, i) => (
                <button key={i} onClick={b.act} style={{
                  padding: "22px 12px 18px", borderRadius: 16, cursor: "pointer", fontFamily: font,
                  textAlign: "center", transition: "all 0.3s ease",
                  border: `1px solid ${c.sep}`,
                  backgroundColor: "transparent",
                }}>
                  <div style={{ fontSize: 22, marginBottom: 10, lineHeight: 1, opacity: 0.65 }}>{b.icon}</div>
                  <div style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 500, color: b.clr || c.text, letterSpacing: "0.06em", opacity: 0.65 }}>{b.name}</div>
                  <div style={{ fontSize: 10, color: c.textSoft, marginTop: 4, fontWeight: 200 }}>{b.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Sticky */}
        <Reveal delay={0.19}>
          <div style={sec()}>
            <div style={lbl}>Pré-config</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
              {TAGS.filter(t => sticky.includes(t.id)).map(t => <TagPill key={t.id} tag={t} on c={c} onClick={() => togTag(t.id)} sm />)}
              <button onClick={() => setTagOpen(!tagOpen)} style={{
                padding: "3px 8px", borderRadius: 99, fontSize: 10, fontFamily: font,
                border: `1px dashed ${c.textGhost}`, backgroundColor: "transparent",
                color: c.textGhost, cursor: "pointer", opacity: 0.5,
              }}>+</button>
            </div>
            <div style={{ fontSize: 10, color: c.textGhost, fontWeight: 200, opacity: 0.6 }}>🇫🇷 Français</div>
            {tagOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.sep}`, display: "flex", flexWrap: "wrap", gap: 5 }}>
                {TAGS.filter(t => !sticky.includes(t.id)).map(t => <TagPill key={t.id} tag={t} on={false} c={c} onClick={() => togTag(t.id)} sm />)}
              </div>
            )}
          </div>
        </Reveal>

        {/* Recent */}
        <Reveal delay={0.23}>
          <div style={{ padding: "18px 24px 8px" }}><div style={lbl}>Récent</div></div>
          {RECENT.map((s, i) => {
            const tagObj = TAGS.find(t => t.name === s.tag);
            return (
              <Reveal key={s.id} delay={0.26 + i * 0.04}>
                <div style={{
                  padding: "12px 24px", display: "flex", justifyContent: "space-between",
                  alignItems: "center", cursor: "pointer", borderBottom: `1px solid ${c.sep}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 300, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: s.done ? c.green : c.orange, flexShrink: 0, opacity: 0.5 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: c.textSoft, fontWeight: 200, paddingLeft: 11 }}>
                      {tagObj && <span style={{ color: tagObj.hue, opacity: 0.65 }}>{tagObj.emoji} {tagObj.name}</span>}
                      {s.who && <span style={{ color: c.textGhost }}>· {s.who}</span>}
                      {!s.done && <span style={{ color: c.orange, opacity: 0.5 }}>· en attente</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 14 }}>
                    <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 300, color: c.text, opacity: 0.5 }}>{fmt(s.dur)}</div>
                    <div style={{ fontSize: 9, color: c.textGhost, fontWeight: 200 }}>{s.date}</div>
                  </div>
                </div>
              </Reveal>
            );
          })}
          <div style={{ padding: "14px 24px", textAlign: "center" }}>
            <button style={{ fontSize: 10.5, color: c.accent, opacity: 0.5, background: "none", border: "none", cursor: "pointer", fontFamily: font, fontWeight: 300 }}>Tout voir →</button>
          </div>
        </Reveal>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: isOled ? "rgba(0,0,0,0.9)" : "rgba(247,246,243,0.93)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "nFade 0.3s ease" }} onClick={() => setStats(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 420, backgroundColor: isOled ? "#040404" : "#FFF",
            borderRadius: "20px 20px 0 0", border: `1px solid ${c.sep}`,
            padding: "28px 24px 32px", maxHeight: "70vh", overflow: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
              <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 400, letterSpacing: "0.3em", color: c.textGhost }}>STATS</span>
              <button onClick={() => setStats(false)} style={{ background: "none", border: "none", color: c.textGhost, fontSize: 13, cursor: "pointer", opacity: 0.5 }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
              {[{ v: "229", l: "Sessions" }, { v: "23 GB", l: "Stocké" }, { v: "0", l: "Transcrites" }, { v: "~48h", l: "Durée totale" }].map((s, i) => (
                <div key={i} style={{ padding: "18px 16px", borderRadius: 14, backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
                  <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 400, color: c.text, marginBottom: 4, opacity: 0.6 }}>{s.v}</div>
                  <div style={{ fontSize: 9.5, color: c.textSoft, fontWeight: 200 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={lbl}>Moteurs ce mois</div>
            {[{ n: "Groq", co: "$0.09", p: 65 }, { n: "WYNONA", co: "$0", p: 30 }, { n: "Deepgram", co: "$0.09", p: 5 }].map((e, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginBottom: 5, fontWeight: 200 }}>
                  <span style={{ color: c.text }}>{e.n}</span>
                  <span style={{ color: c.textGhost, fontFamily: mono }}>{e.co}</span>
                </div>
                <div style={{ height: 1.5, borderRadius: 1, backgroundColor: c.sep }}>
                  <div style={{ height: "100%", width: `${e.p}%`, borderRadius: 1, backgroundColor: c.accent, opacity: 0.3, transition: "width 1s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════
  // RECORDING
  // ═══════════════════
  if (view === "rec") return (
    <div style={shell}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{css}</style>
      <div style={{ padding: "24px 24px", display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <button onClick={home} style={{ background: "none", border: "none", color: c.textGhost, fontSize: 11, cursor: "pointer", fontFamily: font, padding: 0, fontWeight: 300, opacity: 0.5 }}>←</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 400, color: live ? c.accent : c.red, letterSpacing: "0.02em", lineHeight: 1, opacity: 0.7 }}>
              {clock(time)}
            </div>
            <div style={{ fontSize: 10, color: c.textGhost, marginTop: 8, fontWeight: 200 }}>
              {dev?.short} · {live ? eng?.name : "44.1kHz"} · 🇫🇷
            </div>
          </div>
          <span style={{
            fontSize: 8.5, fontWeight: 400, fontFamily: mono, letterSpacing: "0.1em",
            color: live ? c.accent : c.red, opacity: 0.45,
            animation: "nBreath 3.5s ease infinite",
          }}>{live ? "LIVE" : "REC"}</span>
        </div>

        {live && (
          <Reveal>
            <div style={{
              flex: 1, padding: 20, borderRadius: 14, marginBottom: 24,
              backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}`,
              maxHeight: 240, overflow: "auto",
            }}>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: c.text, fontWeight: 200 }}>
                {liveText}
                <span style={{ display: "inline-block", width: 1.5, height: 14, backgroundColor: c.accent, marginLeft: 2, opacity: 0.4, animation: "nBlink 1.3s infinite", verticalAlign: "text-bottom" }} />
              </div>
            </div>
          </Reveal>
        )}

        {!live && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Wave active={rec} c={c} h={72} />
            <div style={{ textAlign: "center", marginTop: 16, fontFamily: mono, fontSize: 9.5, color: c.textGhost, fontWeight: 300, opacity: 0.35 }}>
              {Math.round(-20 + Math.random() * 5)} dBFS
            </div>
          </div>
        )}

        {marks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={lbl}>Marks</div>
            {marks.map((m, i) => <MarkItem key={i} mark={m} idx={i} c={c} onTag={tagMark} />)}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 28, paddingBottom: 32 }}>
          <button style={{
            width: 44, height: 44, borderRadius: "50%", border: `1px solid ${c.sep}`,
            backgroundColor: "transparent", fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.4,
          }}>⏸</button>
          <button onClick={stop} style={{
            width: 60, height: 60, borderRadius: "50%",
            border: `1.5px solid ${(live ? c.accent : c.red)}25`,
            backgroundColor: "transparent",
            fontSize: 22, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7,
          }}>⏹</button>
          <button onClick={addMark} style={{
            width: 44, height: 44, borderRadius: "50%", border: `1px solid ${c.sep}`,
            backgroundColor: "transparent", fontSize: 14, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.4,
          }}>📌</button>
        </div>
      </div>
    </div>
  );

  // ═══════════════════
  // POST-CAPTURE
  // ═══════════════════
  if (view === "post") return (
    <div style={shell}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{css}</style>
      <div style={{ padding: "28px 24px" }}>

        <Reveal>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
            <div>
              <span style={{ fontSize: 12.5, color: c.green, fontWeight: 400, opacity: 0.65 }}>✓ Capturé</span>
              <div style={{ fontSize: 10, color: c.textGhost, marginTop: 4, fontWeight: 200 }}>{live ? "Live" : "Record"} · {fmt(time)}</div>
            </div>
            <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 400, color: c.text, opacity: 0.4 }}>{clock(time)}</span>
          </div>
        </Reveal>

        <Reveal delay={0.07}>
          <div style={{ marginBottom: 22, paddingBottom: 22, borderBottom: `1px solid ${c.sep}` }}>
            <div style={lbl}>Titre</div>
            <input placeholder="Nommer cette session..." style={{
              width: "100%", padding: "8px 0", fontSize: 14, fontWeight: 300,
              border: "none", backgroundColor: "transparent", color: c.text,
              outline: "none", fontFamily: font, borderBottom: `1px solid ${c.sep}`, boxSizing: "border-box",
            }} />
          </div>
        </Reveal>

        <Reveal delay={0.11}>
          <div style={{ marginBottom: 22, paddingBottom: 22, borderBottom: `1px solid ${c.sep}` }}>
            <div style={lbl}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {TAGS.map(t => <TagPill key={t.id} tag={t} on={sticky.includes(t.id)} onClick={() => togTag(t.id)} c={c} />)}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div style={{ marginBottom: 22, paddingBottom: 22, borderBottom: `1px solid ${c.sep}` }}>
            <div style={lbl}>Transcription</div>
            {live && liveText ? (
              <div>
                <div style={{ fontSize: 10, color: c.green, fontWeight: 300, marginBottom: 8, opacity: 0.6 }}>✓ Transcrit en direct</div>
                <div style={{
                  fontSize: 13, color: c.textSoft, lineHeight: 1.7, fontWeight: 200,
                  padding: 16, borderRadius: 12, backgroundColor: c.cardBg,
                  border: `1px solid ${c.cardBorder}`, maxHeight: 80, overflow: "hidden",
                }}>{liveText.substring(0, 130)}…</div>
                <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
                  <button style={{ fontSize: 10, color: c.accent, opacity: 0.55, background: "none", border: "none", cursor: "pointer", fontFamily: font, fontWeight: 300 }}>Voir tout →</button>
                  <button style={{ fontSize: 10, color: c.textGhost, background: "none", border: "none", cursor: "pointer", fontFamily: font, fontWeight: 300 }}>Copier</button>
                </div>
              </div>
            ) : txStatus === null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select style={{
                  padding: "6px 10px", borderRadius: 6, fontSize: 11.5, fontFamily: font, fontWeight: 300,
                  border: `1px solid ${c.sep}`, backgroundColor: "transparent", color: c.text,
                }}>
                  <option>Auto ({eng?.name})</option>
                  <option>Groq Turbo</option>
                  <option>Groq large-v3</option>
                  <option>WYNONA</option>
                  <option>Non</option>
                </select>
                <button onClick={launchTx} style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: 11.5, fontWeight: 400,
                  border: `1px solid ${c.accent}18`, backgroundColor: c.accentSoft,
                  color: c.accent, cursor: "pointer", fontFamily: font, opacity: 0.7,
                }}>Transcrire →</button>
              </div>
            ) : txStatus === "processing" ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, color: c.orange, fontWeight: 300, opacity: 0.55, animation: "nPulse 2.5s infinite" }}>Transcription...</span>
                  <span style={{ fontFamily: mono, fontSize: 9.5, color: c.textGhost, fontWeight: 300 }}>{Math.round(txProg)}%</span>
                </div>
                <div style={{ height: 1.5, borderRadius: 1, backgroundColor: c.sep, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${txProg}%`, backgroundColor: c.orange, opacity: 0.45, borderRadius: 1, transition: "width 0.4s ease" }} />
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 10, color: c.green, fontWeight: 300, marginBottom: 8, opacity: 0.6 }}>✓ Terminé · {eng?.name} · 312 mots</div>
                <div style={{
                  fontSize: 13, color: c.text, lineHeight: 1.7, fontWeight: 200,
                  padding: 16, borderRadius: 12, backgroundColor: c.cardBg,
                  border: `1px solid ${c.cardBorder}`, maxHeight: 100, overflow: "auto",
                }}>{txText}</div>
                <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
                  <button style={{ fontSize: 10, color: c.accent, opacity: 0.55, background: "none", border: "none", cursor: "pointer", fontFamily: font, fontWeight: 300 }}>Voir tout →</button>
                  <button style={{ fontSize: 10, color: c.textGhost, background: "none", border: "none", cursor: "pointer", fontFamily: font, fontWeight: 300 }}>Retranscrire</button>
                  <button style={{ fontSize: 10, color: c.textGhost, background: "none", border: "none", cursor: "pointer", fontFamily: font, fontWeight: 300 }}>Copier</button>
                </div>
              </div>
            )}
          </div>
        </Reveal>

        {marks.length > 0 && (
          <Reveal delay={0.19}>
            <div style={{ marginBottom: 22, paddingBottom: 22, borderBottom: `1px solid ${c.sep}` }}>
              <div style={lbl}>Marks ({marks.length})</div>
              {marks.map((m, i) => <MarkItem key={i} mark={m} idx={i} c={c} onTag={tagMark} />)}
            </div>
          </Reveal>
        )}

        <Reveal delay={0.23}>
          <div style={{ marginBottom: 28 }}>
            <div style={lbl}>Note</div>
            <textarea placeholder="Contexte, rappel..." rows={2} style={{
              width: "100%", padding: 14, fontSize: 13, fontWeight: 200,
              border: `1px solid ${c.sep}`, borderRadius: 12,
              backgroundColor: c.cardBg, color: c.text, resize: "vertical",
              outline: "none", fontFamily: font, boxSizing: "border-box", lineHeight: 1.6,
            }} />
          </div>
        </Reveal>

        <Reveal delay={0.27}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={home} style={{
              flex: 1, padding: "15px", borderRadius: 14, fontSize: 13, fontWeight: 400,
              border: "none", backgroundColor: c.accent, color: isOled ? "#000" : "#FFF",
              cursor: "pointer", fontFamily: font, opacity: 0.75,
            }}>Sauvegarder</button>
            <button onClick={home} style={{
              padding: "15px 18px", borderRadius: 14, fontSize: 12,
              border: `1px solid ${c.sep}`, backgroundColor: "transparent",
              color: c.textGhost, cursor: "pointer", fontFamily: font, opacity: 0.5,
            }}>🗑</button>
          </div>
          <button onClick={home} style={{
            width: "100%", padding: "10px", borderRadius: 8, fontSize: 10,
            border: "none", backgroundColor: "transparent",
            color: c.textGhost, cursor: "pointer", fontFamily: font, fontWeight: 200, opacity: 0.4,
          }}>Skip — sauvegarder brut →</button>
        </Reveal>
      </div>
    </div>
  );

  return null;
}
