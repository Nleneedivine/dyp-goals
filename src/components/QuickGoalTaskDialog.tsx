import { useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { Loader2, Plus } from "lucide-react";
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

type Goal = Tables<"goals">;
type Milestone = Tables<"goal_milestones">;
type WeeklyAction = Tables<"goal_weekly_actions">;

export interface QuickGoalTaskValues {
  goalId: string;
  milestoneId: string | null;
  weeklyActionId: string | null;
  title: string;
  scheduledDate: string;
  scheduledTime: string;
  estimatedMinutes: number;
  notes: string;
}

const mondayKey = (date: string) =>
  format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");

export function QuickGoalTaskDialog({
  selectedDate,
  goals,
  milestones,
  actions,
  onCreate,
}: {
  selectedDate: string;
  goals: Goal[];
  milestones: Milestone[];
  actions: WeeklyAction[];
  onCreate: (values: QuickGoalTaskValues) => Promise<boolean>;
}) {
  const firstGoalId = goals[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    goalId: firstGoalId,
    milestoneId: "none",
    weeklyActionId: "none",
    title: "",
    scheduledDate: selectedDate,
    scheduledTime: "",
    estimatedMinutes: "30",
    notes: "",
  });

  useEffect(() => {
    if (!open) {
      setDraft((current) => ({
        ...current,
        goalId: goals.some((goal) => goal.id === current.goalId) ? current.goalId : firstGoalId,
        milestoneId: "none",
        weeklyActionId: "none",
        title: "",
        scheduledDate: selectedDate,
        scheduledTime: "",
        estimatedMinutes: "30",
        notes: "",
      }));
    }
  }, [open, selectedDate, firstGoalId, goals]);

  const goal = goals.find((item) => item.id === draft.goalId) ?? null;
  const goalMilestones = milestones.filter((milestone) => milestone.goal_id === draft.goalId);
  const selectedWeekStart = draft.scheduledDate ? mondayKey(draft.scheduledDate) : "";
  const goalActions = useMemo(
    () =>
      actions.filter(
        (action) =>
          action.goal_id === draft.goalId &&
          action.week_start === selectedWeekStart &&
          action.status !== "skipped" &&
          action.status !== "deferred",
      ),
    [actions, draft.goalId, selectedWeekStart],
  );

  const save = async () => {
    const minutes = Number(draft.estimatedMinutes || 0);
    if (
      !draft.goalId ||
      !draft.title.trim() ||
      !draft.scheduledDate ||
      !Number.isFinite(minutes) ||
      minutes < 0 ||
      minutes > 1440
    ) return;

    setSaving(true);
    const saved = await onCreate({
      goalId: draft.goalId,
      milestoneId: draft.milestoneId === "none" ? null : draft.milestoneId,
      weeklyActionId: draft.weeklyActionId === "none" ? null : draft.weeklyActionId,
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
        <Button className="gap-2" disabled={!goals.length}>
          <Plus className="h-4 w-4" />
          Add task
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a goal-linked task</DialogTitle>
          <DialogDescription>
            Add execution directly from Today. Capacity, goal dates and timed conflicts are checked before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Goal</Label>
            <Select
              value={draft.goalId}
              onValueChange={(goalId) =>
                setDraft((current) => ({
                  ...current,
                  goalId,
                  milestoneId: "none",
                  weeklyActionId: "none",
                }))
              }
            >
              <SelectTrigger><SelectValue placeholder="Choose goal" /></SelectTrigger>
              <SelectContent>
                {goals.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Weekly action <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Select
                value={draft.weeklyActionId}
                onValueChange={(weeklyActionId) => {
                  const action = weeklyActionId === "none"
                    ? null
                    : goalActions.find((item) => item.id === weeklyActionId) ?? null;
                  setDraft((current) => ({
                    ...current,
                    weeklyActionId,
                    milestoneId: action?.milestone_id ?? current.milestoneId,
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No weekly action</SelectItem>
                  {goalActions.map((action) => (
                    <SelectItem key={action.id} value={action.id}>{action.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {goalMilestones.map((milestone) => (
                    <SelectItem key={milestone.id} value={milestone.id}>{milestone.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Task</Label>
            <Input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="What will you actually do?"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                min={goal?.start_date ?? undefined}
                max={goal?.end_date ?? undefined}
                value={draft.scheduledDate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    scheduledDate: event.target.value,
                    weeklyActionId: "none",
                  }))
                }
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
            <div className="space-y-2">
              <Label>Duration</Label>
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
          </div>

          <div className="space-y-2">
            <Label>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              maxLength={4000}
              className="min-h-[90px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !draft.goalId || !draft.title.trim() || !draft.scheduledDate}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
