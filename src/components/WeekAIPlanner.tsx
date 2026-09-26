import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface SuggestedTask {
  title: string;
  scheduledDate: string;
  scheduledTime?: null;
  estimatedMinutes: number;
  notes: string;
}

interface SuggestedAction {
  goalId: string;
  milestoneId?: string | null;
  title: string;
  notes: string;
  estimatedMinutes: number;
  tasks: SuggestedTask[];
}

interface PlanWeekResponse {
  planReady: boolean;
  source: "ai" | "deterministic";
  weekStart: string;
  weekEnd: string;
  reason?: "no_goals" | "unconfirmed_effort" | "capacity_conflict";
  message?: string;
  capacity?: {
    configured: boolean;
    hours: number | null;
    varies: boolean;
    labels: string[];
  };
  confirmedDemandHours?: number;
  alreadyScheduledHours?: number;
  excludedGoals?: {
    id: string;
    title: string;
    reason: string;
  }[];
  conflict?: {
    demandHours: number;
    capacityHours: number;
    overByHours: number;
    goals: {
      id: string;
      title: string;
      priority: string;
      hours: number;
    }[];
  };
  proposal?: {
    summary: string;
    warnings: string[];
    actions: SuggestedAction[];
    reviewPrompt: string;
  };
}

export function WeekAIPlanner({
  weekStart,
  weekEnd,
  goalTitles,
  onApplied,
}: {
  weekStart: string;
  weekEnd: string;
  goalTitles: Map<string, string>;
  onApplied: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [result, setResult] = useState<PlanWeekResponse | null>(null);

  const reset = () => {
    setResult(null);
    setReviewed(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const generate = async () => {
    setGenerating(true);
    setReviewed(false);
    try {
      const { data, error } = await supabase.functions.invoke("plan-week", {
        body: { weekStart },
      });

      if (error) throw error;
      if (!data || typeof data.planReady !== "boolean") {
        throw new Error("AI planner returned an invalid response.");
      }

      setResult(data as PlanWeekResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI weekly planning failed.";
      toast({
        title: "Weekly plan could not be generated",
        description: message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const applyPlan = async () => {
    if (!result?.proposal?.actions.length || !reviewed) return;

    setApplying(true);
    const { data, error } = await supabase.rpc("apply_goal_week_plan", {
      p_week_start: weekStart,
      p_actions: result.proposal.actions as unknown as Json,
    });
    setApplying(false);

    if (error) {
      toast({
        title: "Weekly plan could not be applied",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const summary = data?.[0];
    toast({
      title: "Weekly plan added",
      description: summary
        ? `${summary.actions_created} weekly priorities and ${summary.tasks_created} tasks were added.`
        : "The reviewed plan was added to your execution system.",
    });

    await onApplied();
    setOpen(false);
    reset();
  };

  const proposal = result?.proposal;
  const actionMinutes = proposal?.actions.reduce(
    (sum, action) => sum + action.estimatedMinutes,
    0,
  ) ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Sparkles className="h-4 w-4" />
          AI build this week
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI weekly execution planner
          </DialogTitle>
          <DialogDescription>
            Build a reviewed week from your confirmed goals, milestones, workload, capacity and saved coaching insights.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {weekStart} → {weekEnd}
            </Badge>
            <Badge variant="outline">Multi-goal plan</Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            The AI may propose actions and tasks, but it cannot change your goal priority, deadline, weekly commitment or capacity.
            If your confirmed commitments do not fit, it stops and surfaces the conflict instead of choosing a goal to sacrifice.
          </p>
        </div>

        {!result && (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 font-semibold">Turn the portfolio into this week's execution</h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              The planner first checks your confirmed workload against capacity. Only when the portfolio fits will it spend an AI call to draft the week.
            </p>
            <Button onClick={generate} disabled={generating} className="mt-5 gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Building week..." : "Build weekly proposal"}
            </Button>
          </div>
        )}

        {result && !result.planReady && (
          <div className="space-y-4">
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <h3 className="font-semibold">Planning paused before the AI call</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {result.conflict && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">Confirmed demand</p>
                  <p className="mt-1 text-2xl font-bold">{result.conflict.demandHours.toFixed(1)}h</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">Capacity</p>
                  <p className="mt-1 text-2xl font-bold">{result.conflict.capacityHours.toFixed(1)}h</p>
                </div>
                <div className="rounded-xl border border-amber-500/30 p-4">
                  <p className="text-xs text-muted-foreground">Over by</p>
                  <p className="mt-1 text-2xl font-bold text-amber-700">{result.conflict.overByHours.toFixed(1)}h</p>
                </div>
              </div>
            )}

            {result.conflict?.goals?.length ? (
              <div>
                <p className="mb-2 text-sm font-semibold">Commitments contributing to this week</p>
                <div className="space-y-2">
                  {result.conflict.goals.map((goal) => (
                    <div key={goal.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{goal.title}</p>
                        <p className="text-xs text-muted-foreground">{goal.priority}</p>
                      </div>
                      <Badge variant="outline">{goal.hours.toFixed(1)}h/week</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <Button variant="outline" onClick={() => { setResult(null); setReviewed(false); }}>
              Check again after adjustments
            </Button>
          </div>
        )}

        {result?.planReady && proposal && (
          <div className="space-y-5">
            <div className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={result.source === "ai" ? "default" : "secondary"}>
                  {result.source === "ai" ? "AI proposal" : "No AI call needed"}
                </Badge>
                {result.confirmedDemandHours !== undefined && (
                  <Badge variant="outline">{result.confirmedDemandHours.toFixed(1)}h confirmed demand</Badge>
                )}
                {result.capacity?.configured && result.capacity.hours !== null && (
                  <Badge variant="outline">{result.capacity.hours.toFixed(1)}h capacity</Badge>
                )}
                {actionMinutes > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    {(actionMinutes / 60).toFixed(1)}h newly scheduled
                  </Badge>
                )}
              </div>
              <p className="mt-3 text-sm">{proposal.summary}</p>
            </div>

            {result.excludedGoals?.length ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="font-medium">Not included because workload is not confirmed</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.excludedGoals.map((goal) => (
                    <Badge key={goal.id} variant="outline">{goal.title}</Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {proposal.warnings.length > 0 && (
              <div className="rounded-xl border p-4">
                <p className="font-medium">Review notes</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {proposal.warnings.map((warning, index) => <li key={index}>• {warning}</li>)}
                </ul>
              </div>
            )}

            {proposal.actions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-3 font-semibold">This week's confirmed workload is already scheduled</p>
                  <p className="mt-1 text-sm text-muted-foreground">{proposal.reviewPrompt}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {proposal.actions.map((action, actionIndex) => (
                  <Card key={`${action.goalId}-${action.title}-${actionIndex}`}>
                    <CardContent className="pt-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <Badge variant="secondary">{goalTitles.get(action.goalId) ?? "Goal"}</Badge>
                          <h4 className="mt-2 font-semibold">{action.title}</h4>
                          {action.notes && <p className="mt-1 text-sm text-muted-foreground">{action.notes}</p>}
                        </div>
                        <Badge variant="outline">{(action.estimatedMinutes / 60).toFixed(1)}h</Badge>
                      </div>

                      <div className="mt-4 space-y-2">
                        {action.tasks.map((task, taskIndex) => (
                          <div key={`${task.title}-${taskIndex}`} className="rounded-lg border bg-muted/15 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-medium">{task.title}</p>
                                {task.notes && <p className="mt-1 text-xs text-muted-foreground">{task.notes}</p>}
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <Badge variant="outline">{task.scheduledDate}</Badge>
                                <Badge variant="outline">{task.estimatedMinutes} min</Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {proposal.actions.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="review-week-plan"
                    checked={reviewed}
                    onCheckedChange={(checked) => setReviewed(checked === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="review-week-plan" className="cursor-pointer text-sm">
                    <span className="font-medium">I reviewed this weekly proposal and want to add it to my plan.</span>
                    <span className="mt-1 block text-muted-foreground">
                      Applying creates the weekly priorities and tasks atomically. Your original goals and commitments are not changed.
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{proposal.reviewPrompt}</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {result && (
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setReviewed(false);
              }}
              disabled={generating || applying}
            >
              Start over
            </Button>
          )}

          {proposal?.actions.length ? (
            <Button onClick={applyPlan} disabled={!reviewed || applying} className="gap-2">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {applying ? "Applying..." : "Apply reviewed plan"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
