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
import type { Tables } from "@/integrations/supabase/types";

type Milestone = Tables<"goal_milestones">;

export interface MilestoneEditValues {
  title: string;
  dueDate: string;
}

export function MilestoneEditDialog({
  milestone,
  goalStart,
  goalEnd,
  onSave,
}: {
  milestone: Milestone;
  goalStart?: string | null;
  goalEnd?: string | null;
  onSave: (values: MilestoneEditValues) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    title: milestone.title,
    dueDate: milestone.due_date ?? "",
  });

  useEffect(() => {
    if (!open) {
      setDraft({
        title: milestone.title,
        dueDate: milestone.due_date ?? "",
      });
    }
  }, [milestone, open]);

  const save = async () => {
    if (!draft.title.trim()) return;
    if (goalStart && draft.dueDate && draft.dueDate < goalStart) return;
    if (goalEnd && draft.dueDate && draft.dueDate > goalEnd) return;

    setSaving(true);
    const saved = await onSave({
      title: draft.title.trim(),
      dueDate: draft.dueDate,
    });
    setSaving(false);

    if (saved) setOpen(false);
  };

  const invalid =
    Boolean(goalStart && draft.dueDate && draft.dueDate < goalStart) ||
    Boolean(goalEnd && draft.dueDate && draft.dueDate > goalEnd);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Edit milestone"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit milestone</DialogTitle>
          <DialogDescription>
            Adjust this checkpoint without changing its goal or execution lineage.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Milestone</Label>
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Due date <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              type="date"
              min={goalStart ?? undefined}
              max={goalEnd ?? undefined}
              value={draft.dueDate}
              onChange={(event) =>
                setDraft((current) => ({ ...current, dueDate: event.target.value }))
              }
            />
            {invalid && (
              <p className="text-xs text-destructive">
                The milestone date must stay inside the goal window.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !draft.title.trim() || invalid}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
