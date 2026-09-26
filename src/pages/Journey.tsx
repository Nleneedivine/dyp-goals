import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Circle,
  Clock3,
  Compass,
  Flag,
  Gauge,
  ListTodo,
  RefreshCw,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { JourneyExecutionSnapshot } from "@/components/JourneyExecutionSnapshot";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type Milestone = Tables<"goal_milestones">;
type WeeklyAction = Tables<"goal_weekly_actions">;
type GoalTask = Tables<"goal_tasks">;
type WeeklyReview = Tables<"goal_weekly_reviews">;
type FixedBlock = Tables<"planner_fixed_blocks">;

const CONFIRMED_EFFORT = new Set(["user_confirmed", "ai_estimate_confirmed"]);
const PLANNING_STATUSES = new Set(["draft", "active"]);

interface JourneyStep {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  detail: string;
  href: string;
  cta: string;
  icon: typeof Target;
}

export default function Journey() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [actions, setActions] = useState<WeeklyAction[]>([]);
  const [tasks, setTasks] = useState<GoalTask[]>([]);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [fixedBlocks, setFixedBlocks] = useState<FixedBlock[]>([]);
  const [capacity, setCapacity] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [
        goalsResult,
        actionsResult,
        tasksResult,
        reviewsResult,
        fixedResult,
        capacityResult,
      ] = await Promise.all([
        supabase
          .from("goals")
          .select("*")
          .eq("user_id", user.id)
          .neq("status", "archived")
          .order("created_at", { ascending: true }),
        supabase
          .from("goal_weekly_actions")
          .select("*")
          .eq("user_id", user.id)
          .order("week_start", { ascending: true }),
        supabase
          .from("goal_tasks")
          .select("*")
          .eq("user_id", user.id)
          .order("scheduled_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("goal_weekly_reviews")
          .select("*")
          .eq("user_id", user.id)
          .order("week_start", { ascending: false }),
        supabase
          .from("planner_fixed_blocks")
          .select("*")
          .eq("user_id", user.id),
        supabase
          .from("goal_capacity_settings")
          .select("default_hours_per_week")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const firstError =
        goalsResult.error ||
        actionsResult.error ||
        tasksResult.error ||
        reviewsResult.error ||
        fixedResult.error ||
        capacityResult.error;

      if (firstError) {
        toast({
          title: "Journey status could not load",
          description: firstError.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const loadedGoals = goalsResult.data ?? [];
      setGoals(loadedGoals);
      setActions(actionsResult.data ?? []);
      setTasks(tasksResult.data ?? []);
      setReviews(reviewsResult.data ?? []);
      setFixedBlocks(fixedResult.data ?? []);
      setCapacity(
        capacityResult.data
          ? Number(capacityResult.data.default_hours_per_week)
          : null,
      );

      if (loadedGoals.length) {
        const goalIds = loadedGoals.map((goal) => goal.id);
        const milestonesResult = await supabase
          .from("goal_milestones")
          .select("*")
          .in("goal_id", goalIds)
          .order("due_date", { ascending: true, nullsFirst: false });

        if (milestonesResult.error) {
          toast({
            title: "Milestones could not load",
            description: milestonesResult.error.message,
            variant: "destructive",
          });
        } else {
          setMilestones(milestonesResult.data ?? []);
        }
      } else {
        setMilestones([]);
      }

      setLoading(false);
    };

    void load();
  }, [toast]);

  const planningGoals = useMemo(
    () => goals.filter((goal) => PLANNING_STATUSES.has(goal.status)),
    [goals],
  );

  const confirmedGoals = useMemo(
    () => planningGoals.filter((goal) => CONFIRMED_EFFORT.has(goal.effort_source)),
    [planningGoals],
  );

  const datedGoals = useMemo(
    () => planningGoals.filter((goal) => Boolean(goal.start_date && goal.end_date)),
    [planningGoals],
  );

  const goalsWithMilestones = useMemo(
    () => new Set(milestones.map((milestone) => milestone.goal_id)),
    [milestones],
  );

  const portfolioPrepared =
    planningGoals.length > 0 &&
    planningGoals.every(
      (goal) =>
        CONFIRMED_EFFORT.has(goal.effort_source) &&
        Boolean(goal.start_date && goal.end_date) &&
        goalsWithMilestones.has(goal.id),
    );

  const firstExecutionBuilt = actions.length > 0 && tasks.length > 0;
  const reviewLoopStarted = reviews.length > 0;

  const steps: JourneyStep[] = [
    {
      id: "goals",
      title: "Capture your goals",
      description: "Create the goals you want the system to help you execute.",
      complete: planningGoals.length > 0,
      detail: planningGoals.length
        ? `${planningGoals.length} planning ${planningGoals.length === 1 ? "goal" : "goals"} saved`
        : "No draft or active goals yet",
      href: "/my-goals",
      cta: planningGoals.length ? "Review goals" : "Add goals",
      icon: Target,
    },
    {
      id: "coach",
      title: "Make each goal planning-ready",
      description: "Clarify dates, milestones and a weekly workload you have actually confirmed.",
      complete: portfolioPrepared,
      detail: planningGoals.length
        ? `${confirmedGoals.length}/${planningGoals.length} workload confirmed · ${datedGoals.length}/${planningGoals.length} dated`
        : "Add a goal first",
      href: "/my-goals",
      cta: "Prepare portfolio",
      icon: Flag,
    },
    {
      id: "capacity",
      title: "Set your real weekly capacity",
      description: "Tell the planner how much time can realistically go to goal work after fixed commitments.",
      complete: capacity !== null && capacity > 0,
      detail: capacity === null ? "Capacity not set" : capacity > 0 ? `${capacity.toFixed(1)} hours/week` : "Capacity is 0 hours/week",
      href: "/my-goals",
      cta: capacity === null ? "Set capacity" : "Review capacity",
      icon: Gauge,
    },
    {
      id: "commitments",
      title: "Protect fixed commitments",
      description: "Add recurring or date-specific commitments so execution does not get planned over sleep, work, classes or other protected time.",
      complete: fixedBlocks.length > 0 || firstExecutionBuilt,
      detail: fixedBlocks.length
        ? `${fixedBlocks.length} protected ${fixedBlocks.length === 1 ? "commitment" : "commitments"}`
        : firstExecutionBuilt
          ? "No protected blocks saved; execution has already started"
          : "No protected commitments added yet",
      href: "/plan",
      cta: fixedBlocks.length ? "Review schedule" : "Add commitments",
      icon: Clock3,
    },
    {
      id: "week",
      title: "Build the first execution week",
      description: "Translate goals into weekly actions and concrete daily tasks.",
      complete: firstExecutionBuilt,
      detail: firstExecutionBuilt
        ? `${actions.length} weekly actions · ${tasks.length} tasks saved`
        : "No complete Goal → Week → Task chain yet",
      href: "/plan",
      cta: firstExecutionBuilt ? "Open planner" : "Build first week",
      icon: ListTodo,
    },
    {
      id: "review",
      title: "Close the execution loop",
      description: "Save a weekly review so future planning can learn from what was actually executed.",
      complete: reviewLoopStarted,
      detail: reviewLoopStarted
        ? `${reviews.length} saved weekly ${reviews.length === 1 ? "review" : "reviews"}`
        : "No weekly review saved yet",
      href: "/plan",
      cta: reviewLoopStarted ? "Continue execution" : "Open weekly review",
      icon: RefreshCw,
    },
  ];

  const completedCount = steps.filter((step) => step.complete).length;
  const nextStep = steps.find((step) => !step.complete) ?? null;
  const percent = Math.round((completedCount / steps.length) * 100);

  if (loading) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-28">
        <div className="container mx-auto max-w-5xl animate-pulse space-y-5">
          <div className="h-12 w-72 rounded bg-muted" />
          <div className="h-36 rounded-2xl bg-muted" />
          <div className="h-96 rounded-2xl bg-muted" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-28">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-7">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            <Compass className="h-4 w-4" />
            Guided journey
          </div>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Know what to do next</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            GOALS should feel like one journey, not a toolbox. This page uses your saved portfolio and execution data to show the next unfinished stage.
          </p>
        </div>

        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Journey completion</p>
                <p className="mt-1 text-3xl font-bold">{completedCount}/{steps.length} stages</p>
              </div>
              <Badge variant={nextStep ? "outline" : "secondary"} className="w-fit">
                {nextStep ? `Next: ${nextStep.title}` : "Execution loop established"}
              </Badge>
            </div>
            <Progress value={percent} />
            {nextStep ? (
              <div className="flex flex-col gap-3 rounded-xl border bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{nextStep.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{nextStep.description}</p>
                </div>
                <Button asChild className="shrink-0 gap-2">
                  <Link to={nextStep.href}>
                    {nextStep.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <JourneyExecutionSnapshot
                tasks={tasks}
                milestones={milestones}
                reviews={reviews}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Card key={step.id} className={step.complete ? "border-primary/15" : ""}>
                <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted/20">
                    {step.complete ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Stage {index + 1}</span>
                      <Badge variant={step.complete ? "secondary" : "outline"}>
                        {step.complete ? "Ready" : "Needs attention"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <h2 className="font-semibold">{step.title}</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                    <p className="mt-2 text-xs font-medium">{step.detail}</p>
                  </div>

                  <Button asChild variant={step.complete ? "ghost" : "outline"} className="shrink-0 gap-2">
                    <Link to={step.href}>
                      {step.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarCheck2 className="h-5 w-5 text-primary" />
              What this journey does not do
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            It does not rank your goals or decide which one matters most. It only checks whether the information needed for planning and execution exists, then points you to the next unfinished system step.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
