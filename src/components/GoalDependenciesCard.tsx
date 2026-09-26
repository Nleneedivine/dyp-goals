import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Goal = Tables<"goals">;
type GoalDependency = Tables<"goal_dependencies">;

export function GoalDependenciesCard({ goals }: { goals: Goal[] }) {
  const { toast } = useToast();
  const [dependencies, setDependencies] = useState<GoalDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);
  const [prerequisiteGoalId, setPrerequisiteGoalId] = useState("");
  const [dependentGoalId, setDependentGoalId] = useState("");
  const [note, setNote] = useState("");

  const availableGoals = useMemo(
    () => goals.filter((goal) => goal.status !== "archived"),
    [goals],
  );

  const goalMap = useMemo(
    () => new Map(availableGoals.map((goal) => [goal.id, goal])),
    [availableGoals],
  );

  const loadDependencies = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("goal_dependencies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    setLoading(false);

    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") {
        setAvailable(false);
        setDependencies([]);
        return;
      }
      toast({
        title: "Goal dependencies could not load",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setAvailable(true);
    setDependencies(data ?? []);
  };

  useEffect(() => {
    void loadDependencies();
  }, []);

  useEffect(() => {
    if (!prerequisiteGoalId && availableGoals.length) {
      setPrerequisiteGoalId(availableGoals[0].id);
    }
    if (!dependentGoalId && availableGoals.length > 1) {
      setDependentGoalId(availableGoals[1].id);
    }
  }, [availableGoals, prerequisiteGoalId, dependentGoalId]);

  const createsCycle = (fromGoalId: string, toGoalId: string) => {
    const adjacency = new Map<string, string[]>();

    dependencies.forEach((dependency) => {
      const current = adjacency.get(dependency.prerequisite_goal_id) ?? [];
      current.push(dependency.dependent_goal_id);
      adjacency.set(dependency.prerequisite_goal_id, current);
    });

    const next = adjacency.get(fromGoalId) ?? [];
    next.push(toGoalId);
    adjacency.set(fromGoalId, next);

    const seen = new Set<string>();
    const stack = new Set<string>();

    const visit = (goalId: string): boolean => {
      if (stack.has(goalId)) return true;
      if (seen.has(goalId)) return false;

      seen.add(goalId);
      stack.add(goalId);

      for (const dependentId of adjacency.get(goalId) ?? []) {
        if (visit(dependentId)) return true;
      }

      stack.delete(goalId);
      return false;
    };

    return Array.from(adjacency.keys()).some((goalId) => visit(goalId));
  };

  const addDependency = async () => {
    if (!prerequisiteGoalId || !dependentGoalId) return;

    if (prerequisiteGoalId === dependentGoalId) {
      toast({
        title: "Choose two different goals",
        variant: "destructive",
      });
      return;
    }

    if (
      dependencies.some(
        (dependency) =>
          dependency.prerequisite_goal_id === prerequisiteGoalId &&
          dependency.dependent_goal_id === dependentGoalId,
      )
    ) {
      toast({
        title: "That dependency already exists",
        variant: "destructive",
      });
      return;
    }

    if (createsCycle(prerequisiteGoalId, dependentGoalId)) {
      toast({
        title: "That would create a dependency loop",
        description: "A goal cannot indirectly depend back on itself.",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("goal_dependencies")
      .insert({
        user_id: user.id,
        prerequisite_goal_id: prerequisiteGoalId,
        dependent_goal_id: dependentGoalId,
        note: note.trim(),
      })
      .select("*")
      .single();
    setSaving(false);

    if (error) {
      toast({
        title: "Dependency could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setDependencies((current) => [...current, data]);
    setNote("");
  };

  const deleteDependency = async (dependencyId: string) => {
    const { error } = await supabase
      .from("goal_dependencies")
      .delete()
      .eq("id", dependencyId);

    if (error) {
      toast({
        title: "Dependency could not be removed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setDependencies((current) => current.filter((item) => item.id !== dependencyId));
  };

  return (
    <Card className="mb-8 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          Goal dependencies
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Record dependencies you have personally confirmed. They are planning context only — the system will warn about them but will not automatically block or reprioritize your goals.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {!available && !loading ? (
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Goal dependency storage is not active in this workspace yet. The rest of your portfolio and planner will keep working; this section will become available after the database update is applied.
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading dependencies…
          </div>
        ) : (
          <>
            {availableGoals.length >= 2 && (
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_1.4fr_auto] lg:items-end">
                <div className="space-y-2">
                  <Label>Prerequisite goal</Label>
                  <Select value={prerequisiteGoalId} onValueChange={setPrerequisiteGoalId}>
                    <SelectTrigger><SelectValue placeholder="Choose goal" /></SelectTrigger>
                    <SelectContent>
                      {availableGoals
                        .filter((goal) => goal.id !== dependentGoalId)
                        .map((goal) => (
                          <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pb-2 text-center text-sm font-medium text-muted-foreground">
                  before
                </div>

                <div className="space-y-2">
                  <Label>Dependent goal</Label>
                  <Select value={dependentGoalId} onValueChange={setDependentGoalId}>
                    <SelectTrigger><SelectValue placeholder="Choose goal" /></SelectTrigger>
                    <SelectContent>
                      {availableGoals
                        .filter((goal) => goal.id !== prerequisiteGoalId)
                        .map((goal) => (
                          <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Why? <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={1000}
                    placeholder="e.g. I need the research results before writing the report"
                  />
                </div>

                <Button onClick={addDependency} disabled={saving || !prerequisiteGoalId || !dependentGoalId} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </Button>
              </div>
            )}

            {dependencies.length === 0 ? (
              <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                No confirmed goal dependencies yet. AI portfolio review may surface possible relationships, but only add one here when you agree it is real.
              </div>
            ) : (
              <div className="space-y-2">
                {dependencies.map((dependency) => {
                  const prerequisite = goalMap.get(dependency.prerequisite_goal_id);
                  const dependent = goalMap.get(dependency.dependent_goal_id);

                  return (
                    <div
                      key={dependency.id}
                      className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant="outline">{prerequisite?.title ?? "Goal"}</Badge>
                          <span className="text-muted-foreground">before</span>
                          <Badge variant="secondary">{dependent?.title ?? "Goal"}</Badge>
                        </div>
                        {dependency.note && (
                          <p className="mt-2 text-xs text-muted-foreground">{dependency.note}</p>
                        )}
                      </div>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteDependency(dependency.id)}
                        aria-label="Remove dependency"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
