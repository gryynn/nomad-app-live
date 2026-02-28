import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";

export default function AppLayout() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("nomad-sidebar") === "collapsed"
  );

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("nomad-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  function handleCapture(mode) {
    navigate(`/capture?mode=${mode}`);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          onCapture={handleCapture}
        />
      </div>

      {/* Main content */}
      <main
        className={cn(
          "min-h-screen transition-all duration-200 pb-16 md:pb-0",
          sidebarCollapsed ? "md:ml-16" : "md:ml-60"
        )}
      >
        <div className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav onCapture={handleCapture} />
    </div>
  );
}
