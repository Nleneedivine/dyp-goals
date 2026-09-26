import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Link2,
  ListTodo,
  MoveRight,
  Plus,
  RotateCcw,
  SkipForward,
  Target,
  Trash2,
} from "lucide-react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type GoalMilestone = Tables<"goal_milestones">;
type GoalEffortPeriod = Tables<"goal_effort_periods">;
type GoalCapacityPeriod = Tables<"goal_capacity_periods">;
type WeeklyAction = Tables<"goal_weekly_actions">;
type GoalTask = Tables<"goal_tasks">;

type PlannerView = "year" | "month" | "week" | "today";

const CONFIRMED_EFFORT = new Set(["user_confirmed", "ai_estimate_confirmed"]);
const PLANNING_STATUSES = new Set(["draft", "active"]);

const dateKey = (date: Date) => format(date, "yyyy-MM-dd");
const mondayKey = (date: Date) => dateKey(startOfWeek(date, { weekStartsOn: 1 }));
const endOfWeekKey = (weekStart: string) =>
  dateKey(endOfWeek(parseISO(weekStart), { weekStartsOn: 1 }));

const overlapsRange = (
  startDate: string | null,
  endDate: string | null,
  rangeStart: string,
  rangeEnd: string,
) => {
  const start = startDate ?? "0001-01-01";
  const end = endDate ?? "9999-12-31";
  return start <= rangeEnd && end >= rangeStart;
};

const hoursLabel = (minutes: number) => {
  if (!minutes) return "0h";
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
};

const priorityLabel = (priority: string) =>
  priority === "primary" ? "Primary" : priority === "maintenance" ? "Maintenance" : "Later";

