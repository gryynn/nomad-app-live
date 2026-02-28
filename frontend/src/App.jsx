import { Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Sessions from "@/pages/Sessions";
import TagsPage from "@/pages/TagsPage";
import SettingsPage from "@/pages/SettingsPage";
import CapturePage from "@/pages/CapturePage";

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/capture" element={<CapturePage />} />
          </Route>
        </Routes>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
