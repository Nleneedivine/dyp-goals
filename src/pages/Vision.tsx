import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Compass,
  Layers3,
  Loader2,
  Plus,
  Save,
  Target,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type LifeAreaFocus = Tables<"life_area_focus">;
type Goal = Tables<"goals">;

const DEFAULT_LIFE_AREAS = [
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

const missingTable = (code?: string) => code === "PGRST205" || code === "42P01";

export default function Vision() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [userId, setUserId] = useState("");
  const [vision, setVision] = useState("");
  const [yearTheme, setYearTheme] = useState("");
  const [savingVision, setSavingVision] = useState(false);
  const [focusRows, setFocusRows] = useState<LifeAreaFocus[]>([]);
  const [goalAreas, setGoalAreas] = useState<string[]>([]);
  const [newArea, setNewArea] = useState("");
  const [customArea, setCustomArea] = useState("");
  const [newFocus, setNewFocus] = useState("");
  const [addingFocus, setAddingFocus] = useState(false);
  const [savingFocusId, setSavingFocusId] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const [visionResult, focusResult, goalsResult] = await Promise.all([
      supabase
        .from("user_planning_vision")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("life_area_focus")
        .select("*")
        .eq("user_id", user.id)
        .order("display_order", { ascending: true })
        .order("life_area", { ascending: true }),
      supabase
        .from("goals")
        .select("id, life_area")
        .eq("user_id", user.id)
        .neq("status", "archived"),
    ]);

    if (
      missingTable(visionResult.error?.code) ||
      missingTable(focusResult.error?.code)
    ) {
      setAvailable(false);
      setLoading(false);
      return;
    }

    const firstError = visionResult.error || focusResult.error || goalsResult.error;
    if (firstError) {
      toast({
        title: "Vision context could not load",
        description: firstError.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    setAvailable(true);
    setVision(visionResult.data?.vision_statement ?? "");
    setYearTheme(visionResult.data?.year_theme ?? "");
    setFocusRows(focusResult.data ?? []);
    setGoalAreas(
      Array.from(
        new Set(
          ((goalsResult.data ?? []) as Pick<Goal, "id" | "life_area">[])
            .map((goal) => goal.life_area.trim())
            .filter(Boolean),
        ),
      ),
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const areaOptions = useMemo(
    () =>
      Array.from(new Set([...DEFAULT_LIFE_AREAS, ...goalAreas]))
        .filter((area) => area !== "Other")
        .sort((a, b) => a.localeCompare(b)),
    [goalAreas],
  );

  const saveVision = async () => {
    if (!userId) return;
    if (vision.length > 12000 || yearTheme.length > 240) {
      toast({
        title: "Check the direction text",
        description: "Vision can be up to 12,000 characters and the theme up to 240.",
        variant: "destructive",
      });
      return;
    }

    setSavingVision(true);
    const { error } = await supabase
      .from("user_planning_vision")
      .upsert({
        user_id: userId,
        vision_statement: vision.trim(),
        year_theme: yearTheme.trim(),
      }, { onConflict: "user_id" });
    setSavingVision(false);

    if (error) {
      toast({
        title: "Vision could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Direction saved",
      description: "Your vision context is now available above the goal portfolio.",
    });
  };

  const addFocus = async () => {
    if (!userId) return;
    const lifeArea = (newArea === "__custom__" ? customArea : newArea).trim();
    if (!lifeArea) {
      toast({
        title: "Choose or enter a life area",
        variant: "destructive",
      });
      return;
    }
    if (lifeArea.length > 80 || newFocus.length > 4000) {
      toast({
        title: "Check the life-area focus",
        description: "Life area names can be up to 80 characters and focus statements up to 4,000.",
        variant: "destructive",
      });
      return;
    }

    const duplicate = focusRows.some(
      (row) => row.life_area.toLowerCase() === lifeArea.toLowerCase(),
    );
    if (duplicate) {
      toast({
        title: "That life area already has a focus",
        description: "Edit the existing focus instead of adding a duplicate.",
        variant: "destructive",
      });
      return;
    }

    setAddingFocus(true);
    const { data, error } = await supabase
      .from("life_area_focus")
      .insert({
        user_id: userId,
        life_area: lifeArea,
        focus_statement: newFocus.trim(),
        display_order: focusRows.length,
      })
      .select("*")
      .single();
    setAddingFocus(false);

    if (error) {
      toast({
        title: "Life-area focus could not be added",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setFocusRows((current) => [...current, data]);
    setNewArea("");
    setCustomArea("");
    setNewFocus("");
  };

  const saveFocus = async (row: LifeAreaFocus) => {
    const lifeArea = row.life_area.trim();
    if (!lifeArea || lifeArea.length > 80 || row.focus_statement.length > 4000) {
      toast({
        title: "Check this life-area focus",
        variant: "destructive",
      });
      return;
    }

    setSavingFocusId(row.id);
    const { error } = await supabase
      .from("life_area_focus")
      .update({
        life_area: lifeArea,
        focus_statement: row.focus_statement.trim(),
        active: row.active,
      })
      .eq("id", row.id);
    setSavingFocusId("");

    if (error) {
      toast({
        title: "Life-area focus could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setFocusRows((current) =>
      current.map((item) =>
        item.id === row.id
          ? { ...item, life_area: lifeArea, focus_statement: row.focus_statement.trim() }
          : item,
      ),
    );
    toast({ title: "Life-area focus saved" });
  };

  const deleteFocus = async (id: string) => {
    const { error } = await supabase
      .from("life_area_focus")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "Life-area focus could not be removed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setFocusRows((current) => current.filter((row) => row.id !== id));
  };

  if (loading) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-28">
        <div className="container mx-auto flex max-w-5xl items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </main>
    );
  }

  if (!available) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-28">
        <div className="container mx-auto max-w-4xl">
          <Card className="border-primary/15">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-primary" />
                Vision & life areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                Vision context is prepared in the app but the database update is still pending. Your current goals and planner remain fully usable until it is activated.
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-28">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              <Compass className="h-4 w-4" />
              Direction before goals
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Vision → Life Areas → Goals
            </h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Capture the direction your portfolio is meant to serve, then state what matters in each life area before turning that direction into individual goals.
            </p>
          </div>

          <Button asChild className="gap-2">
            <Link to="/my-goals">
              Open My GOALS
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <Card className="mb-6 border-primary/15">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-primary" />
              Personal direction
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              This context is private by default. It is not automatically shared with mentors or used to rank your goals.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="year-theme">Theme or focus for this season</Label>
              <Input
                id="year-theme"
                value={yearTheme}
                onChange={(event) => setYearTheme(event.target.value)}
                placeholder="e.g. Build sustainable systems, deepen consistency, prepare for transition"
                maxLength={240}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vision-statement">Vision statement</Label>
              <Textarea
                id="vision-statement"
                value={vision}
                onChange={(event) => setVision(event.target.value)}
                placeholder="Describe the direction you want your life and goals to move toward, and why it matters."
                rows={7}
                maxLength={12000}
              />
              <p className="text-xs text-muted-foreground">
                Keep this broad enough to guide several goals rather than describing one project.
              </p>
            </div>

            <Button onClick={saveVision} disabled={savingVision} className="gap-2">
              {savingVision ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingVision ? "Saving..." : "Save direction"}
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers3 className="h-5 w-5 text-primary" />
              Life-area focus
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              A life-area focus is not another goal. It records what you want this area of life to stand for so future goals can remain connected to a larger direction.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {focusRows.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No life-area focus statements yet.
              </div>
            ) : (
              <div className="space-y-3">
                {focusRows.map((row) => (
                  <div key={row.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            value={row.life_area}
                            onChange={(event) =>
                              setFocusRows((current) =>
                                current.map((item) =>
                                  item.id === row.id
                                    ? { ...item, life_area: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            className="max-w-xs font-medium"
                            maxLength={80}
                            aria-label="Life area"
                          />
                          {goalAreas.includes(row.life_area) && (
                            <Badge variant="secondary">Used by saved goals</Badge>
                          )}
                        </div>

                        <Textarea
                          value={row.focus_statement}
                          onChange={(event) =>
                            setFocusRows((current) =>
                              current.map((item) =>
                                item.id === row.id
                                  ? { ...item, focus_statement: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="What should this area look like when it is moving in the right direction?"
                          rows={3}
                          maxLength={4000}
                        />
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => saveFocus(row)}
                          disabled={savingFocusId === row.id}
                          className="gap-1.5"
                        >
                          {savingFocusId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteFocus(row.id)}
                          aria-label="Remove life-area focus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border bg-muted/10 p-4">
              <p className="font-semibold">Add a life-area focus</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr_auto]">
                <div className="space-y-2">
                  <Select value={newArea} onValueChange={setNewArea}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose life area" />
                    </SelectTrigger>
                    <SelectContent>
                      {areaOptions.map((area) => (
                        <SelectItem key={area} value={area}>{area}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">Custom area…</SelectItem>
                    </SelectContent>
                  </Select>
                  {newArea === "__custom__" && (
                    <Input
                      value={customArea}
                      onChange={(event) => setCustomArea(event.target.value)}
                      placeholder="Custom life area"
                      maxLength={80}
                    />
                  )}
                </div>

                <Textarea
                  value={newFocus}
                  onChange={(event) => setNewFocus(event.target.value)}
                  placeholder="What direction do you want this area to move toward?"
                  rows={3}
                  maxLength={4000}
                />

                <Button
                  type="button"
                  onClick={addFocus}
                  disabled={
                    addingFocus ||
                    !newArea ||
                    (newArea === "__custom__" && !customArea.trim())
                  }
                  className="gap-2 lg:self-start"
                >
                  {addingFocus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {goalAreas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-primary" />
                Life areas already represented by your goals
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {goalAreas.map((area) => (
                <Badge key={area} variant="outline">{area}</Badge>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