export default function Planner({ initialView = "week" }: { initialView?: PlannerView }) {
  const { toast } = useToast();
  const [view, setView] = useState<PlannerView>(initialView);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<GoalMilestone[]>([]);
  const [effortPeriods, setEffortPeriods] = useState<GoalEffortPeriod[]>([]);
  const [capacityPeriods, setCapacityPeriods] = useState<GoalCapacityPeriod[]>([]);
  const [defaultCapacity, setDefaultCapacity] = useState<number | null>(null);
  const [actions, setActions] = useState<WeeklyAction[]>([]);
  const [tasks, setTasks] = useState<GoalTask[]>([]);

  const now = new Date();
  const today = dateKey(now);
  const [yearAnchor, setYearAnchor] = useState(now);
  const [monthAnchor, setMonthAnchor] = useState(now);
  const [weekAnchor, setWeekAnchor] = useState(now);
  const [dayAnchor, setDayAnchor] = useState(now);

  const [actionDraft, setActionDraft] = useState({
    goalId: "",
    milestoneId: "none",
    title: "",
    estimatedMinutes: "60",
  });
  const [savingAction, setSavingAction] = useState(false);

  const [taskDraft, setTaskDraft] = useState({
    goalId: "",
    milestoneId: "none",
    actionId: "none",
    title: "",
    scheduledDate: today,
    scheduledTime: "",
    estimatedMinutes: "30",
  });
  const [savingTask, setSavingTask] = useState(false);

  const planningGoals = useMemo(
    () => goals.filter((goal) => PLANNING_STATUSES.has(goal.status)),
    [goals],
  );

  const goalMap = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal])),
    [goals],
  );
  const milestoneMap = useMemo(
    () => new Map(milestones.map((milestone) => [milestone.id, milestone])),
    [milestones],
  );
  const actionMap = useMemo(
    () => new Map(actions.map((action) => [action.id, action])),
    [actions],
  );

  const loadPlanner = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const [
      goalsResult,
      actionsResult,
      tasksResult,
      capacitySettingsResult,
      capacityPeriodsResult,
    ] = await Promise.all([
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .neq("status", "archived")
        .order("created_at", { ascending: true }),
      supabase
        .from("goal_weekly_actions")
        .select("*")
        .eq("user_id", user.id)
        .order("week_start", { ascending: true })
        .order("display_order", { ascending: true }),
      supabase
        .from("goal_tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .order("display_order", { ascending: true }),
      supabase
        .from("goal_capacity_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("goal_capacity_periods")
        .select("*")
        .eq("user_id", user.id)
        .order("start_date", { ascending: true }),
    ]);

    const firstError =
      goalsResult.error ||
      actionsResult.error ||
      tasksResult.error ||
      capacitySettingsResult.error ||
      capacityPeriodsResult.error;

    if (firstError) {
      setLoading(false);
      toast({
        title: "Planner could not load",
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }

    const loadedGoals = goalsResult.data ?? [];
    setGoals(loadedGoals);
    setActions(actionsResult.data ?? []);
    setTasks(tasksResult.data ?? []);
    setDefaultCapacity(
      capacitySettingsResult.data
        ? Number(capacitySettingsResult.data.default_hours_per_week)
        : null,
    );
    setCapacityPeriods(capacityPeriodsResult.data ?? []);

    if (!loadedGoals.length) {
      setMilestones([]);
      setEffortPeriods([]);
      setLoading(false);
      return;
    }

    const goalIds = loadedGoals.map((goal) => goal.id);
    const [milestonesResult, effortResult] = await Promise.all([
      supabase
        .from("goal_milestones")
        .select("*")
        .in("goal_id", goalIds)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("goal_effort_periods")
        .select("*")
        .in("goal_id", goalIds)
        .order("start_date", { ascending: true }),
    ]);

    if (milestonesResult.error || effortResult.error) {
      toast({
        title: "Some planning context could not load",
        description: milestonesResult.error?.message ?? effortResult.error?.message,
        variant: "destructive",
      });
    }

    setMilestones(milestonesResult.data ?? []);
    setEffortPeriods(effortResult.data ?? []);

    const firstGoal = loadedGoals.find((goal) => PLANNING_STATUSES.has(goal.status));
    if (firstGoal) {
      setActionDraft((current) => current.goalId ? current : { ...current, goalId: firstGoal.id });
      setTaskDraft((current) => current.goalId ? current : { ...current, goalId: firstGoal.id });
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadPlanner();
  }, []);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const currentWeekStart = mondayKey(weekAnchor);
  const currentWeekEnd = endOfWeekKey(currentWeekStart);

  useEffect(() => {
    if (taskDraft.scheduledDate < currentWeekStart || taskDraft.scheduledDate > currentWeekEnd) {
      setTaskDraft((current) => ({ ...current, scheduledDate: currentWeekStart }));
    }
  }, [currentWeekStart, currentWeekEnd]);

  const milestonesForGoal = (goalId: string) =>
    milestones.filter((milestone) => milestone.goal_id === goalId);

  const actionsForGoalAndWeek = (goalId: string, weekStart: string) =>
    actions.filter((action) => action.goal_id === goalId && action.week_start === weekStart);

  const effortForGoalDuring = (goal: Goal, rangeStart: string, rangeEnd: string) => {
    const phase = effortPeriods.find(
      (period) =>
        period.goal_id === goal.id &&
        period.start_date <= rangeEnd &&
        period.end_date >= rangeStart,
    );
    return Number(phase?.hours_per_week ?? goal.estimated_hours_per_week ?? 0);
  };

  const capacityForWeek = (weekStart: string, weekEnd: string) => {
    const override = capacityPeriods.find(
      (period) => period.start_date <= weekEnd && period.end_date >= weekStart,
    );
    return {
      hours: Number(override?.hours_per_week ?? defaultCapacity ?? 0),
      label: override?.label?.trim() || (override ? "Temporary capacity" : "Normal capacity"),
      hasOverride: Boolean(override),
    };
  };

  const weeklyGoalDemand = (weekStart: string, weekEnd: string) =>
    planningGoals
      .filter(
        (goal) =>
          CONFIRMED_EFFORT.has(goal.effort_source) &&
          overlapsRange(goal.start_date, goal.end_date, weekStart, weekEnd),
      )
      .reduce(
        (sum, goal) => sum + effortForGoalDuring(goal, weekStart, weekEnd),
        0,
      );

  const tasksForWeek = tasks.filter(
    (task) =>
      task.scheduled_date &&
      task.scheduled_date >= currentWeekStart &&
      task.scheduled_date <= currentWeekEnd,
  );

  const plannedTaskMinutesForWeek = tasksForWeek
    .filter((task) => task.status === "planned" || task.status === "completed")
    .reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);

  const currentCapacity = capacityForWeek(currentWeekStart, currentWeekEnd);
  const currentDemand = weeklyGoalDemand(currentWeekStart, currentWeekEnd);
  const currentTaskHours = plannedTaskMinutesForWeek / 60;
  const capacityOverloaded =
    defaultCapacity !== null && currentDemand > currentCapacity.hours + 0.01;
  const scheduleOverloaded =
    defaultCapacity !== null && currentTaskHours > currentCapacity.hours + 0.01;

  const addWeeklyAction = async () => {
    if (!userId || !actionDraft.goalId || !actionDraft.title.trim()) return;
    const minutes = Number(actionDraft.estimatedMinutes || 0);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 10080) {
      toast({ title: "Check the action effort", variant: "destructive" });
      return;
    }

    setSavingAction(true);
    const { data, error } = await supabase
      .from("goal_weekly_actions")
      .insert({
        user_id: userId,
        goal_id: actionDraft.goalId,
        milestone_id: actionDraft.milestoneId === "none" ? null : actionDraft.milestoneId,
        title: actionDraft.title.trim(),
        week_start: currentWeekStart,
        estimated_minutes: minutes,
        display_order: actions.filter((action) => action.week_start === currentWeekStart).length,
      })
      .select("*")
      .single();
    setSavingAction(false);

    if (error) {
      toast({ title: "Weekly action could not be added", description: error.message, variant: "destructive" });
      return;
    }

    setActions((current) => [...current, data]);
    setActionDraft((current) => ({ ...current, milestoneId: "none", title: "", estimatedMinutes: "60" }));
  };

  const deleteWeeklyAction = async (actionId: string) => {
    const { error } = await supabase.from("goal_weekly_actions").delete().eq("id", actionId);
    if (error) {
      toast({ title: "Weekly action could not be deleted", description: error.message, variant: "destructive" });
      return;
    }
    setActions((current) => current.filter((action) => action.id !== actionId));
    setTasks((current) =>
      current.map((task) => task.weekly_action_id === actionId ? { ...task, weekly_action_id: null } : task),
    );
  };

  const toggleWeeklyAction = async (action: WeeklyAction) => {
    const status = action.status === "completed" ? "planned" : "completed";
    const { error } = await supabase
      .from("goal_weekly_actions")
      .update({ status })
      .eq("id", action.id);
    if (error) {
      toast({ title: "Weekly action could not be updated", description: error.message, variant: "destructive" });
      return;
    }
    setActions((current) =>
      current.map((item) => item.id === action.id ? { ...item, status } : item),
    );
  };

  const addTask = async () => {
    if (!userId || !taskDraft.goalId || !taskDraft.title.trim()) return;
    const minutes = Number(taskDraft.estimatedMinutes || 0);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
      toast({ title: "Check the task duration", variant: "destructive" });
      return;
    }

    const selectedAction =
      taskDraft.actionId === "none" ? null : actionMap.get(taskDraft.actionId) ?? null;

    const goalId = selectedAction?.goal_id ?? taskDraft.goalId;
    const milestoneId =
      selectedAction?.milestone_id ??
      (taskDraft.milestoneId === "none" ? null : taskDraft.milestoneId);

    setSavingTask(true);
    const { data, error } = await supabase
      .from("goal_tasks")
      .insert({
        user_id: userId,
        goal_id: goalId,
        milestone_id: milestoneId,
        weekly_action_id: selectedAction?.id ?? null,
        title: taskDraft.title.trim(),
        scheduled_date: taskDraft.scheduledDate || null,
        scheduled_time: taskDraft.scheduledTime || null,
        estimated_minutes: minutes,
        display_order: tasksForWeek.length,
      })
      .select("*")
      .single();
    setSavingTask(false);

    if (error) {
      toast({ title: "Task could not be added", description: error.message, variant: "destructive" });
      return;
    }

    setTasks((current) => [...current, data]);
    setTaskDraft((current) => ({
      ...current,
      actionId: "none",
      milestoneId: "none",
      title: "",
      scheduledTime: "",
      estimatedMinutes: "30",
    }));
  };

  const updateTask = async (taskId: string, updates: Partial<GoalTask>) => {
    const { error } = await supabase.from("goal_tasks").update(updates).eq("id", taskId);
    if (error) {
      toast({ title: "Task could not be updated", description: error.message, variant: "destructive" });
      return false;
    }
    setTasks((current) =>
      current.map((task) => task.id === taskId ? { ...task, ...updates } : task),
    );
    return true;
  };

  const completeTask = async (task: GoalTask) => {
    if (task.status === "completed") {
      await updateTask(task.id, { status: "planned", completed_at: null });
      return;
    }
    await updateTask(task.id, { status: "completed", completed_at: new Date().toISOString() });
  };

  const deferTask = async (task: GoalTask) => {
    await updateTask(task.id, {
      status: "deferred",
      deferred_from_date: task.deferred_from_date ?? task.scheduled_date,
      scheduled_date: null,
      scheduled_time: null,
      completed_at: null,
    });
  };

  const skipTask = async (task: GoalTask) => {
    await updateTask(task.id, {
      status: "skipped",
      completed_at: null,
    });
  };

  const rescheduleTask = async (task: GoalTask, nextDate: string) => {
    await updateTask(task.id, {
      status: "planned",
      deferred_from_date: task.deferred_from_date ?? task.scheduled_date,
      scheduled_date: nextDate,
      completed_at: null,
    });
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase.from("goal_tasks").delete().eq("id", taskId);
    if (error) {
      toast({ title: "Task could not be deleted", description: error.message, variant: "destructive" });
      return;
    }
    setTasks((current) => current.filter((task) => task.id !== taskId));
  };

  const lineage = (task: GoalTask) => {
    const parts: string[] = [];
    const goal = goalMap.get(task.goal_id);
    if (goal) parts.push(goal.title);
    if (task.milestone_id) {
      const milestone = milestoneMap.get(task.milestone_id);
      if (milestone) parts.push(milestone.title);
    }
    if (task.weekly_action_id) {
      const action = actionMap.get(task.weekly_action_id);
      if (action) parts.push(action.title);
    }
    return parts;
  };

  const planningQueue = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            task.status === "deferred" ||
            (task.status === "planned" && Boolean(task.scheduled_date && task.scheduled_date < today)),
        )
        .sort((a, b) => (a.scheduled_date ?? a.deferred_from_date ?? "").localeCompare(
          b.scheduled_date ?? b.deferred_from_date ?? "",
        )),
    [tasks, today],
  );

  const selectedDayKey = dateKey(dayAnchor);
  const selectedDayTasks = tasks
    .filter((task) => task.scheduled_date === selectedDayKey && task.status !== "deferred")
    .sort((a, b) => (a.scheduled_time ?? "99:99").localeCompare(b.scheduled_time ?? "99:99"));

  const yearStart = dateKey(startOfYear(yearAnchor));
  const yearEnd = dateKey(endOfYear(yearAnchor));
  const yearGoals = planningGoals.filter((goal) =>
    overlapsRange(goal.start_date, goal.end_date, yearStart, yearEnd),
  );
  const yearMilestones = milestones.filter(
    (milestone) => milestone.due_date && milestone.due_date >= yearStart && milestone.due_date <= yearEnd,
  );

  const monthStart = dateKey(startOfMonth(monthAnchor));
  const monthEnd = dateKey(endOfMonth(monthAnchor));
  const monthGoals = planningGoals.filter((goal) =>
    overlapsRange(goal.start_date, goal.end_date, monthStart, monthEnd),
  );
  const monthMilestones = milestones.filter(
    (milestone) => milestone.due_date && milestone.due_date >= monthStart && milestone.due_date <= monthEnd,
  );
  const monthTasks = tasks.filter(
    (task) => task.scheduled_date && task.scheduled_date >= monthStart && task.scheduled_date <= monthEnd,
  );

  const actionGoalMilestones = actionDraft.goalId ? milestonesForGoal(actionDraft.goalId) : [];
  const taskGoalMilestones = taskDraft.goalId ? milestonesForGoal(taskDraft.goalId) : [];
  const taskActions = taskDraft.goalId
    ? actionsForGoalAndWeek(taskDraft.goalId, currentWeekStart)
    : [];

  const goalTaskProgress = (goalId: string) => {
    const goalTasks = tasks.filter((task) => task.goal_id === goalId && task.status !== "skipped");
    const completed = goalTasks.filter((task) => task.status === "completed").length;
    return {
      completed,
      total: goalTasks.length,
      percent: goalTasks.length ? Math.round((completed / goalTasks.length) * 100) : 0,
    };
  };

  if (loading) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-28">
        <div className="container mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-12 w-64 rounded bg-muted" />
          <div className="h-20 rounded-2xl bg-muted" />
          <div className="h-96 rounded-2xl bg-muted" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-28">
      <div className="container mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              <ListTodo className="h-4 w-4" />
              Execution planner
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Plan → Do → Review</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Your goals, milestones, weekly priorities and daily tasks now live in one execution chain.
              Every task keeps its reason attached.
            </p>
          </div>

          {planningQueue.length > 0 && (
            <Badge variant="outline" className="w-fit gap-2 border-amber-500/30 px-3 py-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              {planningQueue.length} {planningQueue.length === 1 ? "task needs" : "tasks need"} replanning
            </Badge>
          )}
        </div>

        <Tabs value={view} onValueChange={(value) => setView(value as PlannerView)}>
          <TabsList className="grid h-auto w-full grid-cols-4 lg:max-w-xl">
            <TabsTrigger value="year" className="py-2.5">Year</TabsTrigger>
            <TabsTrigger value="month" className="py-2.5">Month</TabsTrigger>
            <TabsTrigger value="week" className="py-2.5">Week</TabsTrigger>
            <TabsTrigger value="today" className="py-2.5">Today</TabsTrigger>
          </TabsList>

          <TabsContent value="year" className="mt-6 space-y-5">
            <div className="flex items-center justify-between rounded-xl border bg-card p-3">
              <Button variant="ghost" size="icon" onClick={() => setYearAnchor((date) => subYears(date, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <p className="text-xl font-bold">{format(yearAnchor, "yyyy")}</p>
                <p className="text-xs text-muted-foreground">Goals and major checkpoints</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setYearAnchor((date) => addYears(date, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {yearGoals.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-14 text-center text-muted-foreground">
                  No scheduled goals overlap this year yet.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {yearGoals.map((goal) => {
                  const progress = goalTaskProgress(goal.id);
                  const goalMilestones = yearMilestones.filter((milestone) => milestone.goal_id === goal.id);
                  return (
                    <Card key={goal.id}>
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{goal.life_area}</Badge>
                          <Badge variant="secondary">{priorityLabel(goal.priority)}</Badge>
                          {CONFIRMED_EFFORT.has(goal.effort_source) && (
                            <Badge variant="outline">{Number(goal.estimated_hours_per_week).toFixed(1)}h/week</Badge>
                          )}
                        </div>
                        <CardTitle className="pt-2 text-xl">{goal.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {goal.start_date || "No start"} → {goal.end_date || "No deadline"}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                            <span>Execution tasks completed</span>
                            <span>{progress.completed}/{progress.total}</span>
                          </div>
                          <Progress value={progress.percent} />
                        </div>

                        <div>
                          <p className="mb-2 text-sm font-semibold">Milestones this year</p>
                          {goalMilestones.length ? (
                            <div className="space-y-2">
                              {goalMilestones.map((milestone) => (
                                <div key={milestone.id} className="flex items-start justify-between gap-3 rounded-lg border bg-muted/15 p-3 text-sm">
                                  <span>{milestone.title}</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">{milestone.due_date}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No dated milestones in this year.</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="month" className="mt-6 space-y-5">
            <div className="flex items-center justify-between rounded-xl border bg-card p-3">
              <Button variant="ghost" size="icon" onClick={() => setMonthAnchor((date) => subMonths(date, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <p className="text-xl font-bold">{format(monthAnchor, "MMMM yyyy")}</p>
                <p className="text-xs text-muted-foreground">Focus, milestones and scheduled execution</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMonthAnchor((date) => addMonths(date, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader><CardTitle className="text-lg">Goals in focus</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {monthGoals.length ? monthGoals.map((goal) => (
                    <div key={goal.id} className="rounded-lg border p-3">
                      <p className="font-medium">{goal.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{goal.life_area} · {priorityLabel(goal.priority)}</p>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No goals overlap this month.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Milestones due</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {monthMilestones.length ? monthMilestones.map((milestone) => (
                    <div key={milestone.id} className="rounded-lg border p-3">
                      <p className="font-medium">{milestone.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {goalMap.get(milestone.goal_id)?.title} · {milestone.due_date}
                      </p>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No milestones due this month.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Execution scheduled</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{monthTasks.length}</p>
                  <p className="text-sm text-muted-foreground">tasks scheduled this month</p>
                  <p className="mt-3 text-sm">
                    {monthTasks.filter((task) => task.status === "completed").length} completed
                  </p>
                </CardContent>
              </Card>
            </div>

            {monthTasks.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-lg">Month agenda</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {monthTasks
                    .slice()
                    .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""))
                    .map((task) => (
                      <div key={task.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className={task.status === "completed" ? "font-medium line-through text-muted-foreground" : "font-medium"}>
                            {task.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {goalMap.get(task.goal_id)?.title}
                          </p>
                        </div>
                        <Badge variant="outline">{task.scheduled_date}</Badge>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="week" className="mt-6 space-y-6">
            <div className="flex items-center justify-between rounded-xl border bg-card p-3">
              <Button variant="ghost" size="icon" onClick={() => setWeekAnchor((date) => subWeeks(date, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <p className="font-bold">
                  {format(parseISO(currentWeekStart), "MMM d")} – {format(parseISO(currentWeekEnd), "MMM d, yyyy")}
                </p>
                <p className="text-xs text-muted-foreground">Weekly execution commitments</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setWeekAnchor((date) => addWeeks(date, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Card className={capacityOverloaded ? "border-amber-500/30 bg-amber-500/5" : ""}>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Goal demand</p>
                  <p className="text-2xl font-bold">{currentDemand.toFixed(1)}h</p>
                  <p className="text-xs text-muted-foreground">confirmed weekly commitments</p>
                </CardContent>
              </Card>
              <Card className={scheduleOverloaded ? "border-amber-500/30 bg-amber-500/5" : ""}>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Tasks scheduled</p>
                  <p className="text-2xl font-bold">{currentTaskHours.toFixed(1)}h</p>
                  <p className="text-xs text-muted-foreground">{tasksForWeek.length} tasks in this week</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">{currentCapacity.label}</p>
                  <p className="text-2xl font-bold">{defaultCapacity === null ? "—" : `${currentCapacity.hours.toFixed(1)}h`}</p>
                  <p className="text-xs text-muted-foreground">
                    {defaultCapacity === null ? "Set capacity in My GOALS" : currentCapacity.hasOverride ? "temporary override applies" : "available goal-work time"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {(capacityOverloaded || scheduleOverloaded) && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {capacityOverloaded && "Your confirmed goal demand exceeds the capacity you entered. "}
                  {scheduleOverloaded && "Your scheduled task time also exceeds that capacity. "}
                  Review the workload, dates, capacity or goal status yourself before adding more. The planner will not choose which goal to sacrifice.
                </p>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">1. Set weekly priorities</CardTitle>
                <p className="text-sm text-muted-foreground">
                  A weekly action is the bridge between a goal or milestone and the tasks you will actually execute.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {planningGoals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add a draft or active goal in My GOALS first.</p>
                ) : (
                  <div className="grid gap-2 lg:grid-cols-[1.1fr_1.1fr_2fr_130px_auto]">
                    <Select
                      value={actionDraft.goalId}
                      onValueChange={(goalId) => setActionDraft((current) => ({ ...current, goalId, milestoneId: "none" }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Goal" /></SelectTrigger>
                      <SelectContent>
                        {planningGoals.map((goal) => <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    <Select
                      value={actionDraft.milestoneId}
                      onValueChange={(milestoneId) => setActionDraft((current) => ({ ...current, milestoneId }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Milestone" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No milestone</SelectItem>
                        {actionGoalMilestones.map((milestone) => (
                          <SelectItem key={milestone.id} value={milestone.id}>{milestone.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      value={actionDraft.title}
                      onChange={(event) => setActionDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="e.g. Complete literature review section"
                    />

                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="10080"
                        step="15"
                        value={actionDraft.estimatedMinutes}
                        onChange={(event) => setActionDraft((current) => ({ ...current, estimatedMinutes: event.target.value }))}
                        className="pr-10"
                      />
                      <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">min</span>
                    </div>

                    <Button onClick={addWeeklyAction} disabled={savingAction || !actionDraft.goalId || !actionDraft.title.trim()} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  {actions.filter((action) => action.week_start === currentWeekStart).length === 0 ? (
                    <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                      No weekly priorities yet.
                    </div>
                  ) : (
                    actions
                      .filter((action) => action.week_start === currentWeekStart)
                      .map((action) => {
                        const actionTasks = tasks.filter((task) => task.weekly_action_id === action.id);
                        const completedTasks = actionTasks.filter((task) => task.status === "completed").length;
                        return (
                          <div key={action.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{goalMap.get(action.goal_id)?.title ?? "Goal"}</Badge>
                                {action.milestone_id && <Badge variant="secondary">{milestoneMap.get(action.milestone_id)?.title ?? "Milestone"}</Badge>}
                                {action.estimated_minutes > 0 && <Badge variant="outline">{hoursLabel(action.estimated_minutes)}</Badge>}
                              </div>
                              <p className={action.status === "completed" ? "mt-2 font-semibold line-through text-muted-foreground" : "mt-2 font-semibold"}>
                                {action.title}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{completedTasks}/{actionTasks.length} linked tasks complete</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setTaskDraft((current) => ({
                                    ...current,
                                    goalId: action.goal_id,
                                    milestoneId: action.milestone_id ?? "none",
                                    actionId: action.id,
                                    scheduledDate: currentWeekStart,
                                  }));
                                }}
                              >
                                Add task
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => toggleWeeklyAction(action)} aria-label="Toggle weekly action completion">
                                {action.status === "completed" ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteWeeklyAction(action.id)} aria-label="Delete weekly action">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">2. Schedule executable tasks</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Keep tasks small enough to do. They can link to a weekly action, milestone and goal.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1.7fr_145px_120px_110px_auto]">
                  <Select
                    value={taskDraft.goalId}
                    onValueChange={(goalId) => setTaskDraft((current) => ({ ...current, goalId, milestoneId: "none", actionId: "none" }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Goal" /></SelectTrigger>
                    <SelectContent>
                      {planningGoals.map((goal) => <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select
                    value={taskDraft.actionId}
                    onValueChange={(actionId) => {
                      const action = actionId === "none" ? null : actionMap.get(actionId);
                      setTaskDraft((current) => ({
                        ...current,
                        actionId,
                        milestoneId: action?.milestone_id ?? current.milestoneId,
                      }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Weekly action" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No weekly action</SelectItem>
                      {taskActions.map((action) => <SelectItem key={action.id} value={action.id}>{action.title}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Input
                    value={taskDraft.title}
                    onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Concrete task"
                  />

                  <Input
                    type="date"
                    min={currentWeekStart}
                    max={currentWeekEnd}
                    value={taskDraft.scheduledDate}
                    onChange={(event) => setTaskDraft((current) => ({ ...current, scheduledDate: event.target.value }))}
                  />

                  <Input
                    type="time"
                    value={taskDraft.scheduledTime}
                    onChange={(event) => setTaskDraft((current) => ({ ...current, scheduledTime: event.target.value }))}
                  />

                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="1440"
                      step="15"
                      value={taskDraft.estimatedMinutes}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, estimatedMinutes: event.target.value }))}
                      className="pr-10"
                    />
                    <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">min</span>
                  </div>

                  <Button onClick={addTask} disabled={savingTask || !taskDraft.goalId || !taskDraft.title.trim()} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 7 }, (_, index) => addDays(parseISO(currentWeekStart), index)).map((date) => {
                    const key = dateKey(date);
                    const dayTasks = tasksForWeek
                      .filter((task) => task.scheduled_date === key)
                      .sort((a, b) => (a.scheduled_time ?? "99:99").localeCompare(b.scheduled_time ?? "99:99"));
                    return (
                      <div key={key} className="rounded-xl border p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{format(date, "EEE")}</p>
                            <p className="text-xs text-muted-foreground">{format(date, "MMM d")}</p>
                          </div>
                          <Badge variant="secondary">{dayTasks.length}</Badge>
                        </div>
                        <div className="space-y-2">
                          {dayTasks.length ? dayTasks.map((task) => (
                            <div key={task.id} className="rounded-lg bg-muted/25 p-3">
                              <p className={task.status === "completed" ? "text-sm font-medium line-through text-muted-foreground" : "text-sm font-medium"}>
                                {task.title}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {task.scheduled_time ? task.scheduled_time.slice(0, 5) : "Any time"}
                                {task.estimated_minutes ? ` · ${task.estimated_minutes} min` : ""}
                              </p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">{goalMap.get(task.goal_id)?.title}</p>
                            </div>
                          )) : <p className="text-xs text-muted-foreground">No tasks</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="today" className="mt-6 space-y-6">
            <div className="flex items-center justify-between rounded-xl border bg-card p-3">
              <Button variant="ghost" size="icon" onClick={() => setDayAnchor((date) => addDays(date, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <p className="font-bold">{format(dayAnchor, "EEEE, MMMM d")}</p>
                <p className="text-xs text-muted-foreground">{selectedDayKey === today ? "Today" : format(dayAnchor, "yyyy")}</p>
              </div>
              <div className="flex items-center gap-1">
                {selectedDayKey !== today && (
                  <Button variant="ghost" size="sm" onClick={() => setDayAnchor(new Date())}>Today</Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setDayAnchor((date) => addDays(date, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {planningQueue.length > 0 && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-700" />
                    Replanning queue
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Missed and deferred tasks stay visible until you deliberately reschedule or skip them.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {planningQueue.map((task) => (
                    <div key={task.id} className="rounded-xl border bg-background p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {task.status === "deferred" ? "Deferred" : `Missed ${task.scheduled_date}`}
                            </Badge>
                            <Badge variant="secondary">{goalMap.get(task.goal_id)?.title ?? "Goal"}</Badge>
                          </div>
                          <p className="mt-2 font-semibold">{task.title}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => rescheduleTask(task, today)}>Today</Button>
                          <Button size="sm" variant="outline" onClick={() => rescheduleTask(task, dateKey(addDays(new Date(), 1)))}>Tomorrow</Button>
                          <Button size="sm" variant="outline" onClick={() => rescheduleTask(task, dateKey(addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1)))}>Next week</Button>
                          <Button size="sm" variant="ghost" onClick={() => skipTask(task)}>Skip</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-primary" />
                  {selectedDayKey === today ? "Today's execution" : "Daily execution"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Complete, defer or skip consciously. Missed work will return to the replanning queue.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedDayTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-12 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 font-medium">No tasks scheduled for this day</p>
                    <p className="mt-1 text-sm text-muted-foreground">Use the Week view to schedule goal-linked tasks.</p>
                  </div>
                ) : (
                  selectedDayTasks.map((task) => {
                    const path = lineage(task);
                    return (
                      <div key={task.id} className={`rounded-xl border p-4 ${task.status === "completed" ? "bg-muted/20" : ""}`}>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {task.scheduled_time && <Badge variant="outline">{task.scheduled_time.slice(0, 5)}</Badge>}
                              {task.estimated_minutes > 0 && <Badge variant="outline">{task.estimated_minutes} min</Badge>}
                              <Badge variant={task.status === "completed" ? "secondary" : "outline"}>{task.status}</Badge>
                            </div>
                            <p className={task.status === "completed" ? "mt-2 text-lg font-semibold line-through text-muted-foreground" : "mt-2 text-lg font-semibold"}>
                              {task.title}
                            </p>
                            {path.length > 0 && (
                              <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                                <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{path.join(" → ")}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => completeTask(task)} className="gap-1.5">
                              {task.status === "completed" ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                              {task.status === "completed" ? "Undo" : "Done"}
                            </Button>
                            {task.status !== "completed" && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => deferTask(task)} className="gap-1.5">
                                  <MoveRight className="h-4 w-4" />
                                  Defer
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => skipTask(task)} className="gap-1.5">
                                  <SkipForward className="h-4 w-4" />
                                  Skip
                                </Button>
                              </>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => deleteTask(task.id)} aria-label="Delete task">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/15 bg-primary/5">
              <CardContent className="flex items-start gap-3 pt-6">
                <Target className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Every task keeps its “why”</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The stored chain is Goal → Milestone → Weekly action → Daily task. Later, adaptive replanning can use the same lineage plus the coaching insights already saved on each goal.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
