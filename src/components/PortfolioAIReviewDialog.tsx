import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  GitBranch,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
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

type FindingType =
  | "possible_duplicate"
  | "dependency"
  | "sequence"
  | "deadline_tension"
  | "scope_overlap"
  | "clarity_gap"
  | "resource_assumption"
  | "capacity_signal";

interface PortfolioFinding {
  type: FindingType;
  requiresDecision: boolean;
  goalIds: string[];
  title: string;
  observation: string;
  whyItMatters: string;
  questions: string[];
  options: string[];
}

interface PortfolioReview {
  summary: string;
  strengths: string[];
  findings: PortfolioFinding[];
}

const findingLabel: Record<FindingType, string> = {
  possible_duplicate: "Possible overlap",
  dependency: "Dependency",
  sequence: "Sequence",
  deadline_tension: "Deadline tension",
  scope_overlap: "Shared scope",
  clarity_gap: "Decision gap",
  resource_assumption: "Resource assumption",
  capacity_signal: "Capacity signal",
};

export function PortfolioAIReviewDialog({
  goals,
  milestones,
}: {
  goals: Goal[];
  milestones: Milestone[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<PortfolioReview | null>(null);

  const reviewableGoals = useMemo(
    () =>
      goals.filter(
        (goal) => goal.status !== "archived" && goal.status !== "completed",
      ),
    [goals],
  );

  const goalMap = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal])),
    [goals],
  );

  const runReview = async () => {
    if (reviewableGoals.length < 2) return;

    setReviewing(true);
    setReview(null);

    const { data, error } = await supabase.functions.invoke(
      "analyze-goal-portfolio",
      {
        body: {
          goals: reviewableGoals.map((goal) => ({
            id: goal.id,
            title: goal.title,
            description: goal.description,
            lifeArea: goal.life_area,
            priority: goal.priority,
            status: goal.status,
            startDate: goal.start_date,
            endDate: goal.end_date,
            weeklyHours: Number(goal.estimated_hours_per_week || 0),
            effortSource: goal.effort_source,
            successDefinition: goal.success_definition,
            milestones: milestones
              .filter((milestone) => milestone.goal_id === goal.id)
              .map((milestone) => ({
                id: milestone.id,
                title: milestone.title,
                dueDate: milestone.due_date,
                status: milestone.status,
              })),
            coachingContext: goal.coaching_context,
          })),
          capacityWindows: [],
        },
      },
    );

    setReviewing(false);

    if (error) {
      toast({
        title: "Portfolio review could not run",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    if (!data?.review) {
      toast({
        title: "Portfolio review returned no result",
        variant: "destructive",
      });
      return;
    }

    setReview(data.review as PortfolioReview);
  };

  const reset = () => {
    setReview(null);
    setReviewing(false);
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
        <Button
          variant="outline"
          className="gap-2"
          disabled={reviewableGoals.length < 2}
        >
          <Sparkles className="h-4 w-4" />
          Review goal interactions
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Portfolio interaction review
          </DialogTitle>
          <DialogDescription>
            AI looks across your goals for possible overlap, dependencies,
            sequencing questions and deadline tensions. It does not choose which
            goal should win, be dropped or be postponed.
          </DialogDescription>
        </DialogHeader>

        {!review && !reviewing && (
          <div className="rounded-xl border border-dashed p-7 text-center">
            <GitBranch className="mx-auto h-9 w-9 text-muted-foreground" />
            <p className="mt-3 font-semibold">
              Review {reviewableGoals.length} goals together
            </p>
            <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">
              Individual AI coaching checks each goal. This review checks what
              becomes visible only when the goals are placed beside one another.
              Capacity arithmetic remains in the deterministic capacity checker.
            </p>
            <Button className="mt-4 gap-2" onClick={runReview}>
              <Search className="h-4 w-4" />
              Run portfolio review
            </Button>
          </div>
        )}

        {reviewing && (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed py-14">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Reviewing cross-goal interactions…
            </p>
          </div>
        )}

        {review && (
          <div className="space-y-5">
            <Alert>
              <AlertTitle>Portfolio summary</AlertTitle>
              <AlertDescription>{review.summary}</AlertDescription>
            </Alert>

            {review.strengths.length > 0 && (
              <div className="rounded-xl border p-4">
                <p className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Structure already present
                </p>
                <div className="mt-3 space-y-2">
                  {review.strengths.map((strength, index) => (
                    <p key={index} className="text-sm text-muted-foreground">
                      • {strength}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {review.findings.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
                <p className="mt-3 font-medium">
                  No meaningful cross-goal issue was identified
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep using the deterministic capacity checker as dates and
                  workloads change.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {review.findings.map((finding, index) => (
                  <div
                    key={finding.type + "-" + index}
                    className="rounded-xl border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {findingLabel[finding.type]}
                        </Badge>
                        {finding.requiresDecision && (
                          <Badge variant="secondary">
                            Your decision needed
                          </Badge>
                        )}
                      </div>
                      {finding.goalIds.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {finding.goalIds.map((goalId) => (
                            <Badge
                              key={goalId}
                              variant="outline"
                              className="max-w-[220px] truncate"
                            >
                              {goalMap.get(goalId)?.title ?? "Goal"}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <h3 className="mt-3 font-semibold">{finding.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {finding.observation}
                    </p>

                    <div className="mt-3 rounded-lg bg-muted/20 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Why it matters
                      </p>
                      <p className="mt-1 text-sm">{finding.whyItMatters}</p>
                    </div>

                    {finding.questions.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold">
                          Questions to decide
                        </p>
                        <div className="mt-1 space-y-1">
                          {finding.questions.map(
                            (question, questionIndex) => (
                              <p
                                key={questionIndex}
                                className="text-sm text-muted-foreground"
                              >
                                • {question}
                              </p>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                    {finding.options.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold">
                          Options you could consider
                        </p>
                        <div className="mt-1 space-y-1">
                          {finding.options.map((option, optionIndex) => (
                            <p
                              key={optionIndex}
                              className="text-sm text-muted-foreground"
                            >
                              • {option}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                This review is advisory. Dates, priority labels, weekly
                commitments and which trade-offs to make remain under your
                control.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={runReview}
                disabled={reviewing}
              >
                Run again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
