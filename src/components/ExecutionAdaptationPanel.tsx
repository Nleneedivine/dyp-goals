import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  Gauge,
  ListRestart,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";

type WeeklyReview = Tables<"goal_weekly_reviews">;
type Goal = Tables<"goals">;

interface GoalReviewSummary {
  goalId: string;
  title: string;
  plannedMinutes: number;
  completedMinutes: number;
}

const parsePerGoalSummary = (value: WeeklyReview["per_goal_summary"]) => {
  if (!Array.isArray(value)) return [] as GoalReviewSummary[];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const goalId = typeof record.goalId === "string" ? record.goalId : "";
    const title = typeof record.title === "string" ? record.title : "";
    const plannedMinutes =
      typeof record.plannedMinutes === "number" ? record.plannedMinutes : 0;
    const completedMinutes =
      typeof record.completedMinutes === "number" ? record.completedMinutes : 0;

    if (!goalId || !title) return [];

    return [{
      goalId,
      title,
      plannedMinutes,
      completedMinutes,
    }];
  });
};

export function ExecutionAdaptationPanel({
  reviews,
  goals,
  overdueMilestoneCount,
}: {
  reviews: WeeklyReview[];
  goals: Goal[];
  overdueMilestoneCount: number;
}) {
  const recentReviews = reviews
    .filter((review) => review.planned_minutes > 0)
    .slice(0, 4);

  const underExecutionByGoal = new Map<
    string,
    { title: string; underWeeks: number; reviewedWeeks: number }
  >();

  recentReviews.forEach((review) => {
    parsePerGoalSummary(review.per_goal_summary).forEach((summary) => {
      if (summary.plannedMinutes <= 0) return;
      const current = underExecutionByGoal.get(summary.goalId) ?? {
        title: summary.title,
        underWeeks: 0,
        reviewedWeeks: 0,
      };
      current.reviewedWeeks += 1;
      if (summary.completedMinutes / summary.plannedMinutes < 0.6) {
        current.underWeeks += 1;
      }
      underExecutionByGoal.set(summary.goalId, current);
    });
  });

  const repeatedGoalSignals = Array.from(underExecutionByGoal.entries())
    .filter(([, value]) => value.reviewedWeeks >= 2 && value.underWeeks >= 2)
    .map(([goalId, value]) => ({
      goalId,
      title: goals.find((goal) => goal.id === goalId)?.title ?? value.title,
      underWeeks: value.underWeeks,
      reviewedWeeks: value.reviewedWeeks,
    }));

  const portfolioUnderExecution =
    recentReviews.length >= 2 &&
    recentReviews
      .slice(0, 2)
      .every(
        (review) =>
          review.completed_minutes / Math.max(review.planned_minutes, 1) < 0.6,
      );

  const hasSignal =
    portfolioUnderExecution ||
    repeatedGoalSignals.length > 0 ||
    overdueMilestoneCount > 0;

  if (!hasSignal) return null;

  return (
    <Card className="mt-6 border-amber-500/25 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListRestart className="h-5 w-5 text-amber-700" />
          Adapt execution deliberately
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The saved execution history shows pressure worth reviewing. The system will
          not decide which goal to reduce, postpone or prioritize for you.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          {portfolioUnderExecution && (
            <div className="rounded-xl border border-amber-500/20 bg-background p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-medium">Repeated portfolio under-execution</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The two most recent reviewed weeks each completed less than 60%
                    of the planned effort represented in saved tasks.
                  </p>
                </div>
              </div>
            </div>
          )}

          {overdueMilestoneCount > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-background p-4">
              <div className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-medium">
                    {overdueMilestoneCount} overdue{" "}
                    {overdueMilestoneCount === 1 ? "milestone" : "milestones"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A date has passed without the milestone being marked complete.
                    Review the milestone status, deadline or execution plan.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {repeatedGoalSignals.length > 0 && (
          <div className="rounded-xl border bg-background p-4">
            <p className="font-medium">Goals with repeated execution pressure</p>
            <p className="mt-1 text-xs text-muted-foreground">
              These are factual review patterns, not a ranking of which goal matters more.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {repeatedGoalSignals.map((signal) => (
                <Badge key={signal.goalId} variant="outline">
                  {signal.title} · under 60% in {signal.underWeeks}/{signal.reviewedWeeks} reviewed weeks
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-3 text-sm font-semibold">Choose what to review</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4 text-left">
              <Link to="/my-goals">
                <Gauge className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Capacity</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Recheck realistic weekly time.
                  </span>
                </span>
              </Link>
            </Button>

            <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4 text-left">
              <Link to="/my-goals">
                <Target className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Goal workload</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Review effort, dates or status yourself.
                  </span>
                </span>
              </Link>
            </Button>

            <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4 text-left">
              <Link to="/plan">
                <CalendarClock className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">This week</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Inspect scheduled work and milestones.
                  </span>
                </span>
              </Link>
            </Button>

            <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4 text-left">
              <Link to="/todo">
                <ListRestart className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Missed work</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Reschedule, split or skip consciously.
                  </span>
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
