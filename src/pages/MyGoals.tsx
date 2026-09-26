import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers3,
  Plus,
  Save,
  Target,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { GoalAIRefinementDialog } from "@/components/GoalAIRefinementDialog";
import { GoalCapacityChecker } from "@/components/GoalCapacityChecker";

type Goal = Tables<"goals">;
type GoalMilestone = Tables<"goal_milestones">;

type GoalPriority = "primary" | "maintenance" | "later";
type GoalStatus = "draft" | "active" | "paused" | "completed" | "archived";

interface DraftGoal {
  tempId: string;
  title: string;
  description: string;
  life_area: string;
  start_date: string;
  end_date: string;
  priority: GoalPriority;
  status: GoalStatus;
  estimated_hours_per_week: string;
}

const LIFE_AREAS = [
  "Academic",
  "Career/Business",
  "Finance",
  "Health",
  "Spiritual",
  "Relationships",
  "Family",
  "Personal Development",
  "Service/Impact",
  "Other",
];

const stripGoalPrefix = (value: string) =>
  value.replace(/^\s*(?:(?:\d+)[.)]|[-*•])\s*/, "").trim();

const hasValidDateWindow = (startDate?: string | null, endDate?: string | null) =>
  !startDate || !endDate || endDate >= startDate;

const overlaps = (a: Goal, b: Goal) => {
  if (!a.start_date || !b.start_date) return false;
  const aEnd = a.end_date ?? "9999-12-31";
  const bEnd = b.end_date ?? "9999-12-31";
  return a.start_date <= bEnd && b.start_date <= aEnd;
};

const priorityLabel: Record<GoalPriority, string> = {
  primary: "Primary",
  maintenance: "Maintenance",
  later: "Later",
};

const statusLabel: Record<GoalStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

