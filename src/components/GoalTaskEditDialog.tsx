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
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";

type GoalTask = Tables<"goal_tasks">;

export interface GoalTaskEditValues {
  title: string;
  scheduledDate: string;
  scheduledTime: string;
  estimatedMinutes: number;
  notes: string;
}

export function GoalTaskEditDialog({
  task,
  goalStart,
  goalEnd,
  onSave,
  triggerVariant = "ghost",
}: {
  task: GoalTask;
  goalStart?: string | null;
  goalEnd?: string | null;
  onSave: (values: GoalTaskEditValues) => Promise<boolean>;
  triggerVariant?: "ghost" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    title: task.title,
    scheduledDate: task.scheduled_date ?? "",
    scheduledTime: task.scheduled_time?.slice(0, 5) ?? "",
    estimatedMinutes: String(task.estimated_minutes ?? 0),
    notes: task.notes ?? "",
  });

  useEffect(() => {
    if (!open) {
      setDraft({
        title: task.title,
        scheduledDate: task.scheduled_date ?? "",
        scheduledTime: task.scheduled_time?.slice(0, 5) ?? "",
        estimatedMinutes: String(task.estimated_minutes ?? 0),
        notes: task.notes ?? "",
      });
    }
  }, [task, open]);

  const save = async () => {
    const minutes = Number(draft.estimatedMinutes || 0);
    if (!draft.title.trim() || !Number.isFinite(minutes) || minutes < 0 || minutes > 1440) return;

    setSaving(true);
    const saved = await onSave({
      title: draft.title.trim(),
      scheduledDate: draft.scheduledDate,
      scheduledTime: draft.scheduledTime,
      estimatedMinutes: minutes,
      notes: draft.notes.trim(),
    });
    setSaving(false);

    if (saved) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={triggerVariant}
          aria-label="Edit task"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            Adjust the task without breaking its goal, milestone or weekly-action lineage.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Task</Label>
            <Input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                min={goalStart ?? undefined}
                max={goalEnd ?? undefined}
                value={draft.scheduledDate}
                onChange={(event) => setDraft((current) => ({ ...current, scheduledDate: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Time <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                type="time"
                value={draft.scheduledTime}
                onChange={(event) => setDraft((current) => ({ ...current, scheduledTime: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Estimated duration</Label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                max="1440"
                step="5"
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
              className="min-h-[100px]"
              maxLength={4000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !draft.title.trim()}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
