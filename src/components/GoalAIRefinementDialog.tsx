import { useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Loader2, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type GoalMilestone = Tables<"goal_milestones">;

interface GoalAnalysisItem {
  score: number;
  feedback: string;
  questions: string[];
  improvedVersion: string;
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
  lifeArea?: string;
  startDate?: string | null;
  endDate?: string | null;
  priority?: "primary" | "maintenance" | "later";
  estimatedHoursPerWeek?: number;
  successDefinition?: string;
  milestones?: RefinedMilestone[];
  effortPeriods?: RefinedEffortPeriod[];
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

const goalContext = (goal: Goal) => [
  `Goal: ${goal.title}`,
  goal.description ? `Description: ${goal.description}` : "",
  `Life area: ${goal.life_area}`,
  goal.start_date ? `Start date: ${goal.start_date}` : "",
  goal.end_date ? `End date/deadline: ${goal.end_date}` : "",
  `Priority: ${goal.priority}`,
  `Current estimated effort: ${Number(goal.estimated_hours_per_week || 0)} hours/week`,
  goal.success_definition ? `Success definition: ${goal.success_definition}` : "",
].filter(Boolean).join("\n");

const targetYearFor = (goal: Goal) => {
  const currentYear = new Date().getFullYear();
  const candidate = Number((goal.end_date ?? goal.start_date ?? "").slice(0, 4));
  return Number.isInteger(candidate) && candidate >= currentYear ? candidate : currentYear;
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
  const [analysis, setAnalysis] = useState<GoalAnalysisItem | null>(null);
  const [responses, setResponses] = useState<string[]>([]);
  const [refined, setRefined] = useState<RefinedPortfolioGoal | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [refining, setRefining] = useState(false);
  const [applying, setApplying] = useState(false);

  const reset = () => {
    setAnalysis(null);
    setResponses([]);
    setRefined(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const analyze = async () => {
    setAnalyzing(true);
    setRefined(null);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const planningStartDate = goal.start_date && goal.start_date >= today ? goal.start_date : undefined;
      const { data, error } = await supabase.functions.invoke("analyze-goals", {
        body: {
          goals: goalContext(goal),
          targetYear: targetYearFor(goal),
          planningStartDate,
        },
      });

      if (error) throw error;
      const item = data?.analysis?.goals?.[0] as GoalAnalysisItem | undefined;
      if (!item) throw new Error("AI did not return a goal analysis.");

      setAnalysis(item);
      setResponses(item.questions.map(() => ""));
    } catch (error: any) {
      toast({
        title: "AI review failed",
        description: error?.message || "Unable to review this goal.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const refine = async () => {
    if (!analysis) return;
    if (analysis.questions.some((_, index) => !responses[index]?.trim())) {
      toast({
        title: "Answer the clarification questions",
        description: "The AI only asks questions it still needs for this goal.",
        variant: "destructive",
      });
      return;
    }

    setRefining(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const planningStartDate = goal.start_date && goal.start_date >= today ? goal.start_date : undefined;
      const { data, error } = await supabase.functions.invoke("refine-goals", {
        body: {
          originalGoals: goalContext(goal),
          questions: analysis.questions,
          responses: responses.map((value) => value.trim()),
          targetYear: targetYearFor(goal),
          planningStartDate,
          portfolioGoal: {
            title: goal.title,
            description: goal.description,
            lifeArea: goal.life_area,
            startDate: goal.start_date,
            endDate: goal.end_date,
            priority: goal.priority,
            estimatedHoursPerWeek: Number(goal.estimated_hours_per_week || 0),
            successDefinition: goal.success_definition,
          },
        },
      });

      if (error) throw error;
      const result = data?.refined?.refinedGoals?.[0] as RefinedPortfolioGoal | undefined;
      if (!result) throw new Error("AI did not return a refined goal.");

      setRefined(result);
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

  const apply = async () => {
    if (!refined) return;

    const startDate = refined.startDate ?? goal.start_date;
    const endDate = refined.endDate ?? goal.end_date;
    if (startDate && endDate && endDate < startDate) {
      toast({ title: "AI returned an invalid date window", variant: "destructive" });
      return;
    }

    const lifeArea = refined.lifeArea && LIFE_AREAS.includes(refined.lifeArea)
      ? refined.lifeArea
      : goal.life_area;
    const priority = refined.priority ?? goal.priority;
    const hours = refined.estimatedHoursPerWeek ?? Number(goal.estimated_hours_per_week || 0);

    setApplying(true);
    try {
      const { error: goalError } = await supabase
        .from("goals")
        .update({
          title: refined.title.trim(),
          description: refined.description.trim(),
          life_area: lifeArea,
          start_date: startDate,
          end_date: endDate,
          priority,
          estimated_hours_per_week: hours,
          success_definition: (refined.successDefinition || refined.successMetrics.join("; ")).trim(),
        })
        .eq("id", goal.id);

      if (goalError) throw goalError;

      const existingMilestoneKeys = new Set(
        milestones.map((milestone) => `${milestone.title.trim().toLowerCase()}|${milestone.due_date ?? ""}`)
      );
      const suggestedMilestones = (refined.milestones ?? [])
        .filter((milestone) => {
          if (!milestone.title.trim()) return false;
          const dueDate = milestone.dueDate ?? null;
          if (dueDate && startDate && dueDate < startDate) return false;
          if (dueDate && endDate && dueDate > endDate) return false;
          return !existingMilestoneKeys.has(`${milestone.title.trim().toLowerCase()}|${dueDate ?? ""}`);
        })
        .map((milestone, index) => ({
          goal_id: goal.id,
          title: milestone.title.trim(),
          due_date: milestone.dueDate ?? null,
          display_order: milestones.length + index,
        }));

      if (suggestedMilestones.length) {
        const { error } = await supabase.from("goal_milestones").insert(suggestedMilestones);
        if (error) throw error;
      }

      if (refined.effortPeriods) {
        const validPeriods = refined.effortPeriods.filter((period) => {
          if (period.endDate < period.startDate) return false;
          if (startDate && period.startDate < startDate) return false;
          if (endDate && period.endDate > endDate) return false;
          return period.hoursPerWeek >= 0 && period.hoursPerWeek <= 168;
        });

        const { error: deleteError } = await supabase
          .from("goal_effort_periods")
          .delete()
          .eq("goal_id", goal.id);
        if (deleteError) throw deleteError;

        if (validPeriods.length) {
          const { error: effortError } = await supabase.from("goal_effort_periods").insert(
            validPeriods.map((period) => ({
              goal_id: goal.id,
              label: period.label,
              start_date: period.startDate,
              end_date: period.endDate,
              hours_per_week: period.hoursPerWeek,
            }))
          );
          if (effortError) throw effortError;
        }
      }

      toast({
        title: "AI refinement applied",
        description: "Your goal and suggested milestones have been updated. Other portfolio goals were not changed.",
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
            Refine this goal
          </DialogTitle>
          <DialogDescription>
            The AI reviews this goal independently. It can suggest milestones and workload, but it will not change your other goals.
          </DialogDescription>
        </DialogHeader>

        {!analysis && !refined && (
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
            <p className="text-sm text-muted-foreground">
              Clear goals may need no questions. Vague goals may need up to three.
            </p>
            <DialogFooter>
              <Button onClick={analyze} disabled={analyzing} className="gap-2">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {analyzing ? "Reviewing..." : "Review goal"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {analysis && !refined && (
          <div className="space-y-5">
            <div className="rounded-xl border bg-primary/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-semibold">AI review</p>
                <Badge variant="outline">{analysis.score}% SMART</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{analysis.feedback}</p>
              <div className="mt-3 rounded-lg bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Possible refined version</p>
                <p className="mt-1 text-sm">{analysis.improvedVersion}</p>
              </div>
            </div>

            {analysis.questions.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">No clarification needed</p>
                  <p className="text-sm text-muted-foreground">The goal is clear enough for the AI to build its structured plan.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold">Clarification</h4>
                  <p className="text-sm text-muted-foreground">These questions apply only to this goal.</p>
                </div>
                {analysis.questions.map((question, index) => (
                  <div key={question} className="space-y-2">
                    <Label htmlFor={`goal-ai-question-${goal.id}-${index}`}>{question}</Label>
                    <Input
                      id={`goal-ai-question-${goal.id}-${index}`}
                      value={responses[index] ?? ""}
                      onChange={(event) => {
                        const next = [...responses];
                        next[index] = event.target.value;
                        setResponses(next);
                      }}
                      placeholder="Your answer..."
                    />
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={analyze} disabled={analyzing || refining}>
                Review again
              </Button>
              <Button onClick={refine} disabled={refining || analyzing} className="gap-2">
                {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                {refining ? "Building plan..." : "Build refined plan"}
              </Button>
            </DialogFooter>
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
                <p className="text-xs text-muted-foreground">Typical effort</p>
                <p className="mt-1 flex items-center gap-1 font-medium">
                  <Clock3 className="h-3.5 w-3.5" />
                  {refined.estimatedHoursPerWeek ?? Number(goal.estimated_hours_per_week || 0)}h/week
                </p>
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

            {(refined.effortPeriods?.length ?? 0) > 0 && (
              <div>
                <h4 className="mb-3 font-semibold">Suggested workload phases</h4>
                <div className="space-y-2">
                  {refined.effortPeriods!.map((period, index) => (
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

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
              Review before applying. Existing milestones are preserved; non-duplicate AI milestones are added.
              Workload phases for this goal are replaced with the reviewed AI suggestion.
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRefined(null)} disabled={applying}>
                Back
              </Button>
              <Button onClick={apply} disabled={applying} className="gap-2">
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
