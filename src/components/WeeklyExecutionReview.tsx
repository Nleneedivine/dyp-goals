import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

type GoalTask = Tables<"goal_tasks">;
type WeeklyReview = Tables<"goal_weekly_reviews">;

interface GoalReviewSummary {
  goalId: string;
  title: string;
  plannedTasks: number;
  completedTasks: number;
  plannedMinutes: number;
  completedMinutes: number;
}

const asGoalSummaries = (value: Json): GoalReviewSummary[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, Json | undefined>;
    if (typeof record.goalId !== "string" || typeof record.title !== "string") return [];
    return [{
      goalId: record.goalId,
      title: record.title,
      plannedTasks: Number(record.plannedTasks ?? 0),
      completedTasks: Number(record.completedTasks ?? 0),
      plannedMinutes: Number(record.plannedMinutes ?? 0),
      completedMinutes: Number(record.completedMinutes ?? 0),
    }];
  });
};

export function WeeklyExecutionReview({
  weekStart,
  tasks,
}: {
  weekStart: string;
  tasks: GoalTask[];
}) {
  const { toast } = useToast();
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [recentReviews, setRecentReviews] = useState<WeeklyReview[]>([]);
  const [wins, setWins] = useState("");
  const [blockers, setBlockers] = useState("");
  const [adjustments, setAdjustments] = useState("");
  const [saving, setSaving] = useState(false);
  const weekEnd = format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");
  const currentWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const canReview = weekStart <= currentWeekStart;

  const relevantTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          Boolean(
            (task.scheduled_date && task.scheduled_date >= weekStart && task.scheduled_date <= weekEnd) ||
            (task.deferred_from_date && task.deferred_from_date >= weekStart && task.deferred_from_date <= weekEnd),
          ),
      ),
    [tasks, weekStart, weekEnd],
  );

  const liveMetrics = useMemo(() => {
    const plannedTasks = relevantTasks.length;
    const completedTasks = relevantTasks.filter((task) => task.status === "completed").length;
    const plannedMinutes = relevantTasks.reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);
    const completedMinutes = relevantTasks
      .filter((task) => task.status === "completed")
      .reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);

    return {
      plannedTasks,
      completedTasks,
      plannedMinutes,
      completedMinutes,
      taskRate: plannedTasks ? Math.round((completedTasks / plannedTasks) * 100) : 0,
      minuteRate: plannedMinutes ? Math.round((completedMinutes / plannedMinutes) * 100) : 0,
    };
  }, [relevantTasks]);

  const loadReviews = async () => {
    const [selectedResult, recentResult] = await Promise.all([
      supabase
        .from("goal_weekly_reviews")
        .select("*")
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabase
        .from("goal_weekly_reviews")
        .select("*")
        .lte("week_start", weekStart)
        .order("week_start", { ascending: false })
        .limit(4),
    ]);

    if (selectedResult.error || recentResult.error) {
      toast({
        title: "Weekly review could not load",
        description: selectedResult.error?.message ?? recentResult.error?.message,
        variant: "destructive",
      });
      return;
    }

    const loaded = selectedResult.data ?? null;
    setReview(loaded);
    setWins(loaded?.wins ?? "");
    setBlockers(loaded?.blockers ?? "");
    setAdjustments(loaded?.adjustments ?? "");
    setRecentReviews(recentResult.data ?? []);
  };

  useEffect(() => {
    void loadReviews();
  }, [weekStart]);

  const saveReview = async () => {
    if (!canReview) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("save_goal_weekly_review", {
      p_week_start: weekStart,
      p_wins: wins.trim(),
      p_blockers: blockers.trim(),
      p_adjustments: adjustments.trim(),
    });
    setSaving(false);

    if (error) {
      toast({
        title: "Weekly review could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setReview(data);
    toast({
      title: "Weekly review saved",
      description: "Your execution snapshot and reflection are ready for future replanning.",
    });
    await loadReviews();
  };

  const completedReviews = recentReviews.filter((item) => item.planned_minutes > 0);
  const repeatedUnderExecution =
    completedReviews.length >= 2 &&
    completedReviews.slice(0, 2).every(
      (item) => item.completed_minutes / Math.max(item.planned_minutes, 1) < 0.6,
    );

  const perGoal = review ? asGoalSummaries(review.per_goal_summary) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <RefreshCw className="h-5 w-5 text-primary" />
              Weekly review
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Review what happened before changing the next plan. The snapshot is based on persistent execution data, not self-scoring.
            </p>
          </div>
          {review && <Badge variant="secondary">Saved</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Tasks completed</p>
            <p className="mt-1 text-2xl font-bold">{liveMetrics.completedTasks}/{liveMetrics.plannedTasks}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Task completion</p>
            <p className="mt-1 text-2xl font-bold">{liveMetrics.taskRate}%</p>
            <Progress value={liveMetrics.taskRate} className="mt-2" />
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Planned effort</p>
            <p className="mt-1 text-2xl font-bold">{(liveMetrics.plannedMinutes / 60).toFixed(1)}h</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Completed effort</p>
            <p className="mt-1 text-2xl font-bold">{(liveMetrics.completedMinutes / 60).toFixed(1)}h</p>
            <p className="text-xs text-muted-foreground">{liveMetrics.minuteRate}% of planned time</p>
          </div>
        </div>

        {repeatedUnderExecution && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-medium text-amber-800">Recent plans may be heavier than actual execution</p>
              <p className="mt-1 text-muted-foreground">
                The last two saved reviews each completed less than 60% of their planned task time. Before adding more work,
                review your workload, deadlines, capacity, or priorities. The system will not decide which one you should change.
              </p>
            </div>
          </div>
        )}

        {perGoal.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">Saved goal-by-goal snapshot</p>
            <div className="grid gap-2 md:grid-cols-2">
              {perGoal.map((item) => (
                <div key={item.goalId} className="rounded-lg border p-3">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.completedTasks}/{item.plannedTasks} tasks · {(item.completedMinutes / 60).toFixed(1)}h/{(item.plannedMinutes / 60).toFixed(1)}h
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!canReview ? (
          <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            This is a future week. Review becomes available when the week begins.
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <label className="text-sm font-medium">What worked?</label>
                <Textarea
                  value={wins}
                  onChange={(event) => setWins(event.target.value)}
                  placeholder="Wins, useful routines, progress..."
                  className="mt-2 min-h-[120px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium">What got in the way?</label>
                <Textarea
                  value={blockers}
                  onChange={(event) => setBlockers(event.target.value)}
                  placeholder="Interruptions, unrealistic estimates, obstacles..."
                  className="mt-2 min-h-[120px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium">What should change next?</label>
                <Textarea
                  value={adjustments}
                  onChange={(event) => setAdjustments(event.target.value)}
                  placeholder="A decision you want the next plan to respect..."
                  className="mt-2 min-h-[120px]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border bg-muted/15 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Saving refreshes the execution snapshot from your tasks and preserves your reflection for future adaptive replanning.
                </p>
              </div>
              <Button onClick={saveReview} disabled={saving} className="shrink-0 gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {saving ? "Saving..." : review ? "Update review" : "Save review"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
