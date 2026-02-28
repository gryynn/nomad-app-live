import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Clock,
  Hash,
  DollarSign,
  Mic,
  Radio,
  Upload,
  ClipboardPaste,
  ArrowRight,
  Power,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSessions, getTags, getEngineStatus as fetchEngines, wakeWynona } from "@/lib/api";
import { cn, formatDuration, formatDateTime, STATUS_CONFIG } from "@/lib/utils";

const CAPTURE_MODES = [
  { mode: "rec", label: "REC", icon: Mic, desc: "Enregistrer" },
  { mode: "live", label: "LIVE", icon: Radio, desc: "Temps réel" },
  { mode: "import", label: "Import", icon: Upload, desc: "Fichier" },
  { mode: "paste", label: "Paste", icon: ClipboardPaste, desc: "Texte" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [tags, setTags] = useState([]);
  const [engines, setEngines] = useState([]);
  const [stats, setStats] = useState({ total: 0, duration: 0, words: 0, cost: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedEngine, setSelectedEngine] = useState(
    () => localStorage.getItem("nomad-engine") || "groq"
  );
  const [selectedLang, setSelectedLang] = useState(
    () => localStorage.getItem("nomad-lang") || "fr"
  );
  const [wakingWynona, setWakingWynona] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem("nomad-engine", selectedEngine);
  }, [selectedEngine]);

  useEffect(() => {
    localStorage.setItem("nomad-lang", selectedLang);
  }, [selectedLang]);

  async function loadData() {
    try {
      const [sessData, tagData, engineData] = await Promise.all([
        getSessions({ order: "created_at.desc", limit: 50 }),
        getTags(),
        fetchEngines(),
      ]);
      const list = Array.isArray(sessData) ? sessData : sessData.data || [];
      setSessions(list);
      setTags(Array.isArray(tagData) ? tagData : tagData.data || []);
      setEngines(engineData);

      const total = list.length;
      const duration = list.reduce((s, x) => s + (x.duration_seconds || 0), 0);
      const words = list.reduce((s, x) => s + (x.transcript_words || 0), 0);
      setStats({ total, duration, words, cost: 0 });
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleWakeWynona() {
    setWakingWynona(true);
    try {
      await wakeWynona();
    } catch {
      // ignore
    } finally {
      setWakingWynona(false);
    }
  }

  function handleCapture(mode) {
    navigate(`/capture?mode=${mode}`);
  }

  function isOnline(engine) {
    return engine.status === "online" || engine.status === "ready";
  }

  const recentSessions = sessions.slice(0, 6);

  const statCards = [
    { label: "Sessions", value: stats.total, icon: Activity, mono: true },
    { label: "Durée totale", value: formatDuration(stats.duration), icon: Clock },
    { label: "Mots transcrits", value: stats.words.toLocaleString("fr-FR"), icon: Hash, mono: true },
    { label: "Coût estimé", value: `$${stats.cost.toFixed(2)}`, icon: DollarSign, mono: true },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Quick Capture — HERO */}
      <Card className="border-primary/20 bg-card">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium tracking-tight">Quick Capture</span>
          </div>

          {/* 4 Capture Buttons */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CAPTURE_MODES.map(({ mode, label, icon: Icon, desc }) => (
              <button
                key={mode}
                onClick={() => handleCapture(mode)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-all cursor-pointer",
                  "hover:border-primary/40 hover:bg-primary/5",
                  mode === "rec" && "border-primary/30 bg-primary/5"
                )}
              >
                <Icon className={cn("h-6 w-6", mode === "rec" ? "text-primary" : "text-muted-foreground")} />
                <div className="text-center">
                  <div className={cn("text-sm font-mono font-semibold", mode === "rec" && "text-primary")}>{label}</div>
                  <div className="text-[10px] text-muted-foreground">{desc}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Engine selector + Language */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground shrink-0">Moteur :</span>
            <div className="flex flex-wrap gap-1.5">
              {engines.map((engine) => {
                const online = isOnline(engine);
                const selected = selectedEngine === engine.id;
                return (
                  <button
                    key={engine.id}
                    onClick={() => setSelectedEngine(engine.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-mono transition-colors cursor-pointer",
                      selected
                        ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                    {engine.name}
                  </button>
                );
              })}
            </div>

            {/* Wake WYNONA inline */}
            {selectedEngine === "wynona" && engines.find((e) => e.id === "wynona" && !isOnline(e)) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleWakeWynona}
                disabled={wakingWynona}
              >
                <Power className="h-3 w-3" />
                {wakingWynona ? "Démarrage..." : "Wake"}
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Langue :</span>
              <Select value={selectedLang} onValueChange={setSelectedLang}>
                <SelectTrigger className="h-7 w-[80px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">FR</SelectItem>
                  <SelectItem value="en">EN</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, mono }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{label}</span>
                <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
              </div>
              <div className={cn("mt-1.5 text-2xl font-semibold", mono && "font-mono")}>
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Sessions */}
      <Card className="border-border/50">
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium">Sessions récentes</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => navigate("/sessions")}
          >
            Tout voir <ArrowRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Mic className="h-8 w-8 opacity-30" />
              <p className="text-sm">Aucune session encore</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentSessions.map((session) => {
                const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.pending;
                return (
                  <button
                    key={session.id}
                    onClick={() => navigate(`/sessions?detail=${session.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {session.title || "Sans titre"}
                        </span>
                        {session.tags?.map((tag) => (
                          <span key={tag.id} className="text-xs">{tag.emoji}</span>
                        ))}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono">{formatDateTime(session.created_at)}</span>
                        {session.duration_seconds > 0 && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{formatDuration(session.duration_seconds)}</span>
                          </>
                        )}
                        {session.input_mode && (
                          <>
                            <span>·</span>
                            <span className="font-mono uppercase">{session.input_mode}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className={cn("text-[10px] shrink-0", statusCfg.color)}>
                      {statusCfg.label}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      {tags.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => navigate(`/sessions?tag=${tag.id}`)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors hover:opacity-80 cursor-pointer"
                  style={{
                    backgroundColor: tag.hue ? `${tag.hue}15` : undefined,
                    color: tag.hue || undefined,
                  }}
                >
                  <span>{tag.emoji}</span>
                  <span>{tag.name}</span>
                  {tag.session_count > 0 && (
                    <span className="ml-0.5 font-mono text-[10px] opacity-60">
                      ({tag.session_count})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
