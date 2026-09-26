import { useMemo, useState } from "react";
import {
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type GoalMilestone = Tables<"goal_milestones">;

type ClarificationKind = "essential" | "development";
type RefinedEffortSource = "user_confirmed" | "ai_estimated";

interface ClarificationQuestion {
  question: string;
  reason: string;
}

interface ClarificationResult {
  feedback: string;
  readyToPlan: boolean;
  questions: ClarificationQuestion[];
  coachNote: string;
}

interface ClarificationHistoryItem {
  question: string;
  answer: string;
  kind: ClarificationKind;
}

interface ExecutionInsights {
  obstacles: string[];
  safeguards: string[];
  resources: string[];
  reviewRhythm: string[];
  constraints: string[];
}

interface RefinedMilestone {
  title: string;
  dueDate?: string | null;
}

interface RefinedEffortPeriod {
  label: string;
  startDate: string;
  endDate: string;
  hoursPerWeek: number;
}

interface RefinedPortfolioGoal {
  title: string;
  description: string;
  actionSteps: string[];
  timeline: string;
  successMetrics: string[];
  lifeArea?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  priority?: "primary" | "maintenance" | "later" | null;
  estimatedHoursPerWeek?: number | null;
  effortSource?: RefinedEffortSource | null;
  effortRationale?: string | null;
  successDefinition?: string | null;
  executionInsights?: ExecutionInsights | null;
  milestones?: RefinedMilestone[] | null;
  effortPeriods?: RefinedEffortPeriod[] | null;
}

const LIFE_AREAS = [
  "Academic",
  "Career/Business",
  "Finance",
  "Health",
  "Spiritual",
  "Relationships",
  "Family",
  "Personal Development",
  "Service/Impact",
  "Other",
];

const ESSENTIAL_ROUND_LIMIT = 3;
const DEEPER_ROUND_LIMIT = 2;

const targetYearFor = (goal: Goal) => {
  const currentYear = new Date().getFullYear();
  const candidate = Number((goal.end_date ?? goal.start_date ?? "").slice(0, 4));
  return Number.isInteger(candidate) && candidate >= currentYear
    ? Math.min(candidate, currentYear + 10)
    : currentYear;
};

const portfolioGoalPayload = (goal: Goal) => ({
  title: goal.title,
  description: goal.description,
  lifeArea: goal.life_area,
  startDate: goal.start_date,
  endDate: goal.end_date,
  priority: goal.priority as "primary" | "maintenance" | "later",
  estimatedHoursPerWeek: Number(goal.estimated_hours_per_week || 0),
  effortSource: (goal.effort_source || "unknown") as "unknown" | "user_confirmed" | "ai_estimate_confirmed",
  successDefinition: goal.success_definition,
});

const goalContext = (goal: Goal) => [
  `Goal: ${goal.title}`,
  goal.description ? `Description: ${goal.description}` : "",
  `Life area: ${goal.life_area}`,
  goal.start_date ? `Start date: ${goal.start_date}` : "",
  goal.end_date ? `End date/deadline: ${goal.end_date}` : "",
  `Priority: ${goal.priority}`,
  `Current estimated effort: ${Number(goal.estimated_hours_per_week || 0)} hours/week`,
  `Current effort source: ${goal.effort_source || "unknown"}`,
  goal.success_definition ? `Success definition: ${goal.success_definition}` : "",
].filter(Boolean).join("\n");

const insightSections = (insights?: ExecutionInsights | null) => {
  if (!insights) return [];
  return [
    { label: "Obstacles", values: insights.obstacles },
    { label: "Safeguards", values: insights.safeguards },
    { label: "Resources", values: insights.resources },
    { label: "Review rhythm", values: insights.reviewRhythm },
    { label: "Constraints", values: insights.constraints },
  ].filter((section) => section.values.length > 0);
};

export function GoalAIRefinementDialog({
  goal,
  milestones,
  onApplied,
}: {
  goal: Goal;
  milestones: GoalMilestone[];
  onApplied: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<ClarificationResult | null>(null);
  const [questionKind, setQuestionKind] = useState<ClarificationKind>("essential");
  const [answers, setAnswers] = useState<string[]>([]);
  const [history, setHistory] = useState<ClarificationHistoryItem[]>([]);
  const [essentialRounds, setEssentialRounds] = useState(0);
  const [deeperRounds, setDeeperRounds] = useState(0);
  const [refined, setRefined] = useState<RefinedPortfolioGoal | null>(null);
  const [coaching, setCoaching] = useState(false);
  const [refining, setRefining] = useState(false);
  const [applying, setApplying] = useState(false);
  const [effortToSave, setEffortToSave] = useState("");
  const [effortConfirmed, setEffortConfirmed] = useState(false);

  const reset = () => {
    setReview(null);
    setQuestionKind("essential");
    setAnswers([]);
    setHistory([]);
    setEssentialRounds(0);
    setDeeperRounds(0);
    setRefined(null);
    setEffortToSave("");
    setEffortConfirmed(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const callCoach = async (
    phase: "core" | "deeper",
    roundNumber: number,
    clarificationHistory: ClarificationHistoryItem[],
  ) => {
    const { data, error } = await supabase.functions.invoke("clarify-goal", {
      body: {
        goal: portfolioGoalPayload(goal),
        phase,
        roundNumber,
        history: clarificationHistory,
      },
    });

    if (error) throw error;
    const result = data?.clarification as ClarificationResult | undefined;
    if (!result) throw new Error("AI Coach did not return clarification guidance.");
    return result;
  };

  const startReview = async () => {
    setCoaching(true);
    setRefined(null);
    try {
      const result = await callCoach("core", 1, []);
      setReview(result);
      setQuestionKind("essential");
      setAnswers(result.questions.map(() => ""));
      setEssentialRounds(result.questions.length ? 1 : 0);
      setDeeperRounds(0);
    } catch (error: any) {
      toast({
        title: "AI review failed",
        description: error?.message || "Unable to review this goal.",
        variant: "destructive",
      });
    } finally {
      setCoaching(false);
    }
  };

  const answeredCurrentQuestions = (allowPartial: boolean) => {
    if (!review) return [] as ClarificationHistoryItem[];

    return review.questions
      .map((item, index) => ({
        question: item.question,
        answer: (answers[index] ?? "").trim(),
        kind: questionKind,
      }))
      .filter((item) => allowPartial ? Boolean(item.answer) : true);
  };

  const continueCore = async () => {
    if (!review) return;
    if (review.questions.some((_, index) => !answers[index]?.trim())) {
      toast({
        title: "Answer the important questions",
        description: "These answers are needed before the AI Coach can tell whether the goal is ready to plan.",
        variant: "destructive",
      });
      return;
    }

    const nextHistory = [...history, ...answeredCurrentQuestions(false)];
    setHistory(nextHistory);

    if (essentialRounds >= ESSENTIAL_ROUND_LIMIT) {
      setReview({
        feedback: "You have completed the essential clarification rounds. There is enough context to build a useful first plan.",
        readyToPlan: true,
        questions: [],
        coachNote: "You can build now or use the separate deeper-coaching rounds for strategy and execution insight.",
      });
      setAnswers([]);
      return;
    }

    setCoaching(true);
    try {
      const nextRound = essentialRounds + 1;
      const result = await callCoach("core", nextRound, nextHistory);
      setReview(result);
      setQuestionKind("essential");
      setAnswers(result.questions.map(() => ""));
      if (result.questions.length) setEssentialRounds(nextRound);
    } catch (error: any) {
      toast({
        title: "Could not continue clarification",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCoaching(false);
    }
  };

  const exploreDeeper = async (extraHistory: ClarificationHistoryItem[] = history) => {
    if (deeperRounds >= DEEPER_ROUND_LIMIT) {
      toast({
        title: "Deeper coaching complete",
        description: "You can build the plan now and refine the goal again later as circumstances change.",
      });
      return;
    }

    setCoaching(true);
    try {
      const nextRound = deeperRounds + 1;
      const result = await callCoach("deeper", nextRound, extraHistory);
      setQuestionKind("development");

      if (!result.questions.length) {
        setDeeperRounds(DEEPER_ROUND_LIMIT);
        setReview({
          ...result,
          readyToPlan: true,
          questions: [],
          coachNote: result.coachNote || "No additional deeper questions are needed right now.",
        });
        setAnswers([]);
        return;
      }

      setReview(result);
      setAnswers(result.questions.map(() => ""));
      setDeeperRounds(nextRound);
    } catch (error: any) {
      toast({
        title: "Could not open a deeper coaching round",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCoaching(false);
    }
  };

  const refine = async (clarificationHistory: ClarificationHistoryItem[]) => {
    setRefining(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const planningStartDate = goal.start_date && goal.start_date >= today ? goal.start_date : undefined;
      const { data, error } = await supabase.functions.invoke("refine-goals", {
        body: {
          originalGoals: goalContext(goal),
          questions: clarificationHistory.map((item) => item.question),
          responses: clarificationHistory.map((item) => item.answer),
          coachingHistory: clarificationHistory,
          targetYear: targetYearFor(goal),
          planningStartDate,
          portfolioGoal: portfolioGoalPayload(goal),
        },
      });

      if (error) throw error;
      const result = data?.refined?.refinedGoals?.[0] as RefinedPortfolioGoal | undefined;
      if (!result) throw new Error("AI did not return a refined goal.");

      setHistory(clarificationHistory);
      setRefined(result);
      const suggestedHours = result.estimatedHoursPerWeek ?? Number(goal.estimated_hours_per_week || 0);
      setEffortToSave(String(suggestedHours));
      setEffortConfirmed(result.effortSource === "user_confirmed");
    } catch (error: any) {
      toast({
        title: "Goal refinement failed",
        description: error?.message || "Unable to create the refined plan.",
        variant: "destructive",
      });
    } finally {
      setRefining(false);
    }
  };

  const buildPlanNow = async () => {
    await refine(history);
  };

  const buildWithDevelopmentAnswers = async () => {
    const nextHistory = [...history, ...answeredCurrentQuestions(true)];
    await refine(nextHistory);
  };

  const anotherDeeperRound = async () => {
    const newlyAnswered = answeredCurrentQuestions(true);
    if (!newlyAnswered.length) {
      toast({
        title: "Answer at least one deeper question",
        description: "That gives the AI Coach new information to build the next round from.",
        variant: "destructive",
      });
      return;
    }

    const nextHistory = [...history, ...newlyAnswered];
    setHistory(nextHistory);
    await exploreDeeper(nextHistory);
  };

  const normalizedEffort = Number(effortToSave || 0);
  const originalSuggestedEffort = refined?.estimatedHoursPerWeek ?? Number(goal.estimated_hours_per_week || 0);
  const effortScale = originalSuggestedEffort > 0 && Number.isFinite(normalizedEffort)
    ? normalizedEffort / originalSuggestedEffort
    : 1;

  const displayedEffortPeriods = useMemo(
    () => (refined?.effortPeriods ?? []).map((period) => ({
      ...period,
      hoursPerWeek: Math.max(0, Math.round(period.hoursPerWeek * effortScale * 4) / 4),
    })),
    [refined, effortScale],
  );

  const apply = async () => {
    if (!refined) return;

    const startDate = refined.startDate ?? goal.start_date;
    const endDate = refined.endDate ?? goal.end_date;
    if (startDate && endDate && endDate < startDate) {
      toast({ title: "AI returned an invalid date window", variant: "destructive" });
      return;
    }

    const hours = Number(effortToSave);
    if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
      toast({
        title: "Check weekly effort",
        description: "Weekly effort must be between 0 and 168 hours.",
        variant: "destructive",
      });
      return;
    }

    if (refined.effortSource === "ai_estimated" && !effortConfirmed) {
      toast({
        title: "Confirm the workload first",
        description: "The weekly effort came from an AI estimate. Review it and confirm before saving.",
        variant: "destructive",
      });
      return;
    }

    const lifeArea = refined.lifeArea && LIFE_AREAS.includes(refined.lifeArea)
      ? refined.lifeArea
      : goal.life_area;
    const priority = refined.priority ?? goal.priority;
    const effortSource = refined.effortSource === "ai_estimated"
      ? "ai_estimate_confirmed"
      : "user_confirmed";

    const coachingContext = {
      clarificationHistory: history,
      executionInsights: refined.executionInsights ?? {
        obstacles: [],
        safeguards: [],
        resources: [],
        reviewRhythm: [],
        constraints: [],
      },
      effortRationale: refined.effortRationale ?? "",
      capturedAt: new Date().toISOString(),
    } as unknown as Json;

    const suggestedMilestones = (refined.milestones ?? [])
      .filter((milestone) => {
        if (!milestone.title.trim()) return false;
        const dueDate = milestone.dueDate ?? null;
        if (dueDate && startDate && dueDate < startDate) return false;
        if (dueDate && endDate && dueDate > endDate) return false;
        return true;
      })
      .map((milestone) => ({
        title: milestone.title.trim(),
        dueDate: milestone.dueDate ?? null,
      }));

    const validPeriods = displayedEffortPeriods.filter((period) => {
      if (period.endDate < period.startDate) return false;
      if (startDate && period.startDate < startDate) return false;
      if (endDate && period.endDate > endDate) return false;
      return period.hoursPerWeek >= 0 && period.hoursPerWeek <= 168;
    });

    if (validPeriods.length !== displayedEffortPeriods.length) {
      toast({
        title: "Check the suggested workload phases",
        description: "At least one workload phase falls outside the goal window or has invalid weekly hours.",
        variant: "destructive",
      });
      return;
    }

    const sortedPeriods = [...validPeriods].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    );
    const hasOverlap = sortedPeriods.some(
      (period, index) =>
        index > 0 && period.startDate <= sortedPeriods[index - 1].endDate,
    );

    if (hasOverlap) {
      toast({
        title: "Workload phases overlap",
        description: "The AI returned overlapping workload phases. Build the plan again before applying it so portfolio capacity is not ambiguous.",
        variant: "destructive",
      });
      return;
    }

    setApplying(true);
    try {
      const goalPatch = {
        title: refined.title.trim(),
        description: refined.description.trim(),
        lifeArea,
        startDate,
        endDate,
        priority,
        estimatedHoursPerWeek: hours,
        effortSource,
        coachingContext,
        successDefinition: (refined.successDefinition || refined.successMetrics.join("; ")).trim(),
      } as unknown as Json;

      const { error } = await supabase.rpc("apply_goal_ai_refinement", {
        p_goal_id: goal.id,
        p_goal_patch: goalPatch,
        p_milestones: suggestedMilestones as unknown as Json,
        p_effort_periods: validPeriods as unknown as Json,
        p_replace_effort_periods: displayedEffortPeriods.length > 0,
      });

      if (error) throw error;

      toast({
        title: "AI refinement applied",
        description: "Goal details, coaching insights and confirmed workload were saved. Other portfolio goals were not changed.",
      });
      setOpen(false);
      reset();
      await onApplied();
    } catch (error: any) {
      toast({
        title: "Could not apply AI refinement",
        description: error?.message || "Your existing goal was left unchanged where possible.",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  const readyForPlan = Boolean(review?.readyToPlan && review.questions.length === 0);
  const isEssentialRound = Boolean(review && review.questions.length > 0 && questionKind === "essential");
  const isDevelopmentRound = Boolean(review && review.questions.length > 0 && questionKind === "development");
  const executionSections = insightSections(refined?.executionInsights);
  const needsEffortConfirmation = refined?.effortSource === "ai_estimated";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4 text-secondary" />
          Refine with AI
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-secondary" />
            AI Coach this goal
          </DialogTitle>
          <DialogDescription>
            Important clarification comes first. Once the goal is ready, deeper coaching has its own optional rounds.
          </DialogDescription>
        </DialogHeader>

        {!review && !refined && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="font-semibold">{goal.title}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{goal.life_area}</Badge>
                {goal.start_date && <Badge variant="secondary">Starts {goal.start_date}</Badge>}
                {goal.end_date && <Badge variant="secondary">Ends {goal.end_date}</Badge>}
                <Badge variant="secondary">{Number(goal.estimated_hours_per_week || 0)}h/week</Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <p className="font-semibold">Clarify what matters</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Up to three essential rounds help prevent a generic or poorly scoped plan.
                </p>
              </div>
              <div className="rounded-xl border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-secondary" />
                  <p className="font-semibold">Think deeper if useful</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  After the goal is plan-ready, up to two separate optional rounds can explore strategy, risks and execution.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={startReview} disabled={coaching} className="gap-2">
                {coaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {coaching ? "Reviewing..." : "Review goal"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {review && !refined && (
          <div className="space-y-5">
            <div className="rounded-xl border bg-primary/5 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">AI Coach review</p>
                <div className="flex flex-wrap gap-2">
                  {isEssentialRound && (
                    <Badge variant="outline">Essential round {essentialRounds} of {ESSENTIAL_ROUND_LIMIT}</Badge>
                  )}
                  {isDevelopmentRound && (
                    <Badge variant="outline">Deeper round {deeperRounds} of {DEEPER_ROUND_LIMIT}</Badge>
                  )}
                  <Badge variant={review.readyToPlan ? "secondary" : "outline"}>
                    {review.readyToPlan ? "Ready to plan" : "Needs clarification"}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{review.feedback}</p>
              {review.coachNote && <p className="mt-3 text-sm font-medium">{review.coachNote}</p>}
            </div>

            {isEssentialRound && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold">Important questions</h4>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These are needed to make the plan specific and realistic. They stay fixed for this round.
                  </p>
                </div>

                {review.questions.map((item, index) => (
                  <div key={item.question} className="space-y-2 rounded-xl border p-4">
                    <Label htmlFor={`goal-core-question-${goal.id}-${index}`}>{item.question}</Label>
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                    <Input
                      id={`goal-core-question-${goal.id}-${index}`}
                      value={answers[index] ?? ""}
                      onChange={(event) => {
                        const next = [...answers];
                        next[index] = event.target.value;
                        setAnswers(next);
                      }}
                      placeholder="Your answer..."
                    />
                  </div>
                ))}

                <DialogFooter>
                  <Button variant="outline" onClick={reset} disabled={coaching || refining}>
                    Start over
                  </Button>
                  <Button onClick={continueCore} disabled={coaching || refining} className="gap-2">
                    {coaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    {coaching ? "Checking..." : "Continue coaching"}
                  </Button>
                </DialogFooter>
              </div>
            )}

            {readyForPlan && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">This goal has enough information for a useful plan.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Build it now, or use the separate deeper-coaching allowance to think through strategy, resources, risks and safeguards.
                    </p>
                  </div>
                </div>

                {history.length > 0 && (
                  <div className="rounded-xl border p-4">
                    <p className="mb-2 text-sm font-semibold">Coaching insights captured</p>
                    <p className="text-sm text-muted-foreground">
                      {history.length} answer{history.length === 1 ? "" : "s"} will be carried into the refined plan.
                    </p>
                  </div>
                )}

                <DialogFooter>
                  {deeperRounds < DEEPER_ROUND_LIMIT && (
                    <Button variant="outline" onClick={() => exploreDeeper()} disabled={coaching || refining} className="gap-2">
                      {coaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                      Explore deeper
                    </Button>
                  )}
                  <Button onClick={buildPlanNow} disabled={coaching || refining} className="gap-2">
                    {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                    {refining ? "Building plan..." : "Build my plan now"}
                  </Button>
                </DialogFooter>
              </div>
            )}

            {isDevelopmentRound && (
              <div className="space-y-4">
                <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-secondary" />
                    <h4 className="font-semibold">Think deeper</h4>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These questions are optional. Answer the ones that help; your plan is already unblocked.
                  </p>
                </div>

                {review.questions.map((item, index) => (
                  <div key={item.question} className="space-y-2 rounded-xl border p-4">
                    <Label htmlFor={`goal-deep-question-${goal.id}-${index}`}>{item.question}</Label>
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                    <Input
                      id={`goal-deep-question-${goal.id}-${index}`}
                      value={answers[index] ?? ""}
                      onChange={(event) => {
                        const next = [...answers];
                        next[index] = event.target.value;
                        setAnswers(next);
                      }}
                      placeholder="Optional answer..."
                    />
                  </div>
                ))}

                <DialogFooter>
                  {deeperRounds < DEEPER_ROUND_LIMIT && (
                    <Button variant="outline" onClick={anotherDeeperRound} disabled={coaching || refining} className="gap-2">
                      {coaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                      Ask another deeper round
                    </Button>
                  )}
                  <Button onClick={buildWithDevelopmentAnswers} disabled={coaching || refining} className="gap-2">
                    {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                    {refining ? "Building plan..." : "Build with these insights"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </div>
        )}

        {refined && (
          <div className="space-y-5">
            <div className="rounded-xl border bg-gradient-to-r from-primary/10 via-secondary/5 to-transparent p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Suggested refined goal</p>
              <h3 className="mt-1 text-xl font-bold">{refined.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{refined.description}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Life area</p>
                <p className="mt-1 font-medium">{refined.lifeArea || goal.life_area}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Start</p>
                <p className="mt-1 flex items-center gap-1 font-medium">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {refined.startDate || goal.start_date || "Not set"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">End</p>
                <p className="mt-1 flex items-center gap-1 font-medium">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {refined.endDate || goal.end_date || "Not set"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Weekly effort</p>
                <p className="mt-1 flex items-center gap-1 font-medium">
                  <Clock3 className="h-3.5 w-3.5" />
                  {effortToSave || "0"}h/week
                </p>
              </div>
            </div>

            <div className={needsEffortConfirmation
              ? "rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
              : "rounded-xl border border-primary/20 bg-primary/5 p-4"
            }>
              <div className="flex items-start gap-3">
                {needsEffortConfirmation
                  ? <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                }
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {needsEffortConfirmation ? "AI-estimated workload — confirm before saving" : "Weekly effort came from your coaching answers"}
                  </p>
                  {refined.effortRationale && (
                    <p className="mt-1 text-sm text-muted-foreground">{refined.effortRationale}</p>
                  )}
                  <div className="mt-3 max-w-xs space-y-2">
                    <Label htmlFor={`goal-effort-confirm-${goal.id}`}>Weekly effort to save</Label>
                    <div className="relative">
                      <Input
                        id={`goal-effort-confirm-${goal.id}`}
                        type="number"
                        min="0"
                        max="168"
                        step="0.25"
                        value={effortToSave}
                        onChange={(event) => {
                          setEffortToSave(event.target.value);
                          if (needsEffortConfirmation) setEffortConfirmed(false);
                        }}
                        className="pr-20"
                      />
                      <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">hrs/week</span>
                    </div>
                  </div>
                  {needsEffortConfirmation && (
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
                      <Checkbox
                        checked={effortConfirmed}
                        onCheckedChange={(checked) => setEffortConfirmed(checked === true)}
                      />
                      <span>I have reviewed this workload and want to use it for portfolio planning.</span>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {(refined.milestones?.length ?? 0) > 0 && (
              <div>
                <h4 className="mb-3 font-semibold">Suggested milestones</h4>
                <div className="space-y-2">
                  {refined.milestones!.map((milestone, index) => (
                    <div key={`${milestone.title}-${index}`} className="flex items-start gap-3 rounded-lg border p-3">
                      <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{milestone.title}</p>
                        {milestone.dueDate && <p className="text-xs text-muted-foreground">{milestone.dueDate}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {displayedEffortPeriods.length > 0 && (
              <div>
                <h4 className="mb-3 font-semibold">Suggested workload phases</h4>
                <div className="space-y-2">
                  {displayedEffortPeriods.map((period, index) => (
                    <div key={`${period.label}-${index}`} className="grid gap-1 rounded-lg border p-3 sm:grid-cols-[1fr_auto]">
                      <div>
                        <p className="text-sm font-medium">{period.label || "Goal work"}</p>
                        <p className="text-xs text-muted-foreground">{period.startDate} → {period.endDate}</p>
                      </div>
                      <Badge variant="secondary">{period.hoursPerWeek}h/week</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {executionSections.length > 0 && (
              <div className="rounded-xl border bg-muted/15 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-secondary" />
                  <h4 className="font-semibold">Execution insights preserved</h4>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {executionSections.map((section) => (
                    <div key={section.label}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {section.values.map((value) => <li key={value}>• {value}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
              Review before applying. Existing milestones are preserved; non-duplicate AI milestones are added.
              Coaching insights are saved with the goal so future planning and replanning can use them.
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRefined(null)} disabled={applying}>
                Back
              </Button>
              <Button
                onClick={apply}
                disabled={applying || (needsEffortConfirmation && !effortConfirmed)}
                className="gap-2"
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {applying ? "Applying..." : "Apply to this goal"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
