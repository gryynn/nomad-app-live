import { useSearchParams, useNavigate } from "react-router-dom";
import { Mic, Radio, Upload, ClipboardPaste, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function CapturePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialMode = searchParams.get("mode") || "rec";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:hidden"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Capture</h1>
          <p className="text-sm text-muted-foreground">
            Nouvelle session audio
          </p>
        </div>
      </div>

      <Tabs defaultValue={initialMode} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="rec" className="gap-1.5">
            <Mic className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">REC</span>
          </TabsTrigger>
          <TabsTrigger value="live" className="gap-1.5">
            <Radio className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">LIVE</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
          </TabsTrigger>
          <TabsTrigger value="paste" className="gap-1.5">
            <ClipboardPaste className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Paste</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rec">
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center gap-6 py-16">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary/30">
                <Mic className="h-10 w-10 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Appuyez pour commencer l'enregistrement
              </p>
              <Button size="lg" className="gap-2">
                <Mic className="h-4 w-4" />
                Enregistrer
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live">
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center gap-6 py-16">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary/30">
                <Radio className="h-10 w-10 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Transcription en temps réel
              </p>
              <Button size="lg" className="gap-2">
                <Radio className="h-4 w-4" />
                Démarrer
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import">
          <Card className="border-border/50 border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-16">
              <Upload className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-center">
                <p className="text-sm font-medium">Glissez un fichier audio ici</p>
                <p className="text-xs text-muted-foreground">
                  ou cliquez pour parcourir — MP3, WAV, M4A, FLAC
                </p>
              </div>
              <Button variant="outline" size="sm">
                Parcourir
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paste">
          <Card className="border-border/50">
            <CardContent className="space-y-4 py-6">
              <Textarea
                placeholder="Collez votre texte ici..."
                className="min-h-[200px] font-mono text-sm"
              />
              <div className="flex justify-end">
                <Button size="sm" className="gap-1.5">
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Sauvegarder
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
