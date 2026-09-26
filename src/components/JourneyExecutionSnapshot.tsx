import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/integrations/supabase/types";

type GoalTask = Tables<"goal_tasks">;
type Milestone = Tables<"goal_milestones">;
type WeeklyReview = Tables<"goal_weekly_reviews">;

export function JourneyExecutionSnapshot({
  tasks,
  milestones,
  reviews,
}: {
  tasks: GoalTask[];
  milestones: Milestone[];
  reviews: WeeklyReview[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = tasks.filter(
    (task) =>
      task.scheduled_date === today &&
      task.status !== "deferred" &&
      task.status !== "skipped",
  );
  const todayCompleted = todayTasks.filter((task) => task.status === "completed");
  const todayRemaining = todayTasks.filter((task) => task.status === "planned");
  const replanningQueue = tasks.filter(
    (task) =>
      task.status === "deferred" ||
      (task.status === "planned" &&
        Boolean(task.scheduled_date && task.scheduled_date < today)),
  );
  const nextMilestone =
    milestones
      .filter(
        (milestone) =>
          milestone.status !== "completed" &&
          Boolean(milestone.due_date && milestone.due_date >= today),
      )
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0] ?? null;
  const latestReview = reviews[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border bg-background/70 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <p className="font-semibold">Your core execution loop is established</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep using Plan → Today → Weekly Review. The journey now becomes your execution dashboard instead of ending at setup.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-background p-4">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="mt-1 text-2xl font-bold">{todayCompleted.length}/{todayTasks.length}</p>
          <p className="text-xs text-muted-foreground">tasks completed</p>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <p className="text-xs text-muted-foreground">Still to do today</p>
          <p className="mt-1 text-2xl font-bold">{todayRemaining.length}</p>
          <p className="text-xs text-muted-foreground">planned tasks remaining</p>
        </div>
        <div className={`rounded-xl border bg-background p-4 ${replanningQueue.length ? "border-amber-500/30" : ""}`}>
          <p className="text-xs text-muted-foreground">Needs replanning</p>
          <p className="mt-1 text-2xl font-bold">{replanningQueue.length}</p>
          <p className="text-xs text-muted-foreground">missed or deferred tasks</p>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <p className="text-xs text-muted-foreground">Latest review</p>
          <p className="mt-1 text-lg font-bold">{latestReview?.week_start ?? "None yet"}</p>
          <p className="text-xs text-muted-foreground">
            {latestReview
              ? `${latestReview.completed_tasks}/${latestReview.planned_tasks} tasks completed`
              : "save a weekly review"}
          </p>
        </div>
      </div>

      {nextMilestone && (
        <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Next milestone
              </p>
              <p className="mt-1 font-semibold">{nextMilestone.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Due {nextMilestone.due_date}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/plan">
              Open plan
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}

      {replanningQueue.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <p className="font-semibold">Your execution queue needs attention</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {replanningQueue.length} {replanningQueue.length === 1 ? "task is" : "tasks are"} waiting for a deliberate reschedule, split or skip decision.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/todo">Review queue</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild className="gap-2">
          <Link to="/todo">
            Today's execution
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/plan">Plan this week</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/progress">Review progress</Link>
        </Button>
      </div>
    </div>
  );
}
