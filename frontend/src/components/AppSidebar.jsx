import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  List,
  Tags,
  Settings,
  Mic,
  Radio,
  Upload,
  ClipboardPaste,
  ChevronLeft,
  ChevronRight,
  Power,
  Moon,
  Sun,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/useTheme";
import { getEngineStatus as fetchEngineStatus, wakeWynona } from "@/lib/api";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/sessions", label: "Sessions", icon: List },
  { path: "/tags", label: "Tags", icon: Tags },
];

const CAPTURE_MODES = [
  { mode: "rec", label: "REC", icon: Mic, desc: "Enregistrer" },
  { mode: "live", label: "LIVE", icon: Radio, desc: "Temps réel" },
  { mode: "import", label: "Import", icon: Upload, desc: "Fichier audio" },
  { mode: "paste", label: "Paste", icon: ClipboardPaste, desc: "Coller texte" },
];

const ENGINE_NAMES = {
  groq: "Groq Whisper",
  deepgram: "Deepgram",
  wynona: "WYNONA",
  local: "Local",
};

export default function AppSidebar({ collapsed, onToggle, onCapture }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, toggle } = useTheme();
  const [engines, setEngines] = useState({});
  const [selectedEngine, setSelectedEngine] = useState(
    () => localStorage.getItem("nomad-engine") || "groq"
  );
  const [wakingWynona, setWakingWynona] = useState(false);

  useEffect(() => {
    loadEngines();
    const interval = setInterval(loadEngines, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem("nomad-engine", selectedEngine);
  }, [selectedEngine]);

  async function loadEngines() {
    try {
      const data = await fetchEngineStatus();
      setEngines(data);
    } catch {
      // API might not be available
    }
  }

  async function handleWakeWynona() {
    setWakingWynona(true);
    try {
      await wakeWynona();
      setTimeout(loadEngines, 3000);
    } catch {
      // ignore
    } finally {
      setWakingWynona(false);
    }
  }

  function getEngineStatus(name) {
    const e = engines[name];
    if (!e) return { online: false, label: "?" };
    return {
      online: e.status === "online" || e.status === "ready",
      label: e.status || "offline",
    };
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full flex-col border-r border-border bg-sidebar transition-all duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Header / Brand */}
        <div className="flex h-14 items-center justify-between px-4">
          {!collapsed && (
            <span className="text-sm font-light tracking-[0.35em] text-primary">
              N O M A D
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 text-muted-foreground"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <Separator />

        {/* Navigation */}
        <nav className="flex flex-col gap-1 p-2">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return collapsed ? (
              <Tooltip key={path}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(path)}
                    className={cn(
                      "flex h-9 w-full items-center justify-center rounded-md transition-colors cursor-pointer",
                      active
                        ? "bg-sidebar-accent text-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors cursor-pointer",
                  active
                    ? "bg-sidebar-accent text-primary font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        <Separator className="mx-2" />

        {/* Engines */}
        <div className="flex flex-col gap-1 p-2">
          {!collapsed && (
            <span className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Moteurs
            </span>
          )}
          {Object.keys(ENGINE_NAMES).map((key) => {
            const status = getEngineStatus(key);
            const selected = selectedEngine === key;
            return collapsed ? (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSelectedEngine(key)}
                    className={cn(
                      "flex h-8 w-full items-center justify-center rounded-md transition-colors cursor-pointer",
                      selected
                        ? "bg-sidebar-accent text-primary"
                        : "text-sidebar-foreground/50 hover:bg-sidebar-accent"
                    )}
                  >
                    <div className={cn("h-2 w-2 rounded-full", status.online ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {ENGINE_NAMES[key]} — {status.label}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                key={key}
                onClick={() => setSelectedEngine(key)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-3 text-xs transition-colors cursor-pointer",
                  selected
                    ? "bg-sidebar-accent text-foreground"
                    : "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground/80"
                )}
              >
                <div
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    selected && "ring-1 ring-primary ring-offset-1 ring-offset-sidebar",
                    status.online ? "bg-emerald-500" : "bg-muted-foreground/30"
                  )}
                />
                <span className="truncate font-mono">{ENGINE_NAMES[key]}</span>
                <span className={cn("ml-auto text-[10px]", status.online ? "text-emerald-500/70" : "text-muted-foreground/50")}>
                  {status.online ? "on" : "off"}
                </span>
              </button>
            );
          })}
          {/* Wake WYNONA button */}
          {!collapsed && selectedEngine === "wynona" && !getEngineStatus("wynona").online && (
            <Button
              variant="outline"
              size="sm"
              className="mx-2 mt-1 h-7 gap-2 text-xs"
              onClick={handleWakeWynona}
              disabled={wakingWynona}
            >
              <Power className="h-3 w-3" />
              {wakingWynona ? "Démarrage..." : "Allumer WYNONA"}
            </Button>
          )}
        </div>

        <Separator className="mx-2" />

        {/* Capture Buttons */}
        <div className="flex flex-col gap-1 p-2">
          {!collapsed && (
            <span className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Capture
            </span>
          )}
          {CAPTURE_MODES.map(({ mode: captureMode, label, icon: Icon, desc }) =>
            collapsed ? (
              <Tooltip key={captureMode}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onCapture(captureMode)}
                    className={cn(
                      "flex h-9 w-full items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer",
                      captureMode === "rec" && "text-primary"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{desc}</TooltipContent>
              </Tooltip>
            ) : (
              <button
                key={captureMode}
                onClick={() => onCapture(captureMode)}
                className={cn(
                  "flex h-8 items-center gap-3 rounded-md px-3 text-sm transition-colors cursor-pointer",
                  captureMode === "rec"
                    ? "text-primary hover:bg-primary/10"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-mono text-xs">{label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{desc}</span>
              </button>
            )
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        <Separator className="mx-2" />

        {/* Bottom: Settings + Theme */}
        <div className="flex flex-col gap-1 p-2 pb-4">
          {collapsed ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggle}
                    className="flex h-9 w-full items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent transition-colors cursor-pointer"
                  >
                    {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {mode === "dark" ? "Mode clair" : "Mode sombre"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate("/settings")}
                    className={cn(
                      "flex h-9 w-full items-center justify-center rounded-md transition-colors cursor-pointer",
                      location.pathname === "/settings"
                        ? "bg-sidebar-accent text-primary"
                        : "text-sidebar-foreground/50 hover:bg-sidebar-accent"
                    )}
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Réglages</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              <button
                onClick={toggle}
                className="flex h-8 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
              >
                {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {mode === "dark" ? "Mode clair" : "Mode sombre"}
              </button>
              <button
                onClick={() => navigate("/settings")}
                className={cn(
                  "flex h-8 items-center gap-3 rounded-md px-3 text-sm transition-colors cursor-pointer",
                  location.pathname === "/settings"
                    ? "bg-sidebar-accent text-primary font-medium"
                    : "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Settings className="h-4 w-4" />
                Réglages
              </button>
            </>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
