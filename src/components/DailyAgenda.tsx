import { CheckCircle2, Clock3, LockKeyhole, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";

type GoalTask = Tables<"goal_tasks">;

export interface DailyAgendaFixedSegment {
  id: string;
  title: string;
  category: string;
  start: number;
  end: number;
}

const minutesToLabel = (minutes: number) => {
  if (minutes >= 1440) return "24:00";
  const bounded = Math.max(0, minutes);
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(bounded % 60).padStart(2, "0")}`;
};

export function DailyAgenda({
  tasks,
  fixedSegments,
  goalTitles,
}: {
  tasks: GoalTask[];
  fixedSegments: DailyAgendaFixedSegment[];
  goalTitles: Map<string, string>;
}) {
  const timedTasks = tasks.filter(
    (task) =>
      Boolean(task.scheduled_time) &&
      task.status !== "deferred" &&
      task.status !== "skipped",
  );
  const anytimeTasks = tasks.filter(
    (task) =>
      !task.scheduled_time &&
      task.status !== "deferred" &&
      task.status !== "skipped",
  );

  const timeline = [
    ...fixedSegments.map((segment) => ({
      id: `fixed-${segment.id}-${segment.start}-${segment.end}`,
      kind: "fixed" as const,
      start: segment.start,
      end: segment.end,
      title: segment.title,
      subtitle: segment.category,
      completed: false,
    })),
    ...timedTasks.map((task) => {
      const [hours, minutes] = task.scheduled_time!.slice(0, 5).split(":").map(Number);
      const start = hours * 60 + minutes;
      const rawEnd = start + Number(task.estimated_minutes || 0);
      return {
        id: `task-${task.id}`,
        kind: "task" as const,
        start,
        end: Math.min(rawEnd, 1440),
        spills: rawEnd > 1440,
        title: task.title,
        subtitle: goalTitles.get(task.goal_id) ?? "Goal",
        completed: task.status === "completed",
      };
    }),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  if (!timeline.length && !anytimeTasks.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock3 className="h-5 w-5 text-primary" />
          Integrated daily agenda
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Fixed commitments and timed goal work in one chronological view. Untimed tasks remain visible below until you place them.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {timeline.length > 0 && (
          <div className="space-y-2">
            {timeline.map((item) => (
              <div
                key={item.id}
                className={`flex gap-3 rounded-xl border p-3 ${item.kind === "fixed" ? "bg-muted/20" : item.completed ? "bg-muted/10" : ""}`}
              >
                <div className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
                  {minutesToLabel(item.start)}–{minutesToLabel(item.end)}
                  {"spills" in item && item.spills ? "+" : ""}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.kind === "fixed" ? (
                      <>
                        <Badge variant="secondary" className="gap-1">
                          <LockKeyhole className="h-3 w-3" />
                          Fixed
                        </Badge>
                        <Badge variant="outline">{item.subtitle}</Badge>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className="gap-1">
                          <Target className="h-3 w-3" />
                          Goal work
                        </Badge>
                        {item.completed && (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Done
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                  <p className={`mt-2 font-medium ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                    {item.title}
                  </p>
                  {item.kind === "task" && (
                    <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {anytimeTasks.length > 0 && (
          <div className="rounded-xl border border-dashed p-4">
            <p className="text-sm font-semibold">Anytime tasks</p>
            <p className="mt-1 text-xs text-muted-foreground">
              These are scheduled for the day but do not have a clock time yet.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {anytimeTasks.map((task) => (
                <div key={task.id} className="rounded-lg bg-muted/20 p-3">
                  <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                    {task.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {goalTitles.get(task.goal_id) ?? "Goal"}
                    {task.estimated_minutes ? ` · ${task.estimated_minutes} min` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
