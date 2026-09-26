import { useMemo, useState } from "react";
import { Brain, CalendarDays, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type Milestone = Tables<"goal_milestones">;
type WeeklyAction = Tables<"goal_weekly_actions">;
type GoalTask = Tables<"goal_tasks">;

interface DraftTask {
  title: string;
  scheduledDate: string;
  estimatedMinutes: number;
  notes: string;
}

interface DraftAction {
  goalId: string;
  milestoneId: string | null;
  title: string;
  estimatedMinutes: number;
  notes: string;
  tasks: DraftTask[];
}

interface GeneratedWeekPlan {
  planNote: string;
  warnings: string[];
  actions: DraftAction[];
}

const CONFIRMED_EFFORT = new Set(["user_confirmed", "ai_estimate_confirmed"]);

export function AIWeekPlannerDialog({
  weekStart,
  weekEnd,
  capacityHours,
  goals,
  milestones,
  actions,
  tasks,
  onApplied,
}: {
  weekStart: string;
  weekEnd: string;
  capacityHours: number | null;
  goals: Goal[];
  milestones: Milestone[];
  actions: WeeklyAction[];
  tasks: GoalTask[];
  onApplied: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<GeneratedWeekPlan | null>(null);

  const eligibleGoals = useMemo(
    () =>
      goals.filter(
        (goal) =>
          (goal.status === "draft" || goal.status === "active") &&
          CONFIRMED_EFFORT.has(goal.effort_source) &&
          (!goal.start_date || goal.start_date <= weekEnd) &&
          (!goal.end_date || goal.end_date >= weekStart) &&
          Number(goal.estimated_hours_per_week || 0) > 0,
      ),
    [goals, weekStart, weekEnd],
  );

  const existingWeekActions = useMemo(
    () => actions.filter((action) => action.week_start === weekStart),
    [actions, weekStart],
  );

  const existingWeekTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          Boolean(task.scheduled_date && task.scheduled_date >= weekStart && task.scheduled_date <= weekEnd),
      ),
    [tasks, weekStart, weekEnd],
  );

  const committedMinutes = eligibleGoals.reduce(
    (sum, goal) => sum + Math.round(Number(goal.estimated_hours_per_week || 0) * 60),
    0,
  );
  const capacityMinutes = capacityHours === null ? null : Math.round(capacityHours * 60);
  const portfolioOverCapacity =
    capacityMinutes !== null && committedMinutes > capacityMinutes + 1;

  const goalMap = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal])),
    [goals],
  );

  const reset = () => {
    setPlan(null);
    setGenerating(false);
    setApplying(false);
  };

  const generate = async () => {
    if (capacityHours === null) {
      toast({
        title: "Set weekly capacity first",
        description: "The AI planner needs your confirmed capacity before it can draft a realistic week.",
        variant: "destructive",
      });
      return;
    }

    if (portfolioOverCapacity) {
      toast({
        title: "Resolve portfolio pressure first",
        description: "Confirmed goal demand is above your weekly capacity. The planner will not choose which goal to reduce.",
        variant: "destructive",
      });
      return;
    }

    if (!eligibleGoals.length) {
      toast({
        title: "No confirmed goals to plan",
        description: "Confirm weekly effort and planning dates in My GOALS first.",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    setPlan(null);

    const { data: reviewData, error: reviewError } = await supabase
      .from("goal_weekly_reviews")
      .select("week_start, planned_minutes, completed_minutes, blockers, adjustments")
      .lt("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(4);

    if (reviewError) {
      setGenerating(false);
      toast({
        title: "Execution history could not be loaded",
        description: reviewError.message,
        variant: "destructive",
      });
      return;
    }

    const eligibleIds = new Set(eligibleGoals.map((goal) => goal.id));
    const relevantMilestones = milestones.filter(
      (milestone) => eligibleIds.has(milestone.goal_id),
    );

    const { data, error } = await supabase.functions.invoke("generate-week-plan", {
      body: {
        weekStart,
        weekEnd,
        capacityHours,
        goals: eligibleGoals.map((goal) => ({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          lifeArea: goal.life_area,
          priority: goal.priority,
          startDate: goal.start_date,
          endDate: goal.end_date,
          weeklyHours: Number(goal.estimated_hours_per_week || 0),
          coachingContext: goal.coaching_context,
        })),
        milestones: relevantMilestones.map((milestone) => ({
          id: milestone.id,
          goalId: milestone.goal_id,
          title: milestone.title,
          dueDate: milestone.due_date,
          status: milestone.status,
        })),
        existingActions: existingWeekActions.map((action) => ({
          goalId: action.goal_id,
          milestoneId: action.milestone_id,
          title: action.title,
          estimatedMinutes: Number(action.estimated_minutes || 0),
        })),
        existingTasks: existingWeekTasks.map((task) => ({
          goalId: task.goal_id,
          title: task.title,
          scheduledDate: task.scheduled_date,
          estimatedMinutes: Number(task.estimated_minutes || 0),
          status: task.status,
        })),
        recentReviews: (reviewData ?? []).map((review) => ({
          weekStart: review.week_start,
          plannedMinutes: Number(review.planned_minutes || 0),
          completedMinutes: Number(review.completed_minutes || 0),
          blockers: review.blockers,
          adjustments: review.adjustments,
        })),
      },
    });

    setGenerating(false);

    if (error) {
      toast({
        title: "AI week draft could not be generated",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    if (data?.error) {
      toast({
        title: data.error === "PORTFOLIO_OVER_CAPACITY" ? "Resolve portfolio pressure first" : "AI week draft could not be generated",
        description: data.message ?? data.error,
        variant: "destructive",
      });
      return;
    }

    const nextPlan = data?.plan as GeneratedWeekPlan | undefined;
    if (!nextPlan) {
      toast({
        title: "AI returned no week plan",
        variant: "destructive",
      });
      return;
    }

    setPlan(nextPlan);
  };

  const updateAction = (index: number, updates: Partial<DraftAction>) => {
    setPlan((current) => current ? {
      ...current,
      actions: current.actions.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...updates } : action,
      ),
    } : current);
  };

  const removeAction = (index: number) => {
    setPlan((current) => current ? {
      ...current,
      actions: current.actions.filter((_, actionIndex) => actionIndex !== index),
    } : current);
  };

  const updateTask = (
    actionIndex: number,
    taskIndex: number,
    updates: Partial<DraftTask>,
  ) => {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        actions: current.actions.map((action, index) => {
          if (index !== actionIndex) return action;
          const nextTasks = action.tasks.map((task, indexWithinAction) =>
            indexWithinAction === taskIndex ? { ...task, ...updates } : task,
          );
          return {
            ...action,
            tasks: nextTasks,
            estimatedMinutes: nextTasks.reduce(
              (sum, task) => sum + Number(task.estimatedMinutes || 0),
              0,
            ),
          };
        }),
      };
    });
  };

  const removeTask = (actionIndex: number, taskIndex: number) => {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        actions: current.actions
          .map((action, index) => {
            if (index !== actionIndex) return action;
            const nextTasks = action.tasks.filter((_, indexWithinAction) => indexWithinAction !== taskIndex);
            return {
              ...action,
              tasks: nextTasks,
              estimatedMinutes: nextTasks.reduce(
                (sum, task) => sum + Number(task.estimatedMinutes || 0),
                0,
              ),
            };
          })
          .filter((action) => action.tasks.length > 0),
      };
    });
  };

  const validation = useMemo(() => {
    if (!plan) return { valid: false, message: "" };

    const goalBudgets = new Map(
      eligibleGoals.map((goal) => [
        goal.id,
        Math.round(Number(goal.estimated_hours_per_week || 0) * 60),
      ]),
    );
    for (const task of existingWeekTasks) {
      if (task.status !== "planned" && task.status !== "completed") continue;
      goalBudgets.set(
        task.goal_id,
        Math.max(0, (goalBudgets.get(task.goal_id) ?? 0) - Number(task.estimated_minutes || 0)),
      );
    }

    const generatedByGoal = new Map<string, number>();
    let generatedTotal = 0;

    for (const action of plan.actions) {
      if (!goalMap.has(action.goalId)) {
        return { valid: false, message: "A drafted action is no longer linked to an available goal." };
      }
      if (!action.title.trim() || !action.tasks.length) {
        return { valid: false, message: "Every weekly action needs a title and at least one task." };
      }
      for (const task of action.tasks) {
        if (!task.title.trim()) {
          return { valid: false, message: "Every task needs a title." };
        }
        if (task.scheduledDate < weekStart || task.scheduledDate > weekEnd) {
          return { valid: false, message: "Every generated task must stay inside the selected week." };
        }
        const minutes = Number(task.estimatedMinutes || 0);
        if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440) {
          return { valid: false, message: "Task duration must be between 5 and 1,440 minutes." };
        }
        generatedByGoal.set(
          action.goalId,
          (generatedByGoal.get(action.goalId) ?? 0) + minutes,
        );
        generatedTotal += minutes;
      }
    }

    for (const [goalId, minutes] of generatedByGoal) {
      if (minutes > (goalBudgets.get(goalId) ?? 0) + 1) {
        return {
          valid: false,
          message: `The draft exceeds the remaining confirmed weekly commitment for “${goalMap.get(goalId)?.title ?? "a goal"}”.`,
        };
      }
    }

    const existingMinutes = existingWeekTasks
      .filter((task) => task.status === "planned" || task.status === "completed")
      .reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);

    if (capacityMinutes !== null && existingMinutes + generatedTotal > capacityMinutes + 1) {
      return { valid: false, message: "The edited draft exceeds the weekly capacity you entered." };
    }

    return { valid: true, message: "" };
  }, [
    plan,
    eligibleGoals,
    existingWeekTasks,
    goalMap,
    weekStart,
    weekEnd,
    capacityMinutes,
  ]);

  const applyPlan = async () => {
    if (!plan || !validation.valid || !plan.actions.length) return;

    setApplying(true);
    const { data, error } = await supabase.rpc("apply_generated_week_plan", {
      p_week_start: weekStart,
      p_actions: plan.actions,
    });
    setApplying(false);

    if (error) {
      toast({
        title: "Week plan could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const result = data as { actionsCreated?: number; tasksCreated?: number } | null;
    toast({
      title: "Week plan added",
      description: `${result?.actionsCreated ?? plan.actions.length} weekly actions and ${result?.tasksCreated ?? plan.actions.reduce((sum, action) => sum + action.tasks.length, 0)} tasks were added.`,
    });
    setOpen(false);
    reset();
    await onApplied();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={capacityHours === null || portfolioOverCapacity || !eligibleGoals.length}
        >
          <Sparkles className="h-4 w-4" />
          Draft week with AI
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Draft this week from your goal portfolio
          </DialogTitle>
          <DialogDescription>
            AI proposes missing weekly actions and dated tasks within your confirmed workload and capacity.
            Nothing is saved until you review and apply it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">Week</p>
              <p className="mt-1 font-semibold">{weekStart} → {weekEnd}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">Confirmed demand</p>
              <p className="mt-1 font-semibold">{(committedMinutes / 60).toFixed(1)}h</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">Capacity</p>
              <p className="mt-1 font-semibold">
                {capacityHours === null ? "Not set" : `${capacityHours.toFixed(1)}h`}
              </p>
            </div>
          </div>

          {!plan && !generating && (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">Generate a reviewable week draft</p>
              <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">
                The draft uses your goals, milestones, preserved coaching insights, current scheduled work,
                and recent weekly reviews. It will not silently reduce a confirmed goal to make the calendar fit.
              </p>
              <Button className="mt-4 gap-2" onClick={generate}>
                <Sparkles className="h-4 w-4" />
                Generate draft
              </Button>
            </div>
          )}

          {generating && (
            <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Building a capacity-safe week draft…</p>
            </div>
          )}

          {plan && (
            <>
              <div className="rounded-xl border bg-muted/15 p-4">
                <p className="font-medium">Planner note</p>
                <p className="mt-1 text-sm text-muted-foreground">{plan.planNote}</p>
              </div>

              {plan.warnings.length > 0 && (
                <Alert>
                  <AlertTitle>Review these planning signals</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                {plan.actions.map((action, actionIndex) => (
                  <div key={`${action.goalId}-${actionIndex}`} className="rounded-xl border p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Badge variant="outline">{goalMap.get(action.goalId)?.title ?? "Goal"}</Badge>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {action.estimatedMinutes} min drafted
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeAction(actionIndex)}
                        aria-label="Remove drafted weekly action"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>Weekly action</Label>
                      <Input
                        value={action.title}
                        onChange={(event) => updateAction(actionIndex, { title: event.target.value })}
                      />
                    </div>

                    <div className="mt-4 space-y-3">
                      {action.tasks.map((task, taskIndex) => (
                        <div key={taskIndex} className="grid gap-2 rounded-lg bg-muted/20 p-3 md:grid-cols-[1fr_150px_120px_auto]">
                          <Input
                            value={task.title}
                            onChange={(event) => updateTask(actionIndex, taskIndex, { title: event.target.value })}
                            aria-label="Task title"
                          />
                          <Input
                            type="date"
                            min={weekStart}
                            max={weekEnd}
                            value={task.scheduledDate}
                            onChange={(event) => updateTask(actionIndex, taskIndex, { scheduledDate: event.target.value })}
                            aria-label="Task date"
                          />
                          <div className="relative">
                            <Input
                              type="number"
                              min="5"
                              max="1440"
                              step="5"
                              value={task.estimatedMinutes}
                              onChange={(event) => updateTask(actionIndex, taskIndex, {
                                estimatedMinutes: Number(event.target.value || 0),
                              })}
                              className="pr-10"
                              aria-label="Task minutes"
                            />
                            <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">min</span>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeTask(actionIndex, taskIndex)}
                            aria-label="Remove drafted task"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {!validation.valid && validation.message && (
                <Alert variant="destructive">
                  <AlertTitle>Adjust the draft before saving</AlertTitle>
                  <AlertDescription>{validation.message}</AlertDescription>
                </Alert>
              )}

              {plan.actions.length === 0 && (
                <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  No additional execution work is needed from the AI draft for this week.
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {plan && (
            <Button variant="outline" onClick={generate} disabled={generating || applying}>
              Regenerate
            </Button>
          )}
          <Button
            onClick={applyPlan}
            disabled={!plan || !plan.actions.length || !validation.valid || applying || generating}
          >
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Apply reviewed draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
