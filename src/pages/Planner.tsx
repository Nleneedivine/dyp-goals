import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvailabilityManager } from "@/components/AvailabilityManager";
import { AIReplanDialog } from "@/components/AIReplanDialog";
import { AIWeekPlannerDialog } from "@/components/AIWeekPlannerDialog";
import { GoalTaskEditDialog, type GoalTaskEditValues } from "@/components/GoalTaskEditDialog";
import { QuickGoalTaskDialog, type QuickGoalTaskValues } from "@/components/QuickGoalTaskDialog";
import { WeeklyActionEditDialog, type WeeklyActionEditValues } from "@/components/WeeklyActionEditDialog";
import { WeeklyExecutionReview } from "@/components/WeeklyExecutionReview";
import { useToast } from "@/hooks/use-toast";
import { downloadTasksIcs } from "@/lib/calendarExport";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type GoalMilestone = Tables<"goal_milestones">;
type GoalEffortPeriod = Tables<"goal_effort_periods">;
type GoalCapacityPeriod = Tables<"goal_capacity_periods">;
type GoalDependency = Tables<"goal_dependencies">;
type WeeklyAction = Tables<"goal_weekly_actions">;
type GoalTask = Tables<"goal_tasks">;
type FixedBlock = Tables<"planner_fixed_blocks">;

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
  const [fixedBlocks, setFixedBlocks] = useState<FixedBlock[]>([]);
  const [dependencies, setDependencies] = useState<GoalDependency[]>([]);

  const now = new Date();
  const today = dateKey(now);
  const [yearAnchor, setYearAnchor] = useState(now);
  const [monthAnchor, setMonthAnchor] = useState(now);
  const [weekAnchor, setWeekAnchor] = useState(now);
  const [dayAnchor, setDayAnchor] = useState(now);

  const openMonthAt = (date: string) => {
    const parsed = parseISO(date);
    setMonthAnchor(parsed);
    setView("month");
  };

  const openWeekAt = (date: string) => {
    const parsed = parseISO(date);
    setWeekAnchor(parsed);
    setView("week");
  };

  const openDayAt = (date: string) => {
    const parsed = parseISO(date);
    setDayAnchor(parsed);
    setView("today");
  };

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
      fixedBlocksResult,
      dependenciesResult,
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
      supabase
        .from("planner_fixed_blocks")
        .select("*")
        .eq("user_id", user.id)
        .order("start_time", { ascending: true }),
      supabase
        .from("goal_dependencies")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    const dependencyTablePending =
      dependenciesResult.error?.code === "PGRST205" ||
      dependenciesResult.error?.code === "42P01";

    const firstError =
      goalsResult.error ||
      actionsResult.error ||
      tasksResult.error ||
      capacitySettingsResult.error ||
      capacityPeriodsResult.error ||
      fixedBlocksResult.error ||
      (dependencyTablePending ? null : dependenciesResult.error);

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
    setFixedBlocks(fixedBlocksResult.data ?? []);
    setDependencies(dependencyTablePending ? [] : dependenciesResult.data ?? []);

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

  const pendingDependenciesForGoal = (goalId: string) =>
    dependencies
      .filter((dependency) => dependency.dependent_goal_id === goalId)
      .filter((dependency) => goalMap.get(dependency.prerequisite_goal_id)?.status !== "completed");

  const currentWeekDependencySignals = planningGoals
    .filter(
      (goal) =>
        Boolean(goal.start_date && goal.end_date) &&
        overlapsRange(goal.start_date, goal.end_date, currentWeekStart, currentWeekEnd),
    )
    .flatMap((goal) =>
      pendingDependenciesForGoal(goal.id).map((dependency) => ({
        dependency,
        dependent: goal,
        prerequisite: goalMap.get(dependency.prerequisite_goal_id) ?? null,
      })),
    );

  const weeklyGoalDemand = (weekStart: string, weekEnd: string) =>
    planningGoals
      .filter(
        (goal) =>
          CONFIRMED_EFFORT.has(goal.effort_source) &&
          Boolean(goal.start_date && goal.end_date) &&
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
  const currentWeekActions = actions.filter((action) => action.week_start === currentWeekStart);
  const weeklyAllocations = planningGoals
    .filter(
      (goal) =>
        CONFIRMED_EFFORT.has(goal.effort_source) &&
        Boolean(goal.start_date && goal.end_date) &&
        overlapsRange(goal.start_date, goal.end_date, currentWeekStart, currentWeekEnd),
    )
    .map((goal) => {
      const committedMinutes = Math.round(
        effortForGoalDuring(goal, currentWeekStart, currentWeekEnd) * 60,
      );
      const scheduledMinutes = tasksForWeek
        .filter(
          (task) =>
            task.goal_id === goal.id &&
            (task.status === "planned" || task.status === "completed"),
        )
        .reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);
      const actionMinutes = currentWeekActions
        .filter(
          (action) =>
            action.goal_id === goal.id &&
            action.status !== "skipped" &&
            action.status !== "deferred",
        )
        .reduce((sum, action) => sum + Number(action.estimated_minutes || 0), 0);
      const nextMilestone = milestones
        .filter(
          (milestone) =>
            milestone.goal_id === goal.id &&
            milestone.status !== "completed" &&
            Boolean(milestone.due_date && milestone.due_date >= currentWeekStart),
        )
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0] ?? null;

      return {
        goal,
        committedMinutes,
        scheduledMinutes,
        actionMinutes,
        remainingMinutes: Math.max(0, committedMinutes - scheduledMinutes),
        overMinutes: Math.max(0, scheduledMinutes - committedMinutes),
        nextMilestone,
      };
    });
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

  const saveWeeklyActionEdits = async (
    action: WeeklyAction,
    values: WeeklyActionEditValues,
  ) => {
    const linkedTasks = tasks.filter((task) => task.weekly_action_id === action.id);
    if (
      linkedTasks.length > 0 &&
      values.milestoneId !== action.milestone_id
    ) {
      toast({
        title: "Milestone cannot change after tasks are linked",
        description: "Create a new weekly action if this work needs to move to a different milestone.",
        variant: "destructive",
      });
      return false;
    }

    const { error } = await supabase
      .from("goal_weekly_actions")
      .update({
        title: values.title,
        milestone_id: values.milestoneId,
        estimated_minutes: values.estimatedMinutes,
        notes: values.notes,
      })
      .eq("id", action.id);

    if (error) {
      toast({
        title: "Weekly action could not be updated",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }

    setActions((current) =>
      current.map((item) =>
        item.id === action.id
          ? {
              ...item,
              title: values.title,
              milestone_id: values.milestoneId,
              estimated_minutes: values.estimatedMinutes,
              notes: values.notes,
            }
          : item,
      ),
    );
    return true;
  };

  const createTask = async (values: QuickGoalTaskValues) => {
    if (!userId || !values.goalId || !values.title.trim() || !values.scheduledDate) return false;

    const minutes = Number(values.estimatedMinutes || 0);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
      toast({
        title: "Check the task duration",
        description: "Task duration must be between 0 and 1,440 minutes.",
        variant: "destructive",
      });
      return false;
    }

    const selectedAction = values.weeklyActionId
      ? actionMap.get(values.weeklyActionId) ?? null
      : null;

    const goalId = selectedAction?.goal_id ?? values.goalId;
    const goal = goalMap.get(goalId);
    if (!goal) {
      toast({
        title: "Goal context is missing",
        description: "Choose an available goal before adding this task.",
        variant: "destructive",
      });
      return false;
    }

    if (selectedAction && selectedAction.goal_id !== values.goalId) {
      toast({
        title: "Weekly action does not match this goal",
        variant: "destructive",
      });
      return false;
    }

    const milestoneId =
      selectedAction?.milestone_id ??
      values.milestoneId;

    if (
      milestoneId &&
      milestoneMap.get(milestoneId)?.goal_id !== goalId
    ) {
      toast({
        title: "Milestone does not match this goal",
        variant: "destructive",
      });
      return false;
    }

    if (goal.start_date && values.scheduledDate < goal.start_date) {
      toast({
        title: "Date is before the goal starts",
        description: `Choose ${goal.start_date} or later.`,
        variant: "destructive",
      });
      return false;
    }

    if (goal.end_date && values.scheduledDate > goal.end_date) {
      toast({
        title: "Date is after the goal deadline",
        description: `This goal currently ends on ${goal.end_date}.`,
        variant: "destructive",
      });
      return false;
    }

    if (values.scheduledTime && minutes > 0) {
      const protectedConflicts = taskConflicts(
        values.scheduledDate,
        values.scheduledTime,
        minutes,
      );
      const taskOverlaps = scheduledTaskConflicts(
        values.scheduledDate,
        values.scheduledTime,
        minutes,
      );

      if (protectedConflicts.length || taskOverlaps.length) {
        const conflictNames = [
          ...protectedConflicts.map((block) => block.title),
          ...taskOverlaps.map((task) => task.title),
        ];
        toast({
          title: "This time is already occupied",
          description: `Choose another time or leave the task untimed. Conflict: ${conflictNames.join(", ")}.`,
          variant: "destructive",
        });
        return false;
      }
    }

    const destinationWeekStart = mondayKey(parseISO(values.scheduledDate));
    const destinationWeekEnd = endOfWeekKey(destinationWeekStart);
    const destinationCapacity = capacityForWeek(destinationWeekStart, destinationWeekEnd);

    const destinationTaskMinutes = tasks
      .filter(
        (item) =>
          item.scheduled_date &&
          item.scheduled_date >= destinationWeekStart &&
          item.scheduled_date <= destinationWeekEnd &&
          (item.status === "planned" || item.status === "completed"),
      )
      .reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0);

    const destinationGoalMinutes = tasks
      .filter(
        (item) =>
          item.goal_id === goalId &&
          item.scheduled_date &&
          item.scheduled_date >= destinationWeekStart &&
          item.scheduled_date <= destinationWeekEnd &&
          (item.status === "planned" || item.status === "completed"),
      )
      .reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0);

    const warnings: string[] = [];

    if (
      defaultCapacity !== null &&
      destinationTaskMinutes + minutes > destinationCapacity.hours * 60 + 1
    ) {
      warnings.push(
        `Adding this task would put ${hoursLabel(destinationTaskMinutes + minutes)} of goal work into a week with ${destinationCapacity.hours.toFixed(1)}h of capacity.`,
      );
    }

    if (CONFIRMED_EFFORT.has(goal.effort_source)) {
      const goalBudgetMinutes = Math.round(
        effortForGoalDuring(goal, destinationWeekStart, destinationWeekEnd) * 60,
      );
      if (destinationGoalMinutes + minutes > goalBudgetMinutes + 1) {
        warnings.push(
          `“${goal.title}” would have ${hoursLabel(destinationGoalMinutes + minutes)} scheduled against its ${hoursLabel(goalBudgetMinutes)} confirmed weekly commitment.`,
        );
      }
    }

    if (
      warnings.length &&
      !window.confirm(
        `${warnings.join("\n\n")}\n\nAdd the task anyway? The planner will keep the pressure visible so you can adjust it deliberately.`,
      )
    ) {
      return false;
    }

    const { data, error } = await supabase
      .from("goal_tasks")
      .insert({
        user_id: userId,
        goal_id: goalId,
        milestone_id: milestoneId,
        weekly_action_id: selectedAction?.id ?? null,
        title: values.title.trim(),
        scheduled_date: values.scheduledDate,
        scheduled_time: values.scheduledTime || null,
        estimated_minutes: minutes,
        notes: values.notes,
        display_order: tasks.filter(
          (task) =>
            task.scheduled_date &&
            task.scheduled_date >= destinationWeekStart &&
            task.scheduled_date <= destinationWeekEnd,
        ).length,
      })
      .select("*")
      .single();

    if (error) {
      toast({
        title: "Task could not be added",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }

    setTasks((current) => [...current, data]);
    return true;
  };

  const addTask = async () => {
    if (!taskDraft.goalId || !taskDraft.title.trim()) return;

    setSavingTask(true);
    const created = await createTask({
      goalId: taskDraft.goalId,
      milestoneId: taskDraft.milestoneId === "none" ? null : taskDraft.milestoneId,
      weeklyActionId: taskDraft.actionId === "none" ? null : taskDraft.actionId,
      title: taskDraft.title,
      scheduledDate: taskDraft.scheduledDate,
      scheduledTime: taskDraft.scheduledTime,
      estimatedMinutes: Number(taskDraft.estimatedMinutes || 0),
      notes: "",
    });
    setSavingTask(false);

    if (!created) return;

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

  const saveTaskEdits = async (task: GoalTask, values: GoalTaskEditValues) => {
    const goal = goalMap.get(task.goal_id);
    if (!goal) {
      toast({
        title: "Goal context is missing",
        description: "This task cannot be edited until its goal is available.",
        variant: "destructive",
      });
      return false;
    }

    if (values.scheduledTime && !values.scheduledDate) {
      toast({
        title: "Choose a date for timed work",
        description: "A clock time needs a scheduled date.",
        variant: "destructive",
      });
      return false;
    }

    if (values.scheduledDate && goal.start_date && values.scheduledDate < goal.start_date) {
      toast({
        title: "Date is before the goal starts",
        description: `Choose ${goal.start_date} or later.`,
        variant: "destructive",
      });
      return false;
    }

    if (values.scheduledDate && goal.end_date && values.scheduledDate > goal.end_date) {
      toast({
        title: "Date is after the goal deadline",
        description: `This goal currently ends on ${goal.end_date}.`,
        variant: "destructive",
      });
      return false;
    }

    if (values.scheduledDate && values.scheduledTime && values.estimatedMinutes > 0) {
      const protectedConflicts = taskConflicts(
        values.scheduledDate,
        values.scheduledTime,
        values.estimatedMinutes,
      );
      const taskOverlaps = scheduledTaskConflicts(
        values.scheduledDate,
        values.scheduledTime,
        values.estimatedMinutes,
        task.id,
      );

      if (protectedConflicts.length || taskOverlaps.length) {
        const conflictNames = [
          ...protectedConflicts.map((block) => block.title),
          ...taskOverlaps.map((item) => item.title),
        ];
        toast({
          title: "This time is already occupied",
          description: `Choose another time or leave the task untimed. Conflict: ${conflictNames.join(", ")}.`,
          variant: "destructive",
        });
        return false;
      }
    }

    if (
      values.scheduledDate &&
      (task.status === "planned" || task.status === "completed")
    ) {
      const destinationWeekStart = mondayKey(parseISO(values.scheduledDate));
      const destinationWeekEnd = endOfWeekKey(destinationWeekStart);
      const destinationCapacity = capacityForWeek(destinationWeekStart, destinationWeekEnd);

      const destinationTaskMinutes = tasks
        .filter(
          (item) =>
            item.id !== task.id &&
            item.scheduled_date &&
            item.scheduled_date >= destinationWeekStart &&
            item.scheduled_date <= destinationWeekEnd &&
            (item.status === "planned" || item.status === "completed"),
        )
        .reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0);

      const destinationGoalMinutes = tasks
        .filter(
          (item) =>
            item.id !== task.id &&
            item.goal_id === task.goal_id &&
            item.scheduled_date &&
            item.scheduled_date >= destinationWeekStart &&
            item.scheduled_date <= destinationWeekEnd &&
            (item.status === "planned" || item.status === "completed"),
        )
        .reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0);

      const warnings: string[] = [];

      if (
        defaultCapacity !== null &&
        destinationTaskMinutes + values.estimatedMinutes > destinationCapacity.hours * 60 + 1
      ) {
        warnings.push(
          `This edit would put ${hoursLabel(destinationTaskMinutes + values.estimatedMinutes)} of scheduled goal work into a week with ${destinationCapacity.hours.toFixed(1)}h of capacity.`,
        );
      }

      if (CONFIRMED_EFFORT.has(goal.effort_source)) {
        const goalBudgetMinutes = Math.round(
          effortForGoalDuring(goal, destinationWeekStart, destinationWeekEnd) * 60,
        );
        if (destinationGoalMinutes + values.estimatedMinutes > goalBudgetMinutes + 1) {
          warnings.push(
            `“${goal.title}” would have ${hoursLabel(destinationGoalMinutes + values.estimatedMinutes)} scheduled against its ${hoursLabel(goalBudgetMinutes)} confirmed weekly commitment.`,
          );
        }
      }

      if (
        warnings.length &&
        !window.confirm(
          `${warnings.join("\n\n")}\n\nSave the edit anyway? The planner will keep the pressure visible so you can adjust it deliberately.`,
        )
      ) {
        return false;
      }
    }

    return updateTask(task.id, {
      title: values.title,
      scheduled_date: values.scheduledDate || null,
      scheduled_time: values.scheduledTime || null,
      estimated_minutes: values.estimatedMinutes,
      notes: values.notes,
    });
  };

  const rescheduleTask = async (task: GoalTask, nextDate: string) => {
    const goal = goalMap.get(task.goal_id);
    if (!goal) {
      toast({
        title: "Goal context is missing",
        description: "This task cannot be rescheduled until its goal is available.",
        variant: "destructive",
      });
      return;
    }

    if (goal.start_date && nextDate < goal.start_date) {
      toast({
        title: "Date is before the goal starts",
        description: `Choose ${goal.start_date} or later.`,
        variant: "destructive",
      });
      return;
    }

    if (goal.end_date && nextDate > goal.end_date) {
      toast({
        title: "Date is after the goal deadline",
        description: `This goal currently ends on ${goal.end_date}. Change the goal window first if you want to plan beyond it.`,
        variant: "destructive",
      });
      return;
    }

    const destinationWeekStart = mondayKey(parseISO(nextDate));
    const destinationWeekEnd = endOfWeekKey(destinationWeekStart);
    const destinationCapacity = capacityForWeek(destinationWeekStart, destinationWeekEnd);
    const taskMinutes = Number(task.estimated_minutes || 0);

    const destinationTaskMinutes = tasks
      .filter(
        (item) =>
          item.id !== task.id &&
          item.scheduled_date &&
          item.scheduled_date >= destinationWeekStart &&
          item.scheduled_date <= destinationWeekEnd &&
          (item.status === "planned" || item.status === "completed"),
      )
      .reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0);

    const destinationGoalMinutes = tasks
      .filter(
        (item) =>
          item.id !== task.id &&
          item.goal_id === task.goal_id &&
          item.scheduled_date &&
          item.scheduled_date >= destinationWeekStart &&
          item.scheduled_date <= destinationWeekEnd &&
          (item.status === "planned" || item.status === "completed"),
      )
      .reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0);

    const warnings: string[] = [];

    if (
      defaultCapacity !== null &&
      destinationTaskMinutes + taskMinutes > destinationCapacity.hours * 60 + 1
    ) {
      warnings.push(
        `The destination week would contain ${hoursLabel(destinationTaskMinutes + taskMinutes)} of scheduled goal tasks against ${destinationCapacity.hours.toFixed(1)}h of capacity.`,
      );
    }

    if (CONFIRMED_EFFORT.has(goal.effort_source)) {
      const goalBudgetMinutes = Math.round(
        effortForGoalDuring(goal, destinationWeekStart, destinationWeekEnd) * 60,
      );
      if (destinationGoalMinutes + taskMinutes > goalBudgetMinutes + 1) {
        warnings.push(
          `“${goal.title}” would have ${hoursLabel(destinationGoalMinutes + taskMinutes)} scheduled against its ${hoursLabel(goalBudgetMinutes)} confirmed weekly commitment.`,
        );
      }
    }

    if (
      warnings.length &&
      !window.confirm(
        `${warnings.join("\n\n")}\n\nMove the task anyway? The planner will keep the overload visible so you can adjust it deliberately.`,
      )
    ) {
      return;
    }

    await updateTask(task.id, {
      status: "planned",
      deferred_from_date: task.deferred_from_date ?? task.scheduled_date,
      scheduled_date: nextDate,
      scheduled_time: null,
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

  const deadlineHorizon = dateKey(addDays(now, 14));
  const incompleteDatedMilestones = milestones.filter(
    (milestone) => milestone.status !== "completed" && Boolean(milestone.due_date),
  );
  const overdueMilestones = incompleteDatedMilestones
    .filter((milestone) => milestone.due_date! < today)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const upcomingMilestones = incompleteDatedMilestones
    .filter(
      (milestone) =>
        milestone.due_date! >= today &&
        milestone.due_date! <= deadlineHorizon,
    )
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));

  const selectedDayKey = dateKey(dayAnchor);
  const selectedDayTasks = tasks
    .filter((task) => task.scheduled_date === selectedDayKey && task.status !== "deferred")
    .sort((a, b) => (a.scheduled_time ?? "99:99").localeCompare(b.scheduled_time ?? "99:99"));

  const selectedDayTaskMinutes = selectedDayTasks
    .filter((task) => task.status === "planned" || task.status === "completed")
    .reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);

  const selectedDayCompletedTasks = selectedDayTasks.filter(
    (task) => task.status === "completed",
  );
  const selectedDayCompletedMinutes = selectedDayCompletedTasks.reduce(
    (sum, task) => sum + Number(task.estimated_minutes || 0),
    0,
  );
  const selectedDayRemainingTasks = selectedDayTasks.filter(
    (task) => task.status === "planned",
  );
  const selectedDayRemainingMinutes = selectedDayRemainingTasks.reduce(
    (sum, task) => sum + Number(task.estimated_minutes || 0),
    0,
  );
  const selectedDayAnytimeTasks = selectedDayRemainingTasks.filter(
    (task) => !task.scheduled_time,
  );
  const selectedDayCompletionPercent = selectedDayTaskMinutes
    ? Math.round((selectedDayCompletedMinutes / selectedDayTaskMinutes) * 100)
    : 0;

  const currentClockMinutes = now.getHours() * 60 + now.getMinutes();
  const selectedDayNextTimedTask = selectedDayRemainingTasks
    .filter((task) => Boolean(task.scheduled_time))
    .filter((task) => {
      if (selectedDayKey !== today || !task.scheduled_time) return true;
      return timeToMinutes(task.scheduled_time) >= currentClockMinutes;
    })
    .sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""))[0] ?? null;

  const yearStart = dateKey(startOfYear(yearAnchor));
  const yearEnd = dateKey(endOfYear(yearAnchor));
  const yearGoals = planningGoals.filter(
    (goal) =>
      Boolean(goal.start_date && goal.end_date) &&
      overlapsRange(goal.start_date, goal.end_date, yearStart, yearEnd),
  );
  const yearMilestones = milestones.filter(
    (milestone) => milestone.due_date && milestone.due_date >= yearStart && milestone.due_date <= yearEnd,
  );
  const yearTasks = tasks.filter(
    (task) => task.scheduled_date && task.scheduled_date >= yearStart && task.scheduled_date <= yearEnd,
  );
  const yearCompletedTasks = yearTasks.filter((task) => task.status === "completed");
  const yearPlannedMinutes = yearTasks
    .filter((task) => task.status !== "skipped")
    .reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);
  const yearCompletedMinutes = yearCompletedTasks
    .reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);
  const yearCompletedMilestones = yearMilestones.filter((milestone) => milestone.status === "completed");

  const yearMonths = Array.from({ length: 12 }, (_, index) => {
    const anchor = addMonths(startOfYear(yearAnchor), index);
    const start = dateKey(startOfMonth(anchor));
    const end = dateKey(endOfMonth(anchor));
    const monthGoalsInYear = planningGoals.filter(
      (goal) =>
        Boolean(goal.start_date && goal.end_date) &&
        overlapsRange(goal.start_date, goal.end_date, start, end),
    );
    const monthMilestonesInYear = yearMilestones.filter(
      (milestone) =>
        milestone.due_date &&
        milestone.due_date >= start &&
        milestone.due_date <= end,
    );
    const monthTasksInYear = yearTasks.filter(
      (task) =>
        task.scheduled_date &&
        task.scheduled_date >= start &&
        task.scheduled_date <= end,
    );

    return {
      anchor,
      start,
      end,
      goalCount: monthGoalsInYear.length,
      milestoneCount: monthMilestonesInYear.length,
      completedMilestones: monthMilestonesInYear.filter((milestone) => milestone.status === "completed").length,
      taskCount: monthTasksInYear.filter((task) => task.status !== "skipped").length,
      completedTasks: monthTasksInYear.filter((task) => task.status === "completed").length,
      minutes: monthTasksInYear
        .filter((task) => task.status !== "skipped")
        .reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0),
    };
  });

  const monthStart = dateKey(startOfMonth(monthAnchor));
  const monthEnd = dateKey(endOfMonth(monthAnchor));
  const monthGoals = planningGoals.filter(
    (goal) =>
      Boolean(goal.start_date && goal.end_date) &&
      overlapsRange(goal.start_date, goal.end_date, monthStart, monthEnd),
  );
  const monthMilestones = milestones.filter(
    (milestone) => milestone.due_date && milestone.due_date >= monthStart && milestone.due_date <= monthEnd,
  );
  const monthTasks = tasks.filter(
    (task) => task.scheduled_date && task.scheduled_date >= monthStart && task.scheduled_date <= monthEnd,
  );
  const monthExecutionTasks = monthTasks.filter((task) => task.status !== "skipped");
  const monthCompletedTasks = monthExecutionTasks.filter((task) => task.status === "completed");
  const monthPlannedMinutes = monthExecutionTasks.reduce(
    (sum, task) => sum + Number(task.estimated_minutes || 0),
    0,
  );
  const monthCompletedMinutes = monthCompletedTasks.reduce(
    (sum, task) => sum + Number(task.estimated_minutes || 0),
    0,
  );
  const monthCompletedMilestones = monthMilestones.filter(
    (milestone) => milestone.status === "completed",
  );

  const monthWeekSummaries = (() => {
    const summaries: Array<{
      start: string;
      end: string;
      demand: number;
      capacity: number | null;
      scheduled: number;
      taskCount: number;
    }> = [];
    let cursor = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 });
    const endCursor = endOfMonth(monthAnchor);

    while (cursor <= endCursor) {
      const start = dateKey(cursor);
      const end = endOfWeekKey(start);
      const weekTasks = tasks.filter(
        (task) =>
          task.scheduled_date &&
          task.scheduled_date >= start &&
          task.scheduled_date <= end &&
          task.status !== "skipped" &&
          task.status !== "deferred",
      );
      const scheduled = weekTasks.reduce(
        (sum, task) => sum + Number(task.estimated_minutes || 0),
        0,
      ) / 60;
      const capacity = defaultCapacity === null ? null : capacityForWeek(start, end).hours;
      summaries.push({
        start,
        end,
        demand: weeklyGoalDemand(start, end),
        capacity,
        scheduled,
        taskCount: weekTasks.length,
      });
      cursor = addWeeks(cursor, 1);
    }

    return summaries;
  })();

  const actionGoalMilestones = actionDraft.goalId ? milestonesForGoal(actionDraft.goalId) : [];
  const taskGoalMilestones = taskDraft.goalId ? milestonesForGoal(taskDraft.goalId) : [];
  const taskActions = taskDraft.goalId
    ? actionsForGoalAndWeek(taskDraft.goalId, currentWeekStart)
    : [];

  const isoWeekday = (date: Date) => {
    const day = date.getDay();
    return day === 0 ? 7 : day;
  };

  const timeToMinutes = (value: string) => {
    const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
    return hours * 60 + minutes;
  };

  const blockStartsOnDate = (block: FixedBlock, key: string) => {
    if (block.recurrence === "date") return block.specific_date === key;
    if (block.active_start_date && key < block.active_start_date) return false;
    if (block.active_end_date && key > block.active_end_date) return false;
    return block.days_of_week.includes(isoWeekday(parseISO(key)));
  };

  const fixedSegmentsForDate = (key: string) => {
    const date = parseISO(key);
    const previousKey = dateKey(addDays(date, -1));
    const segments: { block: FixedBlock; start: number; end: number }[] = [];

    fixedBlocks.forEach((block) => {
      const start = timeToMinutes(block.start_time);
      const end = timeToMinutes(block.end_time);

      if (blockStartsOnDate(block, key)) {
        segments.push({
          block,
          start,
          end: block.crosses_midnight ? 1440 : end,
        });
      }

      if (block.crosses_midnight && blockStartsOnDate(block, previousKey)) {
        segments.push({ block, start: 0, end });
      }
    });

    return segments.sort((a, b) => a.start - b.start);
  };

  const taskConflicts = (scheduledDate: string, scheduledTime: string, minutes: number) => {
    if (!scheduledDate || !scheduledTime || minutes <= 0) return [] as FixedBlock[];

    const start = timeToMinutes(scheduledTime);
    const end = start + minutes;
    const conflicts = new Map<string, FixedBlock>();

    fixedSegmentsForDate(scheduledDate).forEach((segment) => {
      const taskEnd = Math.min(end, 1440);
      if (start < segment.end && taskEnd > segment.start) {
        conflicts.set(segment.block.id, segment.block);
      }
    });

    if (end > 1440) {
      const nextDate = dateKey(addDays(parseISO(scheduledDate), 1));
      fixedSegmentsForDate(nextDate).forEach((segment) => {
        const spillEnd = end - 1440;
        if (0 < segment.end && spillEnd > segment.start) {
          conflicts.set(segment.block.id, segment.block);
        }
      });
    }

    return Array.from(conflicts.values());
  };

  const scheduledTaskConflicts = (
    scheduledDate: string,
    scheduledTime: string,
    minutes: number,
    excludeTaskId?: string,
  ) => {
    if (!scheduledDate || !scheduledTime || minutes <= 0) return [] as GoalTask[];

    const start = timeToMinutes(scheduledTime);
    const end = start + minutes;
    const conflicts = new Map<string, GoalTask>();

    const compareOnDate = (key: string, candidateStart: number, candidateEnd: number) => {
      tasks.forEach((task) => {
        if (
          task.id === excludeTaskId ||
          task.scheduled_date !== key ||
          !task.scheduled_time ||
          task.status === "skipped" ||
          task.status === "deferred"
        ) return;

        const otherStart = timeToMinutes(task.scheduled_time);
        const otherEnd = otherStart + Number(task.estimated_minutes || 0);
        if (candidateStart < otherEnd && candidateEnd > otherStart) {
          conflicts.set(task.id, task);
        }
      });
    };

    compareOnDate(scheduledDate, start, Math.min(end, 1440));

    if (end > 1440) {
      compareOnDate(
        dateKey(addDays(parseISO(scheduledDate), 1)),
        0,
        end - 1440,
      );
    }

    const previousDate = dateKey(addDays(parseISO(scheduledDate), -1));
    tasks.forEach((task) => {
      if (
        task.id === excludeTaskId ||
        task.scheduled_date !== previousDate ||
        !task.scheduled_time ||
        task.status === "skipped" ||
        task.status === "deferred"
      ) return;

      const otherStart = timeToMinutes(task.scheduled_time);
      const otherEnd = otherStart + Number(task.estimated_minutes || 0);
      if (otherEnd > 1440 && start < otherEnd - 1440) {
        conflicts.set(task.id, task);
      }
    });

    return Array.from(conflicts.values());
  };

  const minutesToTime = (minutes: number) => {
    const bounded = Math.max(0, Math.min(1439, minutes));
    const hours = Math.floor(bounded / 60);
    const mins = bounded % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };

  const freeWindowsForDate = (key: string, excludeTaskId?: string) => {
    const occupied: Array<{ start: number; end: number }> = fixedSegmentsForDate(key)
      .map((segment) => ({ start: segment.start, end: segment.end }));

    tasks.forEach((task) => {
      if (
        task.id === excludeTaskId ||
        task.status === "skipped" ||
        task.status === "deferred" ||
        !task.scheduled_date ||
        !task.scheduled_time
      ) return;

      const start = timeToMinutes(task.scheduled_time);
      const end = start + Number(task.estimated_minutes || 0);

      if (task.scheduled_date === key) {
        occupied.push({ start, end: Math.min(end, 1440) });
      }

      const previousKey = dateKey(addDays(parseISO(key), -1));
      if (task.scheduled_date === previousKey && end > 1440) {
        occupied.push({ start: 0, end: Math.min(end - 1440, 1440) });
      }
    });

    const merged = occupied
      .filter((segment) => segment.end > segment.start)
      .sort((a, b) => a.start - b.start)
      .reduce<Array<{ start: number; end: number }>>((acc, segment) => {
        const last = acc.at(-1);
        if (last && segment.start <= last.end) {
          last.end = Math.max(last.end, segment.end);
        } else {
          acc.push({ ...segment });
        }
        return acc;
      }, []);

    const free: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    merged.forEach((segment) => {
      if (segment.start > cursor) {
        free.push({ start: cursor, end: segment.start });
      }
      cursor = Math.max(cursor, segment.end);
    });
    if (cursor < 1440) free.push({ start: cursor, end: 1440 });

    return free;
  };

  const slotSuggestionsForTask = (task: GoalTask) => {
    if (!task.scheduled_date || task.scheduled_time || task.status !== "planned") {
      return [] as Array<{ start: number; end: number }>;
    }
    const duration = Number(task.estimated_minutes || 0);
    if (duration <= 0) return [];

    return freeWindowsForDate(task.scheduled_date, task.id)
      .filter((window) => window.end - window.start >= duration)
      .slice(0, 4);
  };

  const selectedDayFixedMinutes = (() => {
    const segments = fixedSegmentsForDate(selectedDayKey)
      .map((segment) => ({ start: segment.start, end: segment.end }))
      .sort((a, b) => a.start - b.start);

    if (!segments.length) return 0;

    let total = 0;
    let currentStart = segments[0].start;
    let currentEnd = segments[0].end;

    for (let index = 1; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment.start <= currentEnd) {
        currentEnd = Math.max(currentEnd, segment.end);
      } else {
        total += Math.max(0, currentEnd - currentStart);
        currentStart = segment.start;
        currentEnd = segment.end;
      }
    }

    return total + Math.max(0, currentEnd - currentStart);
  })();

  const selectedDayCalendarLoadMinutes = selectedDayFixedMinutes + selectedDayTaskMinutes;
  const selectedDayCalendarOverbooked = selectedDayCalendarLoadMinutes > 1440;

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

          <div className="flex flex-wrap items-center gap-2">
            <AvailabilityManager
              userId={userId}
              blocks={fixedBlocks}
              onChange={setFixedBlocks}
            />
            {overdueMilestones.length > 0 && (
              <Badge variant="outline" className="w-fit gap-2 border-destructive/30 px-3 py-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {overdueMilestones.length} overdue {overdueMilestones.length === 1 ? "milestone" : "milestones"}
              </Badge>
            )}
            {upcomingMilestones.length > 0 && (
              <Badge variant="outline" className="w-fit gap-2 px-3 py-2">
                <CalendarDays className="h-4 w-4" />
                {upcomingMilestones.length} due in 14 days
              </Badge>
            )}
            {(overdueMilestones.length > 0 || upcomingMilestones.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    Deadline signals
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Upcoming and overdue milestones from your saved goals. These are date signals, not a priority ranking.
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[...overdueMilestones, ...upcomingMilestones].slice(0, 8).map((milestone) => {
                    const overdue = Boolean(milestone.due_date && milestone.due_date < today);
                    return (
                      <button
                        key={milestone.id}
                        type="button"
                        onClick={() => milestone.due_date && openWeekAt(milestone.due_date)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/25"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={overdue ? "outline" : "secondary"} className={overdue ? "border-destructive/30 text-destructive" : ""}>
                              {overdue ? "Overdue" : "Due soon"}
                            </Badge>
                            <Badge variant="outline">{goalMap.get(milestone.goal_id)?.title ?? "Goal"}</Badge>
                          </div>
                          <p className="mt-2 font-medium">{milestone.title}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          {milestone.due_date}
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {planningQueue.length > 0 && (
              <Badge variant="outline" className="w-fit gap-2 border-amber-500/30 px-3 py-2 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                {planningQueue.length} {planningQueue.length === 1 ? "task needs" : "tasks need"} replanning
              </Badge>
            )}
          </div>
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

            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Execution tasks completed</p>
                  <p className="text-2xl font-bold">{yearCompletedTasks.length}/{yearTasks.filter((task) => task.status !== "skipped").length}</p>
                  <p className="text-xs text-muted-foreground">scheduled tasks in this year</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Execution effort completed</p>
                  <p className="text-2xl font-bold">{hoursLabel(yearCompletedMinutes)}</p>
                  <p className="text-xs text-muted-foreground">of {hoursLabel(yearPlannedMinutes)} represented by tasks</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Milestones completed</p>
                  <p className="text-2xl font-bold">{yearCompletedMilestones.length}/{yearMilestones.length}</p>
                  <p className="text-xs text-muted-foreground">dated checkpoints in this year</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Year roadmap by month</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Drill from annual direction into the month where milestones and execution are actually happening.
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {yearMonths.map((month) => (
                  <button
                    key={month.start}
                    type="button"
                    onClick={() => openMonthAt(month.start)}
                    className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/25"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{format(month.anchor, "MMMM")}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="rounded-lg bg-muted/20 p-2">
                        <span className="block font-medium text-foreground">{month.goalCount}</span>
                        active goals
                      </div>
                      <div className="rounded-lg bg-muted/20 p-2">
                        <span className="block font-medium text-foreground">{month.completedMilestones}/{month.milestoneCount}</span>
                        milestones
                      </div>
                      <div className="rounded-lg bg-muted/20 p-2">
                        <span className="block font-medium text-foreground">{month.completedTasks}/{month.taskCount}</span>
                        tasks
                      </div>
                      <div className="rounded-lg bg-muted/20 p-2">
                        <span className="block font-medium text-foreground">{hoursLabel(month.minutes)}</span>
                        represented
                      </div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

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
                                <button
                                  key={milestone.id}
                                  type="button"
                                  onClick={() => milestone.due_date && openMonthAt(milestone.due_date)}
                                  className="flex w-full items-start justify-between gap-3 rounded-lg border bg-muted/15 p-3 text-left text-sm transition-colors hover:bg-muted/30"
                                >
                                  <span>
                                    {milestone.title}
                                    <span className="mt-1 flex flex-wrap gap-1">
                                      {milestone.status === "completed" && (
                                        <Badge variant="secondary" className="text-[10px]">Completed</Badge>
                                      )}
                                      {milestone.status !== "completed" && milestone.due_date && milestone.due_date < today && (
                                        <Badge variant="outline" className="border-destructive/30 text-[10px] text-destructive">Overdue</Badge>
                                      )}
                                    </span>
                                  </span>
                                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                    {milestone.due_date}
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  </span>
                                </button>
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

            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Execution completed</p>
                  <p className="text-2xl font-bold">{monthCompletedTasks.length}/{monthExecutionTasks.length}</p>
                  <p className="text-xs text-muted-foreground">{hoursLabel(monthCompletedMinutes)} of {hoursLabel(monthPlannedMinutes)} represented effort</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Milestones completed</p>
                  <p className="text-2xl font-bold">{monthCompletedMilestones.length}/{monthMilestones.length}</p>
                  <p className="text-xs text-muted-foreground">dated checkpoints this month</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Goals in focus</p>
                  <p className="text-2xl font-bold">{monthGoals.length}</p>
                  <p className="text-xs text-muted-foreground">goals overlapping this month</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Month → Week bridge</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Compare each week's confirmed goal demand, available capacity and execution already scheduled before drilling into the week.
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {monthWeekSummaries.map((week) => {
                  const pressure = week.capacity !== null && week.demand > week.capacity + 0.01;
                  const scheduledPressure = week.capacity !== null && week.scheduled > week.capacity + 0.01;
                  return (
                    <button
                      key={week.start}
                      type="button"
                      onClick={() => openWeekAt(week.start)}
                      className={`rounded-xl border p-4 text-left transition-colors hover:bg-muted/25 ${pressure || scheduledPressure ? "border-amber-500/30 bg-amber-500/5" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">
                          {format(parseISO(week.start), "MMM d")} – {format(parseISO(week.end), "MMM d")}
                        </p>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-background/70 p-2">
                          <p className="text-muted-foreground">Demand</p>
                          <p className="font-semibold">{week.demand.toFixed(1)}h</p>
                        </div>
                        <div className="rounded-lg bg-background/70 p-2">
                          <p className="text-muted-foreground">Capacity</p>
                          <p className="font-semibold">{week.capacity === null ? "—" : `${week.capacity.toFixed(1)}h`}</p>
                        </div>
                        <div className="rounded-lg bg-background/70 p-2">
                          <p className="text-muted-foreground">Scheduled</p>
                          <p className="font-semibold">{week.scheduled.toFixed(1)}h</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{week.taskCount} scheduled tasks</p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

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
                    <button
                      key={milestone.id}
                      type="button"
                      onClick={() => milestone.due_date && openWeekAt(milestone.due_date)}
                      className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/25"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{milestone.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {goalMap.get(milestone.goal_id)?.title} · {milestone.due_date}
                          </p>
                        </div>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    </button>
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
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{task.scheduled_date}</Badge>
                          {task.scheduled_date && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => openWeekAt(task.scheduled_date!)}
                              aria-label="Open task week"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          )}
                          <GoalTaskEditDialog
                            task={task}
                            goalStart={goalMap.get(task.goal_id)?.start_date}
                            goalEnd={goalMap.get(task.goal_id)?.end_date}
                            onSave={(values) => saveTaskEdits(task, values)}
                          />
                        </div>
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

            <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Build this week from the whole portfolio</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  AI can draft the missing weekly actions and dated tasks only after your portfolio fits inside the capacity you confirmed.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={!tasksForWeek.some((task) => task.status !== "skipped" && task.status !== "deferred")}
                  onClick={() =>
                    downloadTasksIcs(
                      tasksForWeek.map((task) => ({
                        ...task,
                        goalTitle: goalMap.get(task.goal_id)?.title,
                      })),
                      `DYP-GOALS-${currentWeekStart}`,
                    )
                  }
                >
                  <Download className="h-4 w-4" />
                  Export week
                </Button>
                <AIWeekPlannerDialog
                  weekStart={currentWeekStart}
                  weekEnd={currentWeekEnd}
                  capacityHours={defaultCapacity === null ? null : currentCapacity.hours}
                  goals={goals}
                  milestones={milestones}
                  effortPeriods={effortPeriods}
                  dependencies={dependencies}
                  actions={actions}
                  tasks={tasks}
                  onApplied={loadPlanner}
                />
              </div>
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

            {currentWeekDependencySignals.length > 0 && (
              <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4">
                <div className="flex items-start gap-2">
                  <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">Confirmed dependencies to keep in view</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      These are relationships you explicitly saved. They do not block execution automatically.
                    </p>
                    <div className="mt-3 space-y-2">
                      {currentWeekDependencySignals.map(({ dependency, prerequisite, dependent }) => (
                        <div key={dependency.id} className="text-xs">
                          <span className="font-medium">{dependent.title}</span>
                          <span className="text-muted-foreground"> depends on </span>
                          <span className="font-medium">{prerequisite?.title ?? "another goal"}</span>
                          {dependency.note ? <span className="text-muted-foreground"> · {dependency.note}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

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

            {weeklyAllocations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">This week's portfolio allocation</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    See how much of each confirmed goal commitment has actually been translated into scheduled execution.
                    This is a planning gap check, not a recommendation to increase workload.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  {weeklyAllocations.map((allocation) => {
                    const committedHours = allocation.committedMinutes / 60;
                    const scheduledHours = allocation.scheduledMinutes / 60;
                    const percent = allocation.committedMinutes > 0
                      ? Math.min(100, Math.round((allocation.scheduledMinutes / allocation.committedMinutes) * 100))
                      : allocation.scheduledMinutes > 0 ? 100 : 0;
                    return (
                      <div
                        key={allocation.goal.id}
                        className={`rounded-xl border p-4 ${allocation.overMinutes > 0 ? "border-amber-500/30 bg-amber-500/5" : ""}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{allocation.goal.life_area}</Badge>
                              <Badge variant="secondary">{priorityLabel(allocation.goal.priority)}</Badge>
                            </div>
                            <p className="mt-2 font-semibold">{allocation.goal.title}</p>
                          </div>
                          <Badge variant={allocation.overMinutes > 0 ? "outline" : "secondary"}>
                            {scheduledHours.toFixed(1)}h / {committedHours.toFixed(1)}h
                          </Badge>
                        </div>

                        <Progress value={percent} className="mt-3" />

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div className="rounded-lg bg-muted/20 p-2">
                            Weekly actions: {hoursLabel(allocation.actionMinutes)}
                          </div>
                          <div className="rounded-lg bg-muted/20 p-2">
                            {allocation.overMinutes > 0
                              ? `${hoursLabel(allocation.overMinutes)} above commitment`
                              : `${hoursLabel(allocation.remainingMinutes)} not yet scheduled`}
                          </div>
                        </div>

                        {pendingDependenciesForGoal(allocation.goal.id).length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {pendingDependenciesForGoal(allocation.goal.id).map((dependency) => (
                              <Badge key={dependency.id} variant="outline" className="gap-1">
                                <Link2 className="h-3 w-3" />
                                depends on {goalMap.get(dependency.prerequisite_goal_id)?.title ?? "goal"}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {allocation.nextMilestone && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Next milestone: <span className="font-medium text-foreground">{allocation.nextMilestone.title}</span>
                            {allocation.nextMilestone.due_date ? ` · ${allocation.nextMilestone.due_date}` : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
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
                              <WeeklyActionEditDialog
                                action={action}
                                milestones={milestonesForGoal(action.goal_id)}
                                milestoneLocked={actionTasks.length > 0}
                                onSave={(values) => saveWeeklyActionEdits(action, values)}
                              />
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

                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-4">
                  {Array.from({ length: 7 }, (_, index) => addDays(parseISO(currentWeekStart), index)).map((date) => {
                    const key = dateKey(date);
                    const dayTasks = tasksForWeek
                      .filter((task) => task.scheduled_date === key)
                      .sort((a, b) => (a.scheduled_time ?? "99:99").localeCompare(b.scheduled_time ?? "99:99"));
                    return (
                      <div key={key} className="min-w-[82vw] snap-start rounded-xl border p-3 sm:min-w-[68vw] md:min-w-0">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openDayAt(key)}
                            className="min-w-0 text-left"
                          >
                            <p className="font-semibold">{format(date, "EEE")}</p>
                            <p className="text-xs text-muted-foreground">{format(date, "MMM d")}</p>
                          </button>
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary">{dayTasks.length}</Badge>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => openDayAt(key)}
                              aria-label={`Open ${format(date, "EEEE")}`}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
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
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <p className="truncate text-xs text-muted-foreground">{goalMap.get(task.goal_id)?.title}</p>
                                <GoalTaskEditDialog
                                  task={task}
                                  goalStart={goalMap.get(task.goal_id)?.start_date}
                                  goalEnd={goalMap.get(task.goal_id)?.end_date}
                                  onSave={(values) => saveTaskEdits(task, values)}
                                />
                              </div>
                            </div>
                          )) : <p className="text-xs text-muted-foreground">No tasks</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <WeeklyExecutionReview
              weekStart={currentWeekStart}
              tasks={tasks}
            />
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

            <div className="flex justify-end">
              <QuickGoalTaskDialog
                selectedDate={selectedDayKey}
                goals={planningGoals}
                milestones={milestones}
                actions={actions}
                onCreate={createTask}
              />
            </div>

            {planningQueue.length > 0 && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <AlertTriangle className="h-5 w-5 text-amber-700" />
                        Replanning queue
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Missed and deferred tasks stay visible until you deliberately reschedule or skip them.
                      </p>
                    </div>
                    <AIReplanDialog
                      currentDate={today}
                      queueTasks={planningQueue}
                      goals={goals}
                      milestones={milestones}
                      allTasks={tasks}
                      onReschedule={rescheduleTask}
                    />
                  </div>
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

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Goal work scheduled</p>
                  <p className="text-2xl font-bold">{hoursLabel(selectedDayTaskMinutes)}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedDayTasks.filter((task) => task.status === "planned" || task.status === "completed").length} active tasks
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold">{hoursLabel(selectedDayCompletedMinutes)}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedDayCompletedTasks.length}/{selectedDayTasks.filter((task) => task.status !== "skipped").length} tasks
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Remaining goal work</p>
                  <p className="text-2xl font-bold">{hoursLabel(selectedDayRemainingMinutes)}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedDayAnytimeTasks.length} without a clock time
                  </p>
                </CardContent>
              </Card>
              <Card className={selectedDayCalendarOverbooked ? "border-amber-500/30 bg-amber-500/5" : ""}>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Protected commitments</p>
                  <p className="text-2xl font-bold">{hoursLabel(selectedDayFixedMinutes)}</p>
                  <p className="text-xs text-muted-foreground">
                    {fixedSegmentsForDate(selectedDayKey).length} fixed time blocks
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Daily execution progress</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedDayCompletionPercent}% of scheduled goal-task time completed.
                    </p>
                  </div>
                  {selectedDayNextTimedTask ? (
                    <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                      <span className="text-xs text-muted-foreground">Next timed task</span>
                      <p className="font-medium">
                        {selectedDayNextTimedTask.scheduled_time?.slice(0, 5)} · {selectedDayNextTimedTask.title}
                      </p>
                    </div>
                  ) : selectedDayAnytimeTasks.length > 0 ? (
                    <Badge variant="outline">
                      {selectedDayAnytimeTasks.length} anytime {selectedDayAnytimeTasks.length === 1 ? "task" : "tasks"} remaining
                    </Badge>
                  ) : (
                    <Badge variant="secondary">No remaining timed task</Badge>
                  )}
                </div>
                <Progress value={selectedDayCompletionPercent} />
              </CardContent>
            </Card>

            {selectedDayAnytimeTasks.some((task) => Number(task.estimated_minutes || 0) > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Place anytime tasks into free windows</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Suggestions are calculated only from the protected commitments and timed tasks you have saved. Add sleep, work, classes or other fixed blocks for more realistic windows.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedDayAnytimeTasks
                    .filter((task) => Number(task.estimated_minutes || 0) > 0)
                    .map((task) => {
                      const suggestions = slotSuggestionsForTask(task);
                      return (
                        <div key={task.id} className="rounded-xl border p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-medium">{task.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {task.estimated_minutes} min · {goalMap.get(task.goal_id)?.title ?? "Goal"}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {suggestions.length ? suggestions.map((window) => {
                                const duration = Number(task.estimated_minutes || 0);
                                const start = window.start;
                                const end = start + duration;
                                return (
                                  <Button
                                    key={`${task.id}-${start}`}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateTask(task.id, {
                                      scheduled_time: minutesToTime(start),
                                    })}
                                  >
                                    {minutesToTime(start)}–{end >= 1440 ? "24:00" : minutesToTime(end)}
                                  </Button>
                                );
                              }) : (
                                <Badge variant="outline">No saved free window fits this task</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </CardContent>
              </Card>
            )}

            {selectedDayCalendarOverbooked && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-medium text-amber-800">This day represents more than 24 hours of commitments</p>
                  <p className="mt-1 text-muted-foreground">
                    Fixed commitments plus scheduled goal-task estimates total {hoursLabel(selectedDayCalendarLoadMinutes)}.
                    Check overlaps, task estimates, or dates before relying on this day as executable.
                  </p>
                </div>
              </div>
            )}

            {fixedSegmentsForDate(selectedDayKey).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Fixed commitments</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Protected time for this day. Goal tasks with clock times cannot overlap these blocks.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {fixedSegmentsForDate(selectedDayKey).map((segment, index) => (
                    <div key={`${segment.block.id}-${index}`} className="rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{segment.block.category}</Badge>
                        <Badge variant="outline">
                          {String(Math.floor(segment.start / 60)).padStart(2, "0")}:{String(segment.start % 60).padStart(2, "0")}
                          –
                          {segment.end === 1440
                            ? "24:00"
                            : `${String(Math.floor(segment.end / 60)).padStart(2, "0")}:${String(segment.end % 60).padStart(2, "0")}`}
                        </Badge>
                      </div>
                      <p className="mt-2 font-medium">{segment.block.title}</p>
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
                            <GoalTaskEditDialog
                              task={task}
                              goalStart={goalMap.get(task.goal_id)?.start_date}
                              goalEnd={goalMap.get(task.goal_id)?.end_date}
                              onSave={(values) => saveTaskEdits(task, values)}
                            />
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
