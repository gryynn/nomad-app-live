import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Clock,
  Hash,
  DollarSign,
  Mic,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSessions, getTags } from "@/lib/api";
import { cn, formatDuration, formatDateTime, STATUS_CONFIG } from "@/lib/utils";

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [tags, setTags] = useState([]);
  const [stats, setStats] = useState({ total: 0, duration: 0, words: 0, cost: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [sessData, tagData] = await Promise.all([
        getSessions({ order: "created_at.desc", limit: 50 }),
        getTags(),
      ]);
      const list = Array.isArray(sessData) ? sessData : sessData.data || [];
      setSessions(list);
      setTags(Array.isArray(tagData) ? tagData : tagData.data || []);

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

  const recentSessions = sessions.slice(0, 8);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Vue d'ensemble de votre activité
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, mono }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
              </div>
              <div className={cn("mt-2 text-2xl font-semibold", mono && "font-mono")}>
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
              <p className="text-sm">Aucune session</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/capture?mode=rec")}
              >
                Première capture
              </Button>
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
                          <span key={tag.id} className="text-xs">
                            {tag.emoji}
                          </span>
                        ))}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
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

      {/* Tags section */}
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
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors hover:bg-muted cursor-pointer"
                  style={{
                    backgroundColor: tag.hue ? `${tag.hue}15` : undefined,
                    color: tag.hue || undefined,
                  }}
                >
                  <span>{tag.emoji}</span>
                  <span>{tag.name}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
