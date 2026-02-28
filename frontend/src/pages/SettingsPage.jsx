import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/hooks/useTheme";

export default function SettingsPage() {
  const { mode, toggle } = useTheme();
  const [defaultEngine, setDefaultEngine] = useState(
    () => localStorage.getItem("nomad-engine") || "groq"
  );
  const [defaultLang, setDefaultLang] = useState(
    () => localStorage.getItem("nomad-lang") || "fr"
  );

  function handleEngineChange(value) {
    setDefaultEngine(value);
    localStorage.setItem("nomad-engine", value);
  }

  function handleLangChange(value) {
    setDefaultLang(value);
    localStorage.setItem("nomad-lang", value);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Réglages</h1>
        <p className="text-sm text-muted-foreground">
          Préférences de l'application
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Apparence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Mode sombre OLED</Label>
              <p className="text-xs text-muted-foreground">
                Fond noir pur pour écrans OLED
              </p>
            </div>
            <Switch
              checked={mode === "dark"}
              onCheckedChange={toggle}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Transcription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Moteur par défaut</Label>
              <p className="text-xs text-muted-foreground">
                Utilisé pour les nouvelles captures
              </p>
            </div>
            <Select value={defaultEngine} onValueChange={handleEngineChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="groq">Groq Whisper</SelectItem>
                <SelectItem value="deepgram">Deepgram</SelectItem>
                <SelectItem value="wynona">WYNONA</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Langue par défaut</Label>
              <p className="text-xs text-muted-foreground">
                Langue de transcription
              </p>
            </div>
            <Select value={defaultLang} onValueChange={handleLangChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="auto">Auto-detect</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