function DraftGoalCard({
  draft,
  index,
  onChange,
  onRemove,
}: {
  draft: DraftGoal;
  index: number;
  onChange: (next: DraftGoal) => void;
  onRemove: () => void;
}) {
  const dateInvalid = !hasValidDateWindow(draft.start_date || null, draft.end_date || null);

  return (
    <Card className="border-primary/15 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
              {index + 1}
            </div>
            <div>
              <CardTitle className="text-lg">Goal {index + 1}</CardTitle>
              <p className="text-xs text-muted-foreground">Give this goal its own planning window.</p>
            </div>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label="Remove goal">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Goal</Label>
          <Input value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            placeholder="What does this goal involve?"
            className="min-h-[84px]"
          />
        </div>

        <div className="space-y-2">
          <Label>Life area</Label>
          <Select value={draft.life_area} onValueChange={(value) => onChange({ ...draft, life_area: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LIFE_AREAS.map((area) => <SelectItem key={area} value={area}>{area}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Priority</Label>
          <Select
            value={draft.priority}
            onValueChange={(value: GoalPriority) => onChange({ ...draft, priority: value })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="primary">Primary</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="later">Later</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Start date</Label>
          <Input
            type="date"
            value={draft.start_date}
            onChange={(e) => onChange({ ...draft, start_date: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>End date / deadline</Label>
          <Input
            type="date"
            min={draft.start_date || undefined}
            value={draft.end_date}
            onChange={(e) => onChange({ ...draft, end_date: e.target.value })}
          />
          {dateInvalid && <p className="text-xs text-destructive">End date cannot be before start date.</p>}
        </div>

        <div className="space-y-2">
          <Label>Estimated effort</Label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              max="168"
              step="0.5"
              value={draft.estimated_hours_per_week}
              onChange={(e) => onChange({ ...draft, estimated_hours_per_week: e.target.value })}
              className="pr-20"
            />
            <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">hrs/week</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={draft.status} onValueChange={(value: GoalStatus) => onChange({ ...draft, status: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function GoalCard({
  goal,
  milestones,
  overlapCount,
  onSaved,
  onDeleted,
  onMilestonesChanged,
}: {
  goal: Goal;
  milestones: GoalMilestone[];
  overlapCount: number;
  onSaved: (goal: Goal) => void;
  onDeleted: (goalId: string) => void;
  onMilestonesChanged: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState({
    title: goal.title,
    description: goal.description,
    life_area: goal.life_area,
    start_date: goal.start_date ?? "",
    end_date: goal.end_date ?? "",
    priority: goal.priority as GoalPriority,
    status: goal.status as GoalStatus,
    estimated_hours_per_week: String(goal.estimated_hours_per_week ?? 0),
    success_definition: goal.success_definition,
  });
  const [saving, setSaving] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);

  useEffect(() => {
    setDraft({
      title: goal.title,
      description: goal.description,
      life_area: goal.life_area,
      start_date: goal.start_date ?? "",
      end_date: goal.end_date ?? "",
      priority: goal.priority as GoalPriority,
      status: goal.status as GoalStatus,
      estimated_hours_per_week: String(goal.estimated_hours_per_week ?? 0),
      success_definition: goal.success_definition,
    });
  }, [goal]);

  const saveGoal = async () => {
    if (!draft.title.trim()) {
      toast({ title: "Goal title is required", variant: "destructive" });
      return;
    }
    if (!hasValidDateWindow(draft.start_date || null, draft.end_date || null)) {
      toast({ title: "Check the goal dates", description: "End date cannot be before start date.", variant: "destructive" });
      return;
    }

    const hours = Number(draft.estimated_hours_per_week || 0);
    if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
      toast({ title: "Check weekly effort", description: "Hours per week must be between 0 and 168.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("goals")
      .update({
        title: draft.title.trim(),
        description: draft.description.trim(),
        life_area: draft.life_area,
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        priority: draft.priority,
        status: draft.status,
        estimated_hours_per_week: hours,
        effort_source: "user_confirmed",
        success_definition: draft.success_definition.trim(),
      })
      .eq("id", goal.id)
      .select("*")
      .single();

    setSaving(false);
    if (error) {
      toast({ title: "Goal could not be saved", description: error.message, variant: "destructive" });
      return;
    }

    onSaved(data);
    toast({ title: "Goal updated" });
  };

  const deleteGoal = async () => {
    if (!window.confirm("Delete this goal and its milestones?")) return;
    const { error } = await supabase.from("goals").delete().eq("id", goal.id);
    if (error) {
      toast({ title: "Goal could not be deleted", description: error.message, variant: "destructive" });
      return;
    }
    onDeleted(goal.id);
  };

  const addMilestone = async () => {
    if (!milestoneTitle.trim()) return;
    if (milestoneDate && goal.start_date && milestoneDate < goal.start_date) {
      toast({ title: "Milestone falls before the goal starts", variant: "destructive" });
      return;
    }
    if (milestoneDate && goal.end_date && milestoneDate > goal.end_date) {
      toast({ title: "Milestone falls after the goal ends", variant: "destructive" });
      return;
    }

    setAddingMilestone(true);
    const { error } = await supabase.from("goal_milestones").insert({
      goal_id: goal.id,
      title: milestoneTitle.trim(),
      due_date: milestoneDate || null,
      display_order: milestones.length,
    });
    setAddingMilestone(false);

    if (error) {
      toast({ title: "Milestone could not be added", description: error.message, variant: "destructive" });
      return;
    }

    setMilestoneTitle("");
    setMilestoneDate("");
    onMilestonesChanged();
  };

  const toggleMilestone = async (milestone: GoalMilestone) => {
    const nextStatus = milestone.status === "completed" ? "planned" : "completed";
    const { error } = await supabase
      .from("goal_milestones")
      .update({ status: nextStatus })
      .eq("id", milestone.id);
    if (error) {
      toast({ title: "Milestone could not be updated", description: error.message, variant: "destructive" });
      return;
    }
    onMilestonesChanged();
  };

  const deleteMilestone = async (milestoneId: string) => {
    const { error } = await supabase.from("goal_milestones").delete().eq("id", milestoneId);
    if (error) {
      toast({ title: "Milestone could not be deleted", description: error.message, variant: "destructive" });
      return;
    }
    onMilestonesChanged();
  };

  const dateInvalid = !hasValidDateWindow(draft.start_date || null, draft.end_date || null);

  return (
    <Card className="overflow-hidden border-border">
      <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-secondary/5 to-transparent">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant="outline">{draft.life_area}</Badge>
              <Badge>{priorityLabel[draft.priority]}</Badge>
              <Badge variant="secondary">{statusLabel[draft.status]}</Badge>
              {overlapCount > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600">
                  <Layers3 className="h-3 w-3" />
                  overlaps {overlapCount} {overlapCount === 1 ? "goal" : "goals"}
                </Badge>
              )}
            </div>
            <CardTitle className="break-words text-xl">{goal.title}</CardTitle>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={deleteGoal} aria-label="Delete goal">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Goal title</Label>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="What does success require?"
              className="min-h-[84px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Life area</Label>
            <Select value={draft.life_area} onValueChange={(value) => setDraft({ ...draft, life_area: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LIFE_AREAS.map((area) => <SelectItem key={area} value={area}>{area}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={draft.priority} onValueChange={(value: GoalPriority) => setDraft({ ...draft, priority: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="later">Later</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Start date</Label>
            <Input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>End date / deadline</Label>
            <Input
              type="date"
              min={draft.start_date || undefined}
              value={draft.end_date}
              onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
            />
            {dateInvalid && <p className="text-xs text-destructive">End date cannot be before start date.</p>}
          </div>

          <div className="space-y-2">
            <Label>Estimated effort</Label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                max="168"
                step="0.5"
                value={draft.estimated_hours_per_week}
                onChange={(e) => setDraft({ ...draft, estimated_hours_per_week: e.target.value })}
                className="pr-20"
              />
              <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">hrs/week</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {goal.effort_source === "ai_estimate_confirmed"
                ? "AI estimate confirmed by you."
                : goal.effort_source === "user_confirmed"
                  ? "Confirmed by you."
                  : "Not yet confirmed. Saving this field will confirm it as your planning commitment."}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={draft.status} onValueChange={(value: GoalStatus) => setDraft({ ...draft, status: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>How will you know this goal is achieved? <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={draft.success_definition}
              onChange={(e) => setDraft({ ...draft, success_definition: e.target.value })}
              placeholder="Define the finish line."
              className="min-h-[72px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <GoalAIRefinementDialog
            goal={goal}
            milestones={milestones}
            onApplied={onMilestonesChanged}
          />
          <Button onClick={saveGoal} disabled={saving || dateInvalid} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save goal"}
          </Button>
        </div>

        <div className="border-t pt-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Milestones</h4>
              <p className="text-xs text-muted-foreground">Break the goal window into meaningful checkpoints.</p>
            </div>
            <Badge variant="secondary">{milestones.length}</Badge>
          </div>

          {milestones.length > 0 && (
            <div className="mb-4 space-y-2">
              {milestones.map((milestone) => (
                <div key={milestone.id} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                  <button
                    type="button"
                    onClick={() => toggleMilestone(milestone)}
                    className="mt-0.5 shrink-0 text-primary"
                    aria-label={milestone.status === "completed" ? "Mark milestone planned" : "Mark milestone completed"}
                  >
                    {milestone.status === "completed"
                      ? <CheckCircle2 className="h-5 w-5" />
                      : <Target className="h-5 w-5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={milestone.status === "completed" ? "text-sm line-through text-muted-foreground" : "text-sm font-medium"}>
                      {milestone.title}
                    </p>
                    {milestone.due_date && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />
                        {milestone.due_date}
                      </p>
                    )}
                  </div>
                  <Button type="button" size="icon" variant="ghost" onClick={() => deleteMilestone(milestone.id)} aria-label="Delete milestone">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_170px_auto]">
            <Input
              value={milestoneTitle}
              onChange={(e) => setMilestoneTitle(e.target.value)}
              placeholder="Add a milestone"
            />
            <Input
              type="date"
              min={goal.start_date ?? undefined}
              max={goal.end_date ?? undefined}
              value={milestoneDate}
              onChange={(e) => setMilestoneDate(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={addMilestone} disabled={addingMilestone || !milestoneTitle.trim()} className="gap-2">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyGoals() {
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<GoalMilestone[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [draftGoals, setDraftGoals] = useState<DraftGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDrafts, setSavingDrafts] = useState(false);

  const loadPortfolio = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: goalRows, error: goalError } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .neq("status", "archived")
      .order("created_at", { ascending: true });

    if (goalError) {
      setLoading(false);
      toast({
        title: "Goal portfolio is not ready yet",
        description: goalError.message,
        variant: "destructive",
      });
      return;
    }

    const loadedGoals = goalRows ?? [];
    setGoals(loadedGoals);

    if (!loadedGoals.length) {
      setMilestones([]);
      setLoading(false);
      return;
    }

    const { data: milestoneRows, error: milestoneError } = await supabase
      .from("goal_milestones")
      .select("*")
      .in("goal_id", loadedGoals.map((goal) => goal.id))
      .order("display_order", { ascending: true });

    if (milestoneError) {
      toast({ title: "Milestones could not be loaded", description: milestoneError.message, variant: "destructive" });
    } else {
      setMilestones(milestoneRows ?? []);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadPortfolio();
  }, []);

  const buildDraftCards = () => {
    const titles = bulkInput
      .split(/\n+/)
      .map(stripGoalPrefix)
      .filter(Boolean)
      .slice(0, 20);

    if (!titles.length) {
      toast({ title: "Add at least one goal", description: "Put each goal on a separate line.", variant: "destructive" });
      return;
    }

    setDraftGoals(
      titles.map((title, index) => ({
        tempId: `${Date.now()}-${index}`,
        title,
        description: "",
        life_area: "Other",
        start_date: "",
        end_date: "",
        priority: "primary",
        status: "draft",
        estimated_hours_per_week: "0",
      }))
    );
  };

  const saveDraftGoals = async () => {
    const invalidDate = draftGoals.find((goal) => !hasValidDateWindow(goal.start_date || null, goal.end_date || null));
    if (invalidDate) {
      toast({ title: "Check goal dates", description: `"${invalidDate.title}" ends before it starts.`, variant: "destructive" });
      return;
    }

    const invalidHours = draftGoals.find((goal) => {
      const hours = Number(goal.estimated_hours_per_week || 0);
      return !Number.isFinite(hours) || hours < 0 || hours > 168;
    });
    if (invalidHours) {
      toast({ title: "Check weekly effort", description: `"${invalidHours.title}" has an invalid hours/week value.`, variant: "destructive" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSavingDrafts(true);
    const { error } = await supabase.from("goals").insert(
      draftGoals.map((goal) => ({
        user_id: user.id,
        title: goal.title.trim(),
        description: goal.description.trim(),
        life_area: goal.life_area,
        start_date: goal.start_date || null,
        end_date: goal.end_date || null,
        priority: goal.priority,
        status: goal.status,
        estimated_hours_per_week: Number(goal.estimated_hours_per_week || 0),
        effort_source: Number(goal.estimated_hours_per_week || 0) > 0 ? "user_confirmed" : "unknown",
      }))
    );
    setSavingDrafts(false);

    if (error) {
      toast({ title: "Goals could not be saved", description: error.message, variant: "destructive" });
      return;
    }

    setDraftGoals([]);
    setBulkInput("");
    toast({ title: "Goals added to your portfolio", description: `${draftGoals.length} goal${draftGoals.length === 1 ? "" : "s"} saved.` });
    await loadPortfolio();
  };

  const today = new Date().toISOString().slice(0, 10);
  const activeNow = goals.filter((goal) => {
    if (goal.status !== "active") return false;
    if (goal.start_date && goal.start_date > today) return false;
    if (goal.end_date && goal.end_date < today) return false;
    return true;
  });

  const currentWeeklyDemand = activeNow.reduce((sum, goal) => sum + Number(goal.estimated_hours_per_week || 0), 0);
  const scheduledGoals = goals.filter((goal) => goal.start_date && goal.end_date).length;
  const overlappingGoals = useMemo(
    () => goals.filter((goal, index) => goals.some((other, otherIndex) => index !== otherIndex && overlaps(goal, other))).length,
    [goals]
  );

  const milestonesForGoal = (goalId: string) => milestones.filter((milestone) => milestone.goal_id === goalId);

  if (loading) {
    return (
      <main className="min-h-screen pt-28 pb-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-6xl animate-pulse space-y-5">
            <div className="h-12 w-64 rounded bg-muted" />
            <div className="h-40 rounded-2xl bg-muted" />
            <div className="h-72 rounded-2xl bg-muted" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-28 pb-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              <Layers3 className="h-4 w-4" />
              Goal portfolio
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              My <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">GOALS</span>
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
              One portfolio for every goal you are pursuing. Each goal gets its own start date, end date, priority,
              milestones and workload so overlapping goals can eventually share one realistic calendar.
            </p>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Portfolio goals</p><p className="mt-1 text-3xl font-bold">{goals.length}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Active now</p><p className="mt-1 text-3xl font-bold text-primary">{activeNow.length}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Current goal demand</p><p className="mt-1 text-3xl font-bold">{currentWeeklyDemand.toFixed(1)}h</p><p className="text-xs text-muted-foreground">per week</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Overlapping goals</p><p className="mt-1 text-3xl font-bold">{overlappingGoals}</p><p className="text-xs text-muted-foreground">{scheduledGoals} fully scheduled</p></CardContent></Card>
          </div>

          <GoalCapacityChecker goals={goals} />

          <Card className="mb-8 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Add multiple goals at once
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Put one goal on each line. Numbered lists and bullets are fine. We will turn them into separate editable goal cards.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder={"1. Complete my research project\n2. Save ₦500,000\n3. Exercise three times weekly\n4. Launch my business"}
                className="min-h-[150px]"
              />
              <div className="flex flex-wrap gap-3">
                <Button onClick={buildDraftCards} className="gap-2">
                  <Layers3 className="h-4 w-4" />
                  Create goal cards
                </Button>
                {bulkInput && (
                  <Button variant="ghost" onClick={() => { setBulkInput(""); setDraftGoals([]); }}>
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {draftGoals.length > 0 && (
            <section className="mb-10 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Review before saving</h2>
                  <p className="text-sm text-muted-foreground">
                    Dates can overlap. That is intentional — the capacity checker will handle simultaneous goals in the next stage.
                  </p>
                </div>
                <Button onClick={saveDraftGoals} disabled={savingDrafts || draftGoals.some((goal) => !goal.title.trim())} className="gap-2">
                  <Save className="h-4 w-4" />
                  {savingDrafts ? "Saving..." : `Save ${draftGoals.length} goals`}
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {draftGoals.map((draft, index) => (
                  <DraftGoalCard
                    key={draft.tempId}
                    draft={draft}
                    index={index}
                    onChange={(next) => setDraftGoals((current) => current.map((item) => item.tempId === draft.tempId ? next : item))}
                    onRemove={() => setDraftGoals((current) => current.filter((item) => item.tempId !== draft.tempId))}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">Your portfolio</h2>
                <p className="text-sm text-muted-foreground">
                  Edit goals independently. A January–November goal can run at the same time as a February–March goal.
                </p>
              </div>
              {overlappingGoals > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  Overlap detected — expected, not an error.
                </div>
              )}
            </div>

            {goals.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 rounded-full bg-primary/10 p-4">
                    <Target className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Your portfolio is empty</h3>
                  <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                    Add several goals above. They will remain independent goals even when their dates overlap.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {goals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    milestones={milestonesForGoal(goal.id)}
                    overlapCount={goals.filter((other) => other.id !== goal.id && overlaps(goal, other)).length}
                    onSaved={(updated) => setGoals((current) => current.map((item) => item.id === updated.id ? updated : item))}
                    onDeleted={(goalId) => {
                      setGoals((current) => current.filter((item) => item.id !== goalId));
                      setMilestones((current) => current.filter((item) => item.goal_id !== goalId));
                    }}
                    onMilestonesChanged={() => void loadPortfolio()}
                  />
                ))}
              </div>
            )}
          </section>

          <Card className="mt-8 border-secondary/20 bg-secondary/5">
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
              <div className="rounded-full bg-secondary/10 p-3">
                <Clock3 className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <h3 className="font-semibold">Built for overlapping goals</h3>
                <p className="text-sm text-muted-foreground">
                  Confirmed workloads, changing effort phases, overlapping goals and date-specific capacity can now be compared in one deterministic timeline.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
