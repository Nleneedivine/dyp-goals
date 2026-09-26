import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Gauge,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type GoalEffortPeriod = Tables<"goal_effort_periods">;
type GoalCapacityPeriod = Tables<"goal_capacity_periods">;

interface GoalContribution {
  id: string;
  title: string;
  hours: number;
  priority: string;
}

interface CapacityWindow {
  startDate: string;
  endDate: string;
  demand: number;
  capacity: number;
  contributors: GoalContribution[];
  capacityLabel: string;
}

const INCLUDED_STATUSES = new Set(["draft", "active"]);
const CONFIRMED_EFFORT_SOURCES = new Set(["user_confirmed", "ai_estimate_confirmed"]);
const EPSILON = 0.01;

const dateToUtc = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const utcToDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (value: string, days: number) => {
  const date = dateToUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return utcToDate(date);
};

const formatDate = (value: string) =>
  dateToUtc(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const formatWindow = (startDate: string, endDate: string) =>
  startDate === endDate
    ? formatDate(startDate)
    : `${formatDate(startDate)} – ${formatDate(endDate)}`;

const windowsEquivalent = (a: CapacityWindow, b: CapacityWindow) => {
  if (
    Math.abs(a.demand - b.demand) > EPSILON ||
    Math.abs(a.capacity - b.capacity) > EPSILON ||
    a.capacityLabel !== b.capacityLabel ||
    a.contributors.length !== b.contributors.length
  ) return false;

  return a.contributors.every((item, index) => {
    const other = b.contributors[index];
    return other && item.id === other.id && Math.abs(item.hours - other.hours) <= EPSILON;
  });
};

export function GoalCapacityChecker({ goals }: { goals: Goal[] }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [defaultCapacity, setDefaultCapacity] = useState("");
  const [capacityConfigured, setCapacityConfigured] = useState(false);
  const [effortPeriods, setEffortPeriods] = useState<GoalEffortPeriod[]>([]);
  const [capacityPeriods, setCapacityPeriods] = useState<GoalCapacityPeriod[]>([]);
  const [periodDraft, setPeriodDraft] = useState({
    label: "",
    startDate: "",
    endDate: "",
    hoursPerWeek: "",
  });

  const goalIdsKey = goals.map((goal) => `${goal.id}:${goal.updated_at}`).join("|");

  const loadCapacityData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [settingsResult, periodsResult, effortResult] = await Promise.all([
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
      goals.length
        ? supabase
            .from("goal_effort_periods")
            .select("*")
            .in("goal_id", goals.map((goal) => goal.id))
            .order("start_date", { ascending: true })
        : Promise.resolve({ data: [] as GoalEffortPeriod[], error: null }),
    ]);

    if (settingsResult.error) {
      toast({
        title: "Capacity settings could not be loaded",
        description: settingsResult.error.message,
        variant: "destructive",
      });
    } else if (settingsResult.data) {
      setDefaultCapacity(String(settingsResult.data.default_hours_per_week));
      setCapacityConfigured(true);
    } else {
      setDefaultCapacity("");
      setCapacityConfigured(false);
    }

    if (periodsResult.error) {
      toast({
        title: "Capacity periods could not be loaded",
        description: periodsResult.error.message,
        variant: "destructive",
      });
    } else {
      setCapacityPeriods(periodsResult.data ?? []);
    }

    if (effortResult.error) {
      toast({
        title: "Goal workload phases could not be loaded",
        description: effortResult.error.message,
        variant: "destructive",
      });
    } else {
      setEffortPeriods(effortResult.data ?? []);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadCapacityData();
  }, [goalIdsKey]);

  const saveDefaultCapacity = async () => {
    const hours = Number(defaultCapacity);
    if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
      toast({
        title: "Check your weekly capacity",
        description: "Enter a number from 0 to 168 hours per week.",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSavingCapacity(true);
    const { error } = await supabase
      .from("goal_capacity_settings")
      .upsert({
        user_id: user.id,
        default_hours_per_week: hours,
      }, { onConflict: "user_id" });
    setSavingCapacity(false);

    if (error) {
      toast({
        title: "Capacity could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setCapacityConfigured(true);
    toast({
      title: "Weekly capacity saved",
      description: "The checker will compare your confirmed goal demand against this amount.",
    });
  };

  const addCapacityPeriod = async () => {
    const hours = Number(periodDraft.hoursPerWeek);
    if (!periodDraft.startDate || !periodDraft.endDate || periodDraft.endDate < periodDraft.startDate) {
      toast({
        title: "Check the capacity dates",
        description: "Choose a valid start and end date.",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
      toast({
        title: "Check the capacity hours",
        description: "Enter a number from 0 to 168 hours per week.",
        variant: "destructive",
      });
      return;
    }

    const overlapping = capacityPeriods.find(
      (period) => period.start_date <= periodDraft.endDate && period.end_date >= periodDraft.startDate,
    );
    if (overlapping) {
      toast({
        title: "Capacity periods cannot overlap",
        description: `This overlaps “${overlapping.label || "capacity override"}” (${overlapping.start_date} to ${overlapping.end_date}).`,
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setAddingPeriod(true);
    const { error } = await supabase.from("goal_capacity_periods").insert({
      user_id: user.id,
      label: periodDraft.label.trim(),
      start_date: periodDraft.startDate,
      end_date: periodDraft.endDate,
      hours_per_week: hours,
    });
    setAddingPeriod(false);

    if (error) {
      toast({
        title: "Capacity period could not be added",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setPeriodDraft({ label: "", startDate: "", endDate: "", hoursPerWeek: "" });
    await loadCapacityData();
  };

  const deleteCapacityPeriod = async (periodId: string) => {
    const { error } = await supabase.from("goal_capacity_periods").delete().eq("id", periodId);
    if (error) {
      toast({
        title: "Capacity period could not be deleted",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setCapacityPeriods((current) => current.filter((period) => period.id !== periodId));
  };

  const today = new Date().toISOString().slice(0, 10);

  const planningGoals = useMemo(
    () => goals.filter((goal) => INCLUDED_STATUSES.has(goal.status)),
    [goals],
  );

  const unconfirmedGoals = useMemo(
    () => planningGoals.filter((goal) => !CONFIRMED_EFFORT_SOURCES.has(goal.effort_source)),
    [planningGoals],
  );

  const confirmedGoals = useMemo(
    () => planningGoals.filter((goal) => CONFIRMED_EFFORT_SOURCES.has(goal.effort_source)),
    [planningGoals],
  );

  const unscheduledGoals = useMemo(
    () => confirmedGoals.filter((goal) => !goal.start_date || !goal.end_date),
    [confirmedGoals],
  );

  const scheduledGoals = useMemo(
    () => confirmedGoals.filter(
      (goal) => Boolean(goal.start_date && goal.end_date && goal.end_date >= today),
    ),
    [confirmedGoals, today],
  );

  const periodsByGoal = useMemo(() => {
    const map = new Map<string, GoalEffortPeriod[]>();
    effortPeriods.forEach((period) => {
      const current = map.get(period.goal_id) ?? [];
      current.push(period);
      map.set(period.goal_id, current);
    });
    return map;
  }, [effortPeriods]);

  const capacityWindows = useMemo(() => {
    if (!scheduledGoals.length) return [] as CapacityWindow[];

    const horizonStart = scheduledGoals
      .map((goal) => goal.start_date! < today ? today : goal.start_date!)
      .sort()[0];
    const horizonEnd = scheduledGoals
      .map((goal) => goal.end_date!)
      .sort()
      .at(-1)!;

    const boundaries = new Set<string>([horizonStart, addDays(horizonEnd, 1)]);

    scheduledGoals.forEach((goal) => {
      boundaries.add(goal.start_date! < today ? today : goal.start_date!);
      boundaries.add(addDays(goal.end_date!, 1));

      (periodsByGoal.get(goal.id) ?? []).forEach((period) => {
        if (period.end_date < horizonStart || period.start_date > horizonEnd) return;
        boundaries.add(period.start_date < horizonStart ? horizonStart : period.start_date);
        const afterEnd = addDays(period.end_date, 1);
        boundaries.add(afterEnd > addDays(horizonEnd, 1) ? addDays(horizonEnd, 1) : afterEnd);
      });
    });

    capacityPeriods.forEach((period) => {
      if (period.end_date < horizonStart || period.start_date > horizonEnd) return;
      boundaries.add(period.start_date < horizonStart ? horizonStart : period.start_date);
      const afterEnd = addDays(period.end_date, 1);
      boundaries.add(afterEnd > addDays(horizonEnd, 1) ? addDays(horizonEnd, 1) : afterEnd);
    });

    const sortedBoundaries = Array.from(boundaries).sort();
    const rawWindows: CapacityWindow[] = [];

    for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
      const startDate = sortedBoundaries[index];
      const endDate = addDays(sortedBoundaries[index + 1], -1);
      if (endDate < startDate || startDate > horizonEnd || endDate < horizonStart) continue;

      const contributors = scheduledGoals
        .filter((goal) => goal.start_date! <= startDate && goal.end_date! >= startDate)
        .map((goal) => {
          const phase = (periodsByGoal.get(goal.id) ?? []).find(
            (period) => period.start_date <= startDate && period.end_date >= startDate,
          );
          return {
            id: goal.id,
            title: goal.title,
            hours: Number(phase?.hours_per_week ?? goal.estimated_hours_per_week ?? 0),
            priority: goal.priority,
          };
        })
        .filter((item) => item.hours > 0)
        .sort((a, b) => a.title.localeCompare(b.title));

      if (!contributors.length) continue;

      const demand = contributors.reduce((sum, item) => sum + item.hours, 0);
      const capacityOverride = capacityPeriods.find(
        (period) => period.start_date <= startDate && period.end_date >= startDate,
      );
      const capacity = Number(
        capacityOverride?.hours_per_week ?? (capacityConfigured ? defaultCapacity || 0 : 0),
      );

      rawWindows.push({
        startDate,
        endDate,
        demand,
        capacity,
        contributors,
        capacityLabel: capacityOverride?.label?.trim() || (capacityOverride ? "Temporary capacity" : "Normal capacity"),
      });
    }

    const merged: CapacityWindow[] = [];
    rawWindows.forEach((window) => {
      const previous = merged.at(-1);
      if (previous && addDays(previous.endDate, 1) === window.startDate && windowsEquivalent(previous, window)) {
        previous.endDate = window.endDate;
      } else {
        merged.push({ ...window, contributors: [...window.contributors] });
      }
    });

    return merged;
  }, [
    scheduledGoals,
    periodsByGoal,
    capacityPeriods,
    capacityConfigured,
    defaultCapacity,
    today,
  ]);

  const overloadedWindows = capacityWindows.filter(
    (window) => capacityConfigured && window.demand > window.capacity + EPSILON,
  );
  const peakDemand = capacityWindows.reduce((max, window) => Math.max(max, window.demand), 0);
  const tightestMargin = capacityConfigured && capacityWindows.length
    ? Math.min(...capacityWindows.map((window) => window.capacity - window.demand))
    : null;

  if (loading) {
    return (
      <Card className="mb-8 border-primary/20">
        <CardContent className="animate-pulse space-y-4 pt-6">
          <div className="h-6 w-52 rounded bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
          <div className="h-32 rounded-xl bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8 border-primary/20">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Portfolio capacity checker
            </CardTitle>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Compare the weekly demand of your confirmed, scheduled goals against the time you can realistically devote to goal work.
              The checker surfaces pressure; it does not choose which goal matters more.
            </p>
          </div>
          {capacityConfigured && (
            <Badge variant={overloadedWindows.length ? "outline" : "secondary"}>
              {overloadedWindows.length
                ? `${overloadedWindows.length} overloaded ${overloadedWindows.length === 1 ? "window" : "windows"}`
                : "No overload detected"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-7">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-xl border p-4">
            <Label htmlFor="default-goal-capacity">Normal goal-work capacity</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter the hours you can realistically give to these goals each week after fixed commitments such as work, classes, sleep, family and ministry.
            </p>
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="default-goal-capacity"
                  type="number"
                  min="0"
                  max="168"
                  step="0.5"
                  value={defaultCapacity}
                  onChange={(event) => setDefaultCapacity(event.target.value)}
                  placeholder="e.g. 15"
                  className="pr-20"
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">hrs/week</span>
              </div>
              <Button onClick={saveDefaultCapacity} disabled={savingCapacity || defaultCapacity === ""} className="gap-2">
                <Save className="h-4 w-4" />
                {savingCapacity ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Confirmed scheduled goals</p>
              <p className="mt-1 text-2xl font-bold">{scheduledGoals.length}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Peak combined demand</p>
              <p className="mt-1 text-2xl font-bold">{peakDemand.toFixed(1)}h</p>
              <p className="text-xs text-muted-foreground">per week</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Tightest margin</p>
              <p className={`mt-1 text-2xl font-bold ${tightestMargin !== null && tightestMargin < 0 ? "text-amber-700" : ""}`}>
                {tightestMargin === null
                  ? "—"
                  : `${tightestMargin >= 0 ? "+" : ""}${tightestMargin.toFixed(1)}h`}
              </p>
              <p className="text-xs text-muted-foreground">capacity minus demand</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-secondary" />
              <h3 className="font-semibold">Temporary capacity changes</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. Use these when a period such as exams, holidays, travel or an intensive project changes how much goal-work time you have.
              These values replace your normal capacity for the specified dates.
            </p>
          </div>

          {capacityPeriods.length > 0 && (
            <div className="mb-4 space-y-2">
              {capacityPeriods.map((period) => (
                <div key={period.id} className="flex flex-col gap-2 rounded-lg border bg-muted/15 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{period.label || "Temporary capacity"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatWindow(period.start_date, period.end_date)} · {Number(period.hours_per_week).toFixed(1)}h/week
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteCapacityPeriod(period.id)}
                    aria-label="Delete capacity period"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-[1fr_150px_150px_130px_auto]">
            <Input
              value={periodDraft.label}
              onChange={(event) => setPeriodDraft((current) => ({ ...current, label: event.target.value }))}
              placeholder="e.g. Exam period"
            />
            <Input
              type="date"
              value={periodDraft.startDate}
              onChange={(event) => setPeriodDraft((current) => ({ ...current, startDate: event.target.value }))}
            />
            <Input
              type="date"
              min={periodDraft.startDate || undefined}
              value={periodDraft.endDate}
              onChange={(event) => setPeriodDraft((current) => ({ ...current, endDate: event.target.value }))}
            />
            <div className="relative">
              <Input
                type="number"
                min="0"
                max="168"
                step="0.5"
                value={periodDraft.hoursPerWeek}
                onChange={(event) => setPeriodDraft((current) => ({ ...current, hoursPerWeek: event.target.value }))}
                placeholder="Hours"
                className="pr-10"
              />
              <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">h/w</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={addCapacityPeriod}
              disabled={addingPeriod || !periodDraft.startDate || !periodDraft.endDate || periodDraft.hoursPerWeek === ""}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        {(unconfirmedGoals.length > 0 || unscheduledGoals.length > 0) && (
          <div className="grid gap-3 lg:grid-cols-2">
            {unconfirmedGoals.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-medium">Not counted: workload not confirmed</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Confirm or save the weekly effort for these goals before using them in capacity calculations.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {unconfirmedGoals.map((goal) => <Badge key={goal.id} variant="outline">{goal.title}</Badge>)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {unscheduledGoals.length > 0 && (
              <div className="rounded-xl border p-4">
                <div className="flex items-start gap-2">
                  <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Not counted: planning dates missing</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Capacity needs both a start and end date so the checker knows when the workload is active.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {unscheduledGoals.map((goal) => <Badge key={goal.id} variant="outline">{goal.title}</Badge>)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!capacityConfigured ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <Clock3 className="mx-auto h-7 w-7 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">Set your normal weekly capacity to run the comparison</h3>
            <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
              Goal demand is already calculated from confirmed goal workloads and workload phases. Capacity is the missing side of the comparison.
            </p>
          </div>
        ) : capacityWindows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No scheduled confirmed workload yet</h3>
            <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
              Add dates and confirm weekly effort on at least one draft or active goal to build the capacity timeline.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold">Capacity timeline</h3>
                <p className="text-xs text-muted-foreground">
                  Workload phases override a goal's typical weekly effort only during the dates covered by that phase.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {capacityWindows.map((window) => {
                const margin = window.capacity - window.demand;
                const overloaded = margin < -EPSILON;
                const nearCapacity = !overloaded && window.capacity > 0 && window.demand / window.capacity >= 0.8;
                const percent = window.capacity > 0
                  ? Math.min(100, Math.max(0, (window.demand / window.capacity) * 100))
                  : window.demand > 0 ? 100 : 0;

                return (
                  <div
                    key={`${window.startDate}-${window.endDate}-${window.capacityLabel}`}
                    className={`rounded-xl border p-4 ${overloaded ? "border-amber-500/30 bg-amber-500/5" : nearCapacity ? "bg-muted/20" : ""}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{formatWindow(window.startDate, window.endDate)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{window.capacityLabel}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{window.demand.toFixed(1)}h demand</Badge>
                        <Badge variant="secondary">{window.capacity.toFixed(1)}h capacity</Badge>
                        <Badge variant={overloaded ? "outline" : "secondary"}>
                          {overloaded
                            ? `${Math.abs(margin).toFixed(1)}h over`
                            : `${margin.toFixed(1)}h remaining`}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${overloaded ? "bg-amber-600" : nearCapacity ? "bg-primary/70" : "bg-primary"}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {window.contributors.map((goal) => (
                        <div key={goal.id} className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2 text-sm">
                          <span className="min-w-0 truncate">{goal.title}</span>
                          <span className="shrink-0 font-medium">{goal.hours.toFixed(1)}h/w</span>
                        </div>
                      ))}
                    </div>

                    {overloaded && (
                      <p className="mt-3 text-xs text-amber-800">
                        This period exceeds the capacity you entered. Review the dates, confirmed workload, capacity, or goal status yourself; the checker will not choose a goal to reduce or postpone.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
