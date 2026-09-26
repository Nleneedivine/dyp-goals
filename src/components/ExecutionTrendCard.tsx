import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";

type WeeklyReview = Tables<"goal_weekly_reviews">;

const hoursLabel = (minutes: number) => {
  if (!minutes) return "0h";
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
};

export function ExecutionTrendCard({ reviews }: { reviews: WeeklyReview[] }) {
  const trend = reviews
    .filter((review) => review.planned_minutes > 0)
    .slice(0, 6)
    .reverse()
    .map((review) => {
      const completion = Math.min(
        100,
        Math.max(
          0,
          Math.round(
            (review.completed_minutes / Math.max(review.planned_minutes, 1)) * 100,
          ),
        ),
      );

      return {
        id: review.id,
        weekStart: review.week_start,
        plannedMinutes: review.planned_minutes,
        completedMinutes: review.completed_minutes,
        completion,
      };
    });

  if (!trend.length) return null;

  const averageCompletion = Math.round(
    trend.reduce((sum, week) => sum + week.completion, 0) / trend.length,
  );
  const totalPlanned = trend.reduce((sum, week) => sum + week.plannedMinutes, 0);
  const totalCompleted = trend.reduce((sum, week) => sum + week.completedMinutes, 0);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5 text-primary" />
          Recent execution trend
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          A factual view of represented planned effort versus completed effort across
          your latest reviewed weeks. This is not a personal performance score.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Reviewed weeks</p>
            <p className="mt-1 text-2xl font-bold">{trend.length}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Represented effort completed</p>
            <p className="mt-1 text-2xl font-bold">{hoursLabel(totalCompleted)}</p>
            <p className="text-xs text-muted-foreground">of {hoursLabel(totalPlanned)}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Average represented completion</p>
            <p className="mt-1 text-2xl font-bold">{averageCompletion}%</p>
          </div>
        </div>

        <div className="space-y-3">
          {trend.map((week) => (
            <div key={week.id} className="grid gap-2 sm:grid-cols-[120px_1fr_130px] sm:items-center">
              <p className="text-xs font-medium">Week of {week.weekStart}</p>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${week.completion}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:text-right">
                {hoursLabel(week.completedMinutes)} / {hoursLabel(week.plannedMinutes)} · {week.completion}%
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
