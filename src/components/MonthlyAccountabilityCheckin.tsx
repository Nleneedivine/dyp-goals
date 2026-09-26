import { useEffect, useMemo, useState } from "react";
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type GoalTask = Tables<"goal_tasks">;
type Milestone = Tables<"goal_milestones">;
type MonthlyCheckin = Tables<"goal_monthly_checkins">;

const monthKey = (date: Date) => format(startOfMonth(date), "yyyy-MM-dd");
const dateKey = (date: Date) => format(date, "yyyy-MM-dd");

const hoursLabel = (minutes: number) => {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
};

export function MonthlyAccountabilityCheckin({
  tasks,
  milestones,
}: {
  tasks: GoalTask[];
  milestones: Milestone[];
}) {
  const { toast } = useToast();
  const currentMonthStart = monthKey(new Date());
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStart);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedCheckin, setSavedCheckin] = useState<MonthlyCheckin | null>(null);
  const [wins, setWins] = useState("");
  const [blockers, setBlockers] = useState("");
  const [adjustments, setAdjustments] = useState("");
  const [nextMonthFocus, setNextMonthFocus] = useState("");

  const selectedDate = parseISO(selectedMonth);
  const selectedMonthEnd = dateKey(endOfMonth(selectedDate));
  const isCurrentMonth = selectedMonth === currentMonthStart;

  const liveStats = useMemo(() => {
    const monthTasks = tasks.filter(
      (task) =>
        task.status !== "skipped" &&
        Boolean(
          task.scheduled_date &&
          task.scheduled_date >= selectedMonth &&
          task.scheduled_date <= selectedMonthEnd,
        ),
    );
    const completedTasks = monthTasks.filter((task) => task.status === "completed");
    const monthMilestones = milestones.filter(
      (milestone) =>
        Boolean(
          milestone.due_date &&
          milestone.due_date >= selectedMonth &&
          milestone.due_date <= selectedMonthEnd,
        ),
    );
    const completedMilestones = monthMilestones.filter(
      (milestone) => milestone.status === "completed",
    );
    const plannedMinutes = monthTasks.reduce(
      (sum, task) => sum + Number(task.estimated_minutes || 0),
      0,
    );
    const completedMinutes = completedTasks.reduce(
      (sum, task) => sum + Number(task.estimated_minutes || 0),
      0,
    );

    return {
      plannedTasks: monthTasks.length,
      completedTasks: completedTasks.length,
      plannedMinutes,
      completedMinutes,
      milestonesDue: monthMilestones.length,
      milestonesCompleted: completedMilestones.length,
    };
  }, [tasks, milestones, selectedMonth, selectedMonthEnd]);

  const effortPercent = liveStats.plannedMinutes
    ? Math.round((liveStats.completedMinutes / liveStats.plannedMinutes) * 100)
    : 0;

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("goal_monthly_checkins")
        .select("*")
        .eq("user_id", user.id)
        .eq("month_start", selectedMonth)
        .maybeSingle();

      if (error) {
        if (error.code === "PGRST205" || error.code === "42P01") {
          setAvailable(false);
          setLoading(false);
          return;
        }

        toast({
          title: "Monthly check-in could not load",
          description: error.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      setAvailable(true);
      const checkin = data as MonthlyCheckin | null;
      setSavedCheckin(checkin);
      setWins(checkin?.wins ?? "");
      setBlockers(checkin?.blockers ?? "");
      setAdjustments(checkin?.adjustments ?? "");
      setNextMonthFocus(checkin?.next_month_focus ?? "");
      setLoading(false);
    };

    void load();
  }, [selectedMonth, toast]);

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.rpc("save_goal_monthly_checkin", {
      p_month_start: selectedMonth,
      p_wins: wins.trim(),
      p_blockers: blockers.trim(),
      p_adjustments: adjustments.trim(),
      p_next_month_focus: nextMonthFocus.trim(),
    });
    setSaving(false);

    if (error) {
      toast({
        title: "Monthly check-in could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setSavedCheckin(data as MonthlyCheckin);
    toast({
      title: "Monthly accountability check-in saved",
      description: "The snapshot and your reflection are now part of your execution history.",
    });
  };

  const moveMonth = (direction: "previous" | "next") => {
    const next = direction === "previous"
      ? subMonths(selectedDate, 1)
      : addMonths(selectedDate, 1);

    const nextKey = monthKey(next);
    if (nextKey > currentMonthStart) return;
    setSelectedMonth(nextKey);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarCheck2 className="h-5 w-5 text-primary" />
            Monthly accountability check-in
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Monthly check-ins are prepared in the app but are not active in this workspace yet. They will become available after the pending database update is applied.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarCheck2 className="h-5 w-5 text-primary" />
              Monthly accountability check-in
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Close the month with a factual execution snapshot and your own reflection. This does not score your character, motivation, or spiritual growth.
            </p>
          </div>
          <Badge variant={savedCheckin ? "secondary" : "outline"}>
            {savedCheckin ? "Saved" : "Not saved"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-xl border p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => moveMonth("previous")}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="font-semibold">{format(selectedDate, "MMMM yyyy")}</p>
            <p className="text-xs text-muted-foreground">
              {isCurrentMonth ? "Current month" : "Past month"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => moveMonth("next")}
            disabled={isCurrentMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Tasks completed</p>
            <p className="mt-1 text-2xl font-bold">
              {liveStats.completedTasks}/{liveStats.plannedTasks}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Represented effort completed</p>
            <p className="mt-1 text-2xl font-bold">{hoursLabel(liveStats.completedMinutes)}</p>
            <p className="text-xs text-muted-foreground">of {hoursLabel(liveStats.plannedMinutes)}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Milestones completed</p>
            <p className="mt-1 text-2xl font-bold">
              {liveStats.milestonesCompleted}/{liveStats.milestonesDue}
            </p>
          </div>
        </div>

        {liveStats.plannedMinutes > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Represented execution completed</span>
              <span>{effortPercent}%</span>
            </div>
            <Progress value={effortPercent} />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Wins</label>
            <Textarea
              className="mt-2 min-h-28"
              value={wins}
              onChange={(event) => setWins(event.target.value)}
              placeholder="What moved forward this month?"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Blockers</label>
            <Textarea
              className="mt-2 min-h-28"
              value={blockers}
              onChange={(event) => setBlockers(event.target.value)}
              placeholder="What repeatedly got in the way?"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Adjustments</label>
            <Textarea
              className="mt-2 min-h-28"
              value={adjustments}
              onChange={(event) => setAdjustments(event.target.value)}
              placeholder="What will you change about the system, workload, schedule, or execution approach?"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Next month focus</label>
            <Textarea
              className="mt-2 min-h-28"
              value={nextMonthFocus}
              onChange={(event) => setNextMonthFocus(event.target.value)}
              placeholder="What needs your attention next month? This is your choice, not an AI priority ranking."
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Monthly reflections stay private unless you separately enable monthly check-in sharing with your assigned accountability mentor.
            </p>
          </div>
          <Button onClick={save} disabled={saving} className="shrink-0 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save check-in"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
