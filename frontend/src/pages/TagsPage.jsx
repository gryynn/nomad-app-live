import { useState, useEffect } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTags, createTag } from "@/lib/api";

export default function TagsPage() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", emoji: "", hue: "#D8CAA0" });

  useEffect(() => {
    loadTags();
  }, []);

  async function loadTags() {
    try {
      const data = await getTags();
      setTags(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      console.error("Tags load error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      await createTag(form);
      setDialogOpen(false);
      setForm({ name: "", emoji: "", hue: "#D8CAA0" });
      loadTags();
    } catch (err) {
      console.error("Tag create error:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Tags</h1>
          <p className="text-sm text-muted-foreground">
            {tags.length} tag{tags.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nouveau
        </Button>
      </div>

      <Card className="border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Emoji</TableHead>
              <TableHead>Couleur</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                  Aucun tag
                </TableCell>
              </TableRow>
            ) : (
              tags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: tag.hue ? `${tag.hue}20` : undefined,
                          color: tag.hue || undefined,
                        }}
                      >
                        {tag.emoji} {tag.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-lg">{tag.emoji}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: tag.hue }}
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        {tag.hue}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Pencil className="mr-2 h-4 w-4" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Tag Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Insight"
              />
            </div>
            <div className="space-y-2">
              <Label>Emoji</Label>
              <Input
                value={form.emoji}
                onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                placeholder="Ex: 🧠"
              />
            </div>
            <div className="space-y-2">
              <Label>Couleur</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.hue}
                  onChange={(e) => setForm((f) => ({ ...f, hue: e.target.value }))}
                  className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
                />
                <Input
                  value={form.hue}
                  onChange={(e) => setForm((f) => ({ ...f, hue: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </div>
            {/* Preview */}
            {form.name && (
              <div>
                <Label className="text-muted-foreground">Aperçu</Label>
                <div className="mt-1">
                  <span
                    className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: form.hue ? `${form.hue}20` : undefined,
                      color: form.hue || undefined,
                    }}
                  >
                    {form.emoji} {form.name}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={!form.name}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
