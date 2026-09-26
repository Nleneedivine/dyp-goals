import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Brain, CalendarDays, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type Milestone = Tables<"goal_milestones">;
type GoalTask = Tables<"goal_tasks">;

interface ReplanOption {
  type: "reschedule" | "split" | "fallback" | "review_workload";
  label: string;
  rationale: string;
  suggestedDate?: string | null;
  splitTasks?: Array<{
    title: string;
    estimatedMinutes: number;
  }>;
}

interface TaskSuggestion {
  taskId: string;
  observation: string;
  options: ReplanOption[];
}

interface ReplanResult {
  summary: string;
  suggestions: TaskSuggestion[];
}

const optionLabel: Record<ReplanOption["type"], string> = {
  reschedule: "Reschedule",
  split: "Split task",
  fallback: "Use safeguard",
  review_workload: "Review workload",
};

export function AIReplanDialog({
  currentDate,
  queueTasks,
  goals,
  milestones,
  allTasks,
  onReschedule,
}: {
  currentDate: string;
  queueTasks: GoalTask[];
  goals: Goal[];
  milestones: Milestone[];
  allTasks: GoalTask[];
  onReschedule: (task: GoalTask, date: string) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [replan, setReplan] = useState<ReplanResult | null>(null);

  const goalMap = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal])),
    [goals],
  );
  const taskMap = useMemo(
    () => new Map(queueTasks.map((task) => [task.id, task])),
    [queueTasks],
  );

  const generate = async () => {
    if (!queueTasks.length) return;

    setLoading(true);
    setReplan(null);

    const [eventsResult, reviewsResult] = await Promise.all([
      supabase
        .from("goal_task_events")
        .select("task_id, goal_id, event_type, from_scheduled_date, to_scheduled_date, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(120),
      supabase
        .from("goal_weekly_reviews")
        .select("week_start, planned_minutes, completed_minutes, blockers, adjustments")
        .order("week_start", { ascending: false })
        .limit(4),
    ]);

    if (eventsResult.error || reviewsResult.error) {
      setLoading(false);
      toast({
        title: "Execution history could not be loaded",
        description: eventsResult.error?.message ?? reviewsResult.error?.message,
        variant: "destructive",
      });
      return;
    }

    const relevantGoalIds = new Set(queueTasks.map((task) => task.goal_id));
    const relevantGoals = goals.filter((goal) => relevantGoalIds.has(goal.id));
    const relevantMilestones = milestones.filter((milestone) => relevantGoalIds.has(milestone.goal_id));
    const horizonEnd = format(addDays(parseISO(currentDate), 14), "yyyy-MM-dd");
    const upcomingTasks = allTasks.filter(
      (task) =>
        task.status === "planned" &&
        Boolean(
          task.scheduled_date &&
          task.scheduled_date >= currentDate &&
          task.scheduled_date <= horizonEnd,
        ),
    );

    const { data, error } = await supabase.functions.invoke("replan-execution", {
      body: {
        currentDate,
        queueTasks: queueTasks.map((task) => ({
          id: task.id,
          goalId: task.goal_id,
          milestoneId: task.milestone_id,
          weeklyActionId: task.weekly_action_id,
          title: task.title,
          estimatedMinutes: Number(task.estimated_minutes || 0),
          status: task.status,
          scheduledDate: task.scheduled_date,
          deferredFromDate: task.deferred_from_date,
        })),
        goals: relevantGoals.map((goal) => ({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          priority: goal.priority,
          endDate: goal.end_date,
          coachingContext: goal.coaching_context,
        })),
        milestones: relevantMilestones.map((milestone) => ({
          id: milestone.id,
          goalId: milestone.goal_id,
          title: milestone.title,
          dueDate: milestone.due_date,
          status: milestone.status,
        })),
        recentEvents: (eventsResult.data ?? [])
          .filter((event) => relevantGoalIds.has(event.goal_id))
          .map((event) => ({
            taskId: event.task_id,
            goalId: event.goal_id,
            eventType: event.event_type,
            fromScheduledDate: event.from_scheduled_date,
            toScheduledDate: event.to_scheduled_date,
            occurredAt: event.occurred_at,
          })),
        recentReviews: (reviewsResult.data ?? []).map((review) => ({
          weekStart: review.week_start,
          plannedMinutes: Number(review.planned_minutes || 0),
          completedMinutes: Number(review.completed_minutes || 0),
          blockers: review.blockers,
          adjustments: review.adjustments,
        })),
        upcomingTasks: upcomingTasks.map((task) => ({
          id: task.id,
          goalId: task.goal_id,
          title: task.title,
          scheduledDate: task.scheduled_date,
          estimatedMinutes: Number(task.estimated_minutes || 0),
          status: task.status,
        })),
      },
    });

    setLoading(false);

    if (error) {
      toast({
        title: "AI replanning could not run",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    if (!data?.replan) {
      toast({
        title: "AI returned no replanning options",
        variant: "destructive",
      });
      return;
    }

    setReplan(data.replan as ReplanResult);
  };

  const applyReschedule = async (taskId: string, date: string) => {
    const task = taskMap.get(taskId);
    if (!task) return;

    await onReschedule(task, date);
    setReplan((current) => {
      if (!current) return current;
      const suggestions = current.suggestions.filter((suggestion) => suggestion.taskId !== taskId);
      if (!suggestions.length) {
        setOpen(false);
        return null;
      }
      return { ...current, suggestions };
    });
  };

  const reset = () => {
    setLoading(false);
    setReplan(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={!queueTasks.length}>
          <Sparkles className="h-4 w-4" />
          Get AI replan options
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Adaptive replanning options
          </DialogTitle>
          <DialogDescription>
            Review options for missed or deferred work using your execution history and the safeguards already captured during goal coaching.
            AI does not change your workload, deadline or priority automatically.
          </DialogDescription>
        </DialogHeader>

        {!replan && !loading && (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <RefreshCw className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-semibold">{queueTasks.length} task{queueTasks.length === 1 ? "" : "s"} need a decision</p>
            <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">
              The coach will look at previous moves, recent weekly reviews, upcoming work, goal deadlines and preserved coaching insights.
            </p>
            <Button className="mt-4 gap-2" onClick={generate}>
              <Sparkles className="h-4 w-4" />
              Generate options
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Reviewing execution history and safeguards…</p>
          </div>
        )}

        {replan && (
          <div className="space-y-5">
            <Alert>
              <AlertTitle>Portfolio observation</AlertTitle>
              <AlertDescription>{replan.summary}</AlertDescription>
            </Alert>

            {replan.suggestions.map((suggestion) => {
              const task = taskMap.get(suggestion.taskId);
              if (!task) return null;
              const goal = goalMap.get(task.goal_id);

              return (
                <div key={suggestion.taskId} className="rounded-xl border p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{task.status === "deferred" ? "Deferred" : "Missed"}</Badge>
                    <Badge variant="secondary">{goal?.title ?? "Goal"}</Badge>
                    {task.estimated_minutes > 0 && (
                      <Badge variant="outline">{task.estimated_minutes} min</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-lg font-semibold">{task.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{suggestion.observation}</p>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {suggestion.options.map((option, index) => (
                      <div key={index} className="rounded-lg border bg-muted/15 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{optionLabel[option.type]}</Badge>
                          {option.suggestedDate && (
                            <Badge variant="secondary">
                              <CalendarDays className="mr-1 h-3 w-3" />
                              {option.suggestedDate}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 font-medium">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.rationale}</p>

                        {option.splitTasks?.length ? (
                          <div className="mt-3 space-y-1">
                            {option.splitTasks.map((splitTask, splitIndex) => (
                              <p key={splitIndex} className="text-xs">
                                • {splitTask.title} <span className="text-muted-foreground">({splitTask.estimatedMinutes} min)</span>
                              </p>
                            ))}
                          </div>
                        ) : null}

                        {option.type === "reschedule" && option.suggestedDate && (
                          <Button
                            size="sm"
                            className="mt-3 w-full"
                            onClick={() => applyReschedule(task.id, option.suggestedDate!)}
                          >
                            Move to {option.suggestedDate}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end">
              <Button variant="outline" onClick={generate} disabled={loading}>
                Regenerate options
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
