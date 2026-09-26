import { useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";

type WeeklyAction = Tables<"goal_weekly_actions">;
type Milestone = Tables<"goal_milestones">;

export interface WeeklyActionEditValues {
  title: string;
  milestoneId: string | null;
  estimatedMinutes: number;
  notes: string;
}

export function WeeklyActionEditDialog({
  action,
  milestones,
  onSave,
}: {
  action: WeeklyAction;
  milestones: Milestone[];
  onSave: (values: WeeklyActionEditValues) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    title: action.title,
    milestoneId: action.milestone_id ?? "none",
    estimatedMinutes: String(action.estimated_minutes ?? 0),
    notes: action.notes ?? "",
  });

  useEffect(() => {
    if (!open) {
      setDraft({
        title: action.title,
        milestoneId: action.milestone_id ?? "none",
        estimatedMinutes: String(action.estimated_minutes ?? 0),
        notes: action.notes ?? "",
      });
    }
  }, [action, open]);

  const save = async () => {
    const minutes = Number(draft.estimatedMinutes || 0);
    if (!draft.title.trim() || !Number.isFinite(minutes) || minutes < 0 || minutes > 10080) return;

    setSaving(true);
    const saved = await onSave({
      title: draft.title.trim(),
      milestoneId: draft.milestoneId === "none" ? null : draft.milestoneId,
      estimatedMinutes: minutes,
      notes: draft.notes.trim(),
    });
    setSaving(false);

    if (saved) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="icon" variant="ghost" aria-label="Edit weekly action">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit weekly action</DialogTitle>
          <DialogDescription>
            Adjust the weekly bridge between this goal and its daily execution tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Weekly action</Label>
            <Input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Milestone <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Select
              value={draft.milestoneId}
              onValueChange={(milestoneId) => setDraft((current) => ({ ...current, milestoneId }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No milestone</SelectItem>
                {milestones.map((milestone) => (
                  <SelectItem key={milestone.id} value={milestone.id}>{milestone.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Estimated effort</Label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                max="10080"
                step="15"
                value={draft.estimatedMinutes}
                onChange={(event) => setDraft((current) => ({ ...current, estimatedMinutes: event.target.value }))}
                className="pr-12"
              />
              <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">min</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              maxLength={4000}
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !draft.title.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
