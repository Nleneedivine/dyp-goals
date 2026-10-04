import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentGoalEnrollment } from "@/lib/cohortScope";

const AVAILABILITY = [
  { value: "weekday_evenings", label: "Weekday evenings" },
  { value: "weekend_mornings", label: "Weekend mornings" },
  { value: "weekend_afternoons", label: "Weekend afternoons" },
  { value: "flexible", label: "Flexible" },
] as const;

type JoinResult = {
  groupId?: string;
  groupName?: string;
  goalAreas?: string[];
};

export function AccountabilityLabCard({ onJoined }: { onJoined?: (groupId: string) => void } = {}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [goalCount, setGoalCount] = useState(0);
  const [goalAreas, setGoalAreas] = useState<string[]>([]);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [availability, setAvailability] = useState<string[]>([]);
  const [committed, setCommitted] = useState(false);

  const availabilityLabel = useMemo(
    () =>
      availability
        .map((value) => AVAILABILITY.find((option) => option.value === value)?.label)
        .filter(Boolean)
        .join(", "),
    [availability],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const currentEnrollment = await getCurrentGoalEnrollment(user.id);
      if (!currentEnrollment) {
        setLoading(false);
        return;
      }

      setEnrollmentId(currentEnrollment.id);

      const [goalsResult, membershipResult, preferenceResult] = await Promise.all([
        supabase
          .from("goals")
          .select("life_area")
          .eq("enrollment_id", currentEnrollment.id)
          .neq("status", "archived"),
        supabase
          .from("program_accountability_memberships")
          .select("group_id")
          .eq("enrollment_id", currentEnrollment.id)
          .eq("status", "active")
          .maybeSingle(),
        supabase
          .from("accountability_lab_preferences")
          .select("availability,goal_areas,commitment_accepted")
          .eq("enrollment_id", currentEnrollment.id)
          .maybeSingle(),
      ]);

      const goals = goalsResult.data ?? [];
      setGoalCount(goals.length);
      setGoalAreas(
        Array.from(
          new Set(
            goals
              .map((goal) => goal.life_area?.trim())
              .filter((value): value is string => Boolean(value)),
          ),
        ),
      );

      if (preferenceResult.data) {
        setAvailability(preferenceResult.data.availability ?? []);
        setGoalAreas(preferenceResult.data.goal_areas ?? []);
        setCommitted(Boolean(preferenceResult.data.commitment_accepted));
      }

      if (membershipResult.data?.group_id) {
        const { data: group } = await supabase
          .from("accountability_groups")
          .select("name")
          .eq("id", membershipResult.data.group_id)
          .maybeSingle();

        setGroupName(group?.name ?? "Your accountability group");
      }

      setLoading(false);
    };

    void load();
  }, []);

  const toggleAvailability = (value: string, checked: boolean) => {
    setAvailability((current) =>
      checked
        ? Array.from(new Set([...current, value]))
        : current.filter((item) => item !== value),
    );
  };

  const join = async () => {
    if (!enrollmentId) {
      toast({
        title: "Current GOALS enrollment required",
        description: "Activate your current GOALS participation before joining Accountability Lab.",
        variant: "destructive",
      });
      return;
    }

    if (goalCount === 0) {
      toast({
        title: "Finish your goals first",
        description: "Create at least one current GOALS goal before we recommend an accountability group.",
        variant: "destructive",
      });
      return;
    }

    if (!availability.length || !committed) {
      toast({
        title: "Complete the two join steps",
        description: "Choose when you can meet and confirm the accountability commitment.",
        variant: "destructive",
      });
      return;
    }

    setJoining(true);
    const { data, error } = await supabase.rpc("join_current_accountability_lab", {
      p_availability: availability,
    });
    setJoining(false);

    if (error) {
      toast({
        title: "We couldn't place you yet",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const result = (data ?? {}) as JoinResult;
    setGroupName(result.groupName ?? "Your accountability group");
    setGoalAreas(result.goalAreas ?? goalAreas);
    if (result.groupId) onJoined?.(result.groupId);

    toast({
      title: "Accountability group ready",
      description: `You've been placed in ${result.groupName ?? "an accountability group"}.`,
    });
  };

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="flex min-h-36 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!enrollmentId) {
    return null;
  }

  if (groupName) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Accountability Lab
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-semibold">You're in {groupName}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your group is tied to this GOALS cohort. Your previous-year accountability history remains separate.
          </p>
          {goalAreas.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Goal areas: {goalAreas.join(", ")}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Join Accountability Lab
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Your goal areas are already taken from your current GOALS portfolio. Just tell us when you can meet and confirm your commitment; the system will place you with the best available cohort group.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {goalCount === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Create and save at least one goal first. Accountability matching activates when your current goal portfolio exists.
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium">Detected goal areas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {goalAreas.length > 0 ? goalAreas.join(", ") : "Your current goals"}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">When can you usually join a group check-in?</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {AVAILABILITY.map((option) => {
                  const checked = availability.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border p-3"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleAvailability(option.value, value === true)}
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  );
                })}
              </div>
              {availabilityLabel && (
                <p className="text-xs text-muted-foreground">
                  Selected: {availabilityLabel}
                </p>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/20 p-4">
              <Checkbox
                className="mt-0.5"
                checked={committed}
                onCheckedChange={(value) => setCommitted(value === true)}
              />
              <span className="text-sm">
                I can participate in regular accountability check-ins, respect group privacy, and make a genuine effort to report progress on my goals.
              </span>
            </label>

            <Button
              type="button"
              onClick={() => void join()}
              disabled={joining || !availability.length || !committed}
              className="w-full sm:w-auto"
            >
              {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Find my accountability group
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
