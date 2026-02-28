import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  LayoutList,
  Columns3,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Tags,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSessions, getTags } from "@/lib/api";
import { cn, formatDuration, formatDateTime, STATUS_CONFIG } from "@/lib/utils";

export default function Sessions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState(searchParams.get("tag") || "all");
  const [viewMode, setViewMode] = useState("table"); // table | kanban

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [sessData, tagData] = await Promise.all([
        getSessions({ order: "created_at.desc", limit: 200 }),
        getTags(),
      ]);
      setSessions(Array.isArray(sessData) ? sessData : sessData.data || []);
      setTags(Array.isArray(tagData) ? tagData : tagData.data || []);
    } catch (err) {
      console.error("Sessions load error:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = sessions.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (tagFilter !== "all" && !s.tags?.some((t) => t.id === tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (s.title || "").toLowerCase().includes(q) ||
        (s.transcript || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const kanbanColumns = ["pending", "recording", "processing", "done", "error"];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} session{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("table")}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "kanban" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("kanban")}
          >
            <Columns3 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tags.length > 0 && (
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="h-8 w-[150px]">
              <SelectValue placeholder="Tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les tags</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.emoji} {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      {viewMode === "table" ? (
        <Card className="border-border/50">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Titre</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Durée</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      Aucune session trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((session) => {
                    const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.pending;
                    return (
                      <TableRow
                        key={session.id}
                        className="cursor-pointer"
                        onClick={() => setSearchParams({ detail: session.id })}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">
                              {session.title || "Sans titre"}
                            </span>
                            {session.input_mode && (
                              <span className="font-mono text-[10px] text-muted-foreground uppercase">
                                {session.input_mode}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {session.tags?.map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px]"
                                style={{
                                  backgroundColor: tag.hue ? `${tag.hue}20` : undefined,
                                  color: tag.hue || undefined,
                                }}
                              >
                                {tag.emoji} {tag.name}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("text-[10px]", statusCfg.color)}>
                            {statusCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatDuration(session.duration_seconds)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatDateTime(session.created_at)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Re-transcrire
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Tags className="mr-2 h-4 w-4" />
                                Gérer tags
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        /* Kanban View */
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {kanbanColumns.map((status) => {
            const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
            const columnSessions = filtered.filter((s) => s.status === status);
            return (
              <div key={status} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Badge variant="secondary" className={cn("text-[10px]", statusCfg.color)}>
                    {statusCfg.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {columnSessions.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {columnSessions.map((session) => (
                    <Card
                      key={session.id}
                      className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={() => setSearchParams({ detail: session.id })}
                    >
                      <CardContent className="p-3">
                        <p className="text-sm font-medium truncate">
                          {session.title || "Sans titre"}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          {session.tags?.map((tag) => (
                            <span key={tag.id} className="text-xs">{tag.emoji}</span>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                          <span>{formatDuration(session.duration_seconds)}</span>
                          <span>{formatDateTime(session.created_at)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {columnSessions.length === 0 && (
                    <div className="rounded-md border border-dashed border-border/50 py-8 text-center text-xs text-muted-foreground">
                      Vide
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
