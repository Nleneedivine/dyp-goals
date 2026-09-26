import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flag,
  RefreshCw,
  Target,
} from "lucide-react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ExecutionAdaptationPanel } from "@/components/ExecutionAdaptationPanel";
import { ExecutionTrendCard } from "@/components/ExecutionTrendCard";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type Milestone = Tables<"goal_milestones">;
type GoalTask = Tables<"goal_tasks">;
type WeeklyReview = Tables<"goal_weekly_reviews">;

const VISIBLE_STATUSES = new Set(["draft", "active", "completed"]);

const hoursLabel = (minutes: number) => {
  if (!minutes) return "0h";
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
};

const completionPercent = (completed: number, total: number) =>
  total > 0 ? Math.round((completed / total) * 100) : 0;

export default function ProgressDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<GoalTask[]>([]);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [goalsResult, tasksResult, reviewsResult] = await Promise.all([
        supabase
          .from("goals")
          .select("*")
          .eq("user_id", user.id)
          .neq("status", "archived")
          .order("created_at", { ascending: true }),
        supabase
          .from("goal_tasks")
          .select("*")
          .eq("user_id", user.id)
          .order("scheduled_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("goal_weekly_reviews")
          .select("*")
          .eq("user_id", user.id)
          .order("week_start", { ascending: false })
          .limit(12),
      ]);

      const firstError = goalsResult.error || tasksResult.error || reviewsResult.error;
      if (firstError) {
        toast({
          title: "Progress data could not load",
          description: firstError.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const loadedGoals = goalsResult.data ?? [];
      setGoals(loadedGoals);
      setTasks(tasksResult.data ?? []);
      setReviews(reviewsResult.data ?? []);

      if (loadedGoals.length) {
        const milestoneResult = await supabase
          .from("goal_milestones")
          .select("*")
          .in("goal_id", loadedGoals.map((goal) => goal.id))
          .order("due_date", { ascending: true, nullsFirst: false });

        if (milestoneResult.error) {
          toast({
            title: "Milestone progress could not load",
            description: milestoneResult.error.message,
            variant: "destructive",
          });
        } else {
          setMilestones(milestoneResult.data ?? []);
        }
      } else {
        setMilestones([]);
      }

      setLoading(false);
    };

    void load();
  }, [toast]);

  const visibleGoals = useMemo(
    () => goals.filter((goal) => VISIBLE_STATUSES.has(goal.status)),
    [goals],
  );

  const executionTasks = useMemo(
    () => tasks.filter((task) => task.status !== "skipped"),
    [tasks],
  );

  const completedTasks = useMemo(
    () => executionTasks.filter((task) => task.status === "completed"),
    [executionTasks],
  );

  const plannedMinutes = executionTasks.reduce(
    (sum, task) => sum + Number(task.estimated_minutes || 0),
    0,
  );
  const completedMinutes = completedTasks.reduce(
    (sum, task) => sum + Number(task.estimated_minutes || 0),
    0,
  );

  const completedMilestones = milestones.filter((milestone) => milestone.status === "completed");
  const today = format(new Date(), "yyyy-MM-dd");
  const currentWeekStart = format(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );
  const currentWeekEnd = format(addDays(parseISO(currentWeekStart), 6), "yyyy-MM-dd");

  const currentWeekTasks = executionTasks.filter(
    (task) =>
      Boolean(
        task.scheduled_date &&
        task.scheduled_date >= currentWeekStart &&
        task.scheduled_date <= currentWeekEnd,
      ),
  );
  const currentWeekCompleted = currentWeekTasks.filter((task) => task.status === "completed");
  const currentWeekMinutes = currentWeekTasks.reduce(
    (sum, task) => sum + Number(task.estimated_minutes || 0),
    0,
  );
  const currentWeekCompletedMinutes = currentWeekCompleted.reduce(
    (sum, task) => sum + Number(task.estimated_minutes || 0),
    0,
  );

  const overdueMilestones = milestones.filter(
    (milestone) =>
      milestone.status !== "completed" &&
      Boolean(milestone.due_date && milestone.due_date < today),
  );

  const recentReviewsWithWork = reviews.filter((review) => review.planned_minutes > 0);
  const repeatedUnderExecution =
    recentReviewsWithWork.length >= 2 &&
    recentReviewsWithWork
      .slice(0, 2)
      .every(
        (review) =>
          review.completed_minutes / Math.max(review.planned_minutes, 1) < 0.6,
      );

  const goalSummaries = visibleGoals.map((goal) => {
    const goalTasks = executionTasks.filter((task) => task.goal_id === goal.id);
    const goalCompletedTasks = goalTasks.filter((task) => task.status === "completed");
    const goalMilestones = milestones.filter((milestone) => milestone.goal_id === goal.id);
    const goalCompletedMilestones = goalMilestones.filter(
      (milestone) => milestone.status === "completed",
    );
    const goalPlannedMinutes = goalTasks.reduce(
      (sum, task) => sum + Number(task.estimated_minutes || 0),
      0,
    );
    const goalCompletedMinutes = goalCompletedTasks.reduce(
      (sum, task) => sum + Number(task.estimated_minutes || 0),
      0,
    );
    const nextMilestone =
      goalMilestones
        .filter(
          (milestone) =>
            milestone.status !== "completed" &&
            Boolean(milestone.due_date && milestone.due_date >= today),
        )
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0] ?? null;

    return {
      goal,
      taskTotal: goalTasks.length,
      taskCompleted: goalCompletedTasks.length,
      milestoneTotal: goalMilestones.length,
      milestoneCompleted: goalCompletedMilestones.length,
      plannedMinutes: goalPlannedMinutes,
      completedMinutes: goalCompletedMinutes,
      nextMilestone,
    };
  });

  if (loading) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-28">
        <div className="container mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-12 w-72 rounded bg-muted" />
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 rounded-2xl bg-muted" />
            ))}
          </div>
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
              <BarChart3 className="h-4 w-4" />
              Execution progress
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Are the plans becoming action?</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Progress here comes from saved execution and milestones. It does not assign a subjective goal score or pretend task completion alone proves success.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/journey">
                <Target className="h-4 w-4" />
                Journey
              </Link>
            </Button>
            <Button asChild className="gap-2">
              <Link to="/plan">
                Open planner
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Execution tasks completed</p>
              <p className="mt-1 text-2xl font-bold">{completedTasks.length}/{executionTasks.length}</p>
              <p className="text-xs text-muted-foreground">
                {completionPercent(completedTasks.length, executionTasks.length)}% of represented tasks
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Execution effort completed</p>
              <p className="mt-1 text-2xl font-bold">{hoursLabel(completedMinutes)}</p>
              <p className="text-xs text-muted-foreground">of {hoursLabel(plannedMinutes)} represented by tasks</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Milestones completed</p>
              <p className="mt-1 text-2xl font-bold">{completedMilestones.length}/{milestones.length}</p>
              <p className="text-xs text-muted-foreground">
                {completionPercent(completedMilestones.length, milestones.length)}% of saved milestones
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Weekly reviews saved</p>
              <p className="mt-1 text-2xl font-bold">{reviews.length}</p>
              <p className="text-xs text-muted-foreground">execution learning snapshots</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 className="h-5 w-5 text-primary" />
                This week
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>{currentWeekCompleted.length}/{currentWeekTasks.length} tasks completed</span>
                  <span className="font-medium">
                    {hoursLabel(currentWeekCompletedMinutes)} / {hoursLabel(currentWeekMinutes)}
                  </span>
                </div>
                <Progress
                  value={completionPercent(currentWeekCompletedMinutes, currentWeekMinutes)}
                />
              </div>

              {currentWeekTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  No execution tasks are scheduled this week yet.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleGoals.map((goal) => {
                    const weekGoalTasks = currentWeekTasks.filter((task) => task.goal_id === goal.id);
                    if (!weekGoalTasks.length) return null;
                    const done = weekGoalTasks.filter((task) => task.status === "completed").length;
                    return (
                      <div key={goal.id} className="rounded-lg border p-3">
                        <p className="truncate font-medium">{goal.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{done}/{weekGoalTasks.length} tasks complete</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={repeatedUnderExecution || overdueMilestones.length ? "border-amber-500/30" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {repeatedUnderExecution || overdueMilestones.length ? (
                  <AlertTriangle className="h-5 w-5 text-amber-700" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                )}
                Execution signals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {overdueMilestones.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="font-medium">{overdueMilestones.length} overdue {overdueMilestones.length === 1 ? "milestone" : "milestones"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Review dates, execution plan or milestone status. This is a deadline signal, not a recommendation to deprioritize a goal.
                  </p>
                </div>
              )}

              {repeatedUnderExecution && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="font-medium">Recent reviews show repeated under-execution</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The last two reviewed weeks each completed less than 60% of represented planned effort. Consider reviewing capacity, workload, deadlines or planning assumptions.
                  </p>
                </div>
              )}

              {!overdueMilestones.length && !repeatedUnderExecution && (
                <p className="text-muted-foreground">
                  No repeated under-execution or overdue milestone signal is visible in the saved data right now.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <ExecutionAdaptationPanel
          reviews={reviews}
          goals={goals}
          overdueMilestoneCount={overdueMilestones.length}
        />

        <ExecutionTrendCard reviews={reviews} />

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              Goal-by-goal execution
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These are factual execution indicators. They are not an overall rating of the goal or of you.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            {goalSummaries.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground lg:col-span-2">
                Add goals and execution tasks to begin building progress history.
              </div>
            ) : (
              goalSummaries.map((summary) => {
                const taskPercent = completionPercent(summary.taskCompleted, summary.taskTotal);
                const milestonePercent = completionPercent(summary.milestoneCompleted, summary.milestoneTotal);
                return (
                  <div key={summary.goal.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{summary.goal.life_area}</Badge>
                          <Badge variant="secondary">{summary.goal.status}</Badge>
                        </div>
                        <p className="mt-2 font-semibold">{summary.goal.title}</p>
                      </div>
                      {summary.goal.end_date && (
                        <Badge variant="outline">
                          <CalendarDays className="mr-1 h-3 w-3" />
                          {summary.goal.end_date}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-4 space-y-3">
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>Execution tasks</span>
                          <span>{summary.taskCompleted}/{summary.taskTotal}</span>
                        </div>
                        <Progress value={taskPercent} />
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>Milestones</span>
                          <span>{summary.milestoneCompleted}/{summary.milestoneTotal}</span>
                        </div>
                        <Progress value={milestonePercent} />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-muted/20 p-3">
                        <p className="text-muted-foreground">Completed effort</p>
                        <p className="mt-1 font-semibold">{hoursLabel(summary.completedMinutes)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/20 p-3">
                        <p className="text-muted-foreground">Represented effort</p>
                        <p className="mt-1 font-semibold">{hoursLabel(summary.plannedMinutes)}</p>
                      </div>
                    </div>

                    {summary.nextMilestone && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border bg-muted/10 p-3 text-xs">
                        <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <div>
                          <p className="font-medium">{summary.nextMilestone.title}</p>
                          <p className="mt-1 text-muted-foreground">Next milestone · {summary.nextMilestone.due_date}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {reviews.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5 text-primary" />
                Recent weekly reviews
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviews.slice(0, 6).map((review) => {
                const reviewPercent = completionPercent(review.completed_minutes, review.planned_minutes);
                return (
                  <div key={review.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">Week of {review.week_start}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {review.completed_tasks}/{review.planned_tasks} tasks · {hoursLabel(review.completed_minutes)} / {hoursLabel(review.planned_minutes)}
                        </p>
                      </div>
                      <Badge variant="outline">{review.planned_minutes ? `${reviewPercent}% represented effort completed` : "No represented effort"}</Badge>
                    </div>
                    {review.planned_minutes > 0 && <Progress value={reviewPercent} className="mt-3" />}
                    {(review.wins || review.blockers || review.adjustments) && (
                      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                        {review.wins && <div className="rounded-lg bg-muted/20 p-3"><span className="font-medium">Wins:</span> {review.wins}</div>}
                        {review.blockers && <div className="rounded-lg bg-muted/20 p-3"><span className="font-medium">Blockers:</span> {review.blockers}</div>}
                        {review.adjustments && <div className="rounded-lg bg-muted/20 p-3"><span className="font-medium">Adjustments:</span> {review.adjustments}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
