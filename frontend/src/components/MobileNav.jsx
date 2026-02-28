import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, List, Mic, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Board", icon: LayoutDashboard },
  { path: "/sessions", label: "Sessions", icon: List },
  { path: "/capture", label: "Capture", icon: Mic, accent: true },
  { path: "/settings", label: "Réglages", icon: Settings },
];

export default function MobileNav({ onCapture }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-background/95 backdrop-blur-sm md:hidden">
      {NAV_ITEMS.map(({ path, label, icon: Icon, accent }) => {
        const active = location.pathname === path;
        if (path === "/capture") {
          return (
            <button
              key={path}
              onClick={() => onCapture("rec")}
              className="flex flex-col items-center gap-0.5 text-primary cursor-pointer"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        }
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={cn(
              "flex flex-col items-center gap-0.5 cursor-pointer",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px]">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
