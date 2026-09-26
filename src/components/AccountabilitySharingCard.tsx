import { useEffect, useState } from "react";
import { Loader2, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type SharingPreference = Tables<"accountability_sharing_preferences">;

interface SharingState {
  share_goals: boolean;
  share_tasks: boolean;
  share_weekly_reviews: boolean;
  share_monthly_checkins: boolean;
}

const EMPTY_SHARING: SharingState = {
  share_goals: false,
  share_tasks: false,
  share_weekly_reviews: false,
  share_monthly_checkins: false,
};

export function AccountabilitySharingCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);
  const [userId, setUserId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [mentorName, setMentorName] = useState("");
  const [hasMentor, setHasMentor] = useState(false);
  const [sharing, setSharing] = useState<SharingState>(EMPTY_SHARING);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const [profileResult, preferenceResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("group_id")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("accountability_sharing_preferences")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const sharingTablePending =
        preferenceResult.error?.code === "PGRST205" ||
        preferenceResult.error?.code === "42P01";

      if (profileResult.error || (preferenceResult.error && !sharingTablePending)) {
        toast({
          title: "Accountability sharing could not load",
          description: profileResult.error?.message ?? preferenceResult.error?.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (sharingTablePending) {
        setAvailable(false);
        setLoading(false);
        return;
      }

      setAvailable(true);

      const preference = preferenceResult.data as SharingPreference | null;
      if (preference) {
        setSharing({
          share_goals: preference.share_goals,
          share_tasks: preference.share_tasks,
          share_weekly_reviews: preference.share_weekly_reviews,
          share_monthly_checkins: preference.share_monthly_checkins,
        });
      }

      const groupId = profileResult.data?.group_id;
      if (!groupId) {
        setLoading(false);
        return;
      }

      const { data: group, error: groupError } = await supabase
        .from("accountability_groups")
        .select("id, name, mentor_id")
        .eq("id", groupId)
        .maybeSingle();

      if (groupError) {
        toast({
          title: "Accountability group could not load",
          description: groupError.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      setGroupName(group?.name ?? "");
      setHasMentor(Boolean(group?.mentor_id));

      if (group?.mentor_id) {
        const { data: mentorProfile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", group.mentor_id)
          .maybeSingle();

        if (mentorProfile) {
          setMentorName(
            [mentorProfile.first_name, mentorProfile.last_name]
              .filter(Boolean)
              .join(" "),
          );
        }
      }

      setLoading(false);
    };

    void load();
  }, []);

  const saveSharing = async (next: SharingState) => {
    if (!userId || !hasMentor) return;

    setSaving(true);
    const { error } = await supabase
      .from("accountability_sharing_preferences")
      .upsert({
        user_id: userId,
        ...next,
      }, { onConflict: "user_id" });
    setSaving(false);

    if (error) {
      toast({
        title: "Sharing preference could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setSharing(next);
    toast({
      title: "Accountability sharing updated",
      description: next.share_goals
        ? "Your assigned mentor can now see only the categories you enabled."
        : "Execution sharing with your mentor is off.",
    });
  };

  const toggleGoals = (checked: boolean) => {
    void saveSharing(
      checked
        ? { ...sharing, share_goals: true }
        : EMPTY_SHARING,
    );
  };

  const toggleTasks = (checked: boolean) => {
    void saveSharing({
      ...sharing,
      share_goals: checked ? true : sharing.share_goals,
      share_tasks: checked,
    });
  };

  const toggleReviews = (checked: boolean) => {
    void saveSharing({
      ...sharing,
      share_goals: checked ? true : sharing.share_goals,
      share_weekly_reviews: checked,
    });
  };

  const toggleMonthlyCheckins = (checked: boolean) => {
    void saveSharing({
      ...sharing,
      share_goals: checked ? true : sharing.share_goals,
      share_monthly_checkins: checked,
    });
  };

  if (loading) {
    return (
      <Card className="mb-8">
        <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading accountability sharing…
        </CardContent>
      </Card>
    );
  }

  if (!available) {
    return (
      <Card className="mb-8 border-primary/15">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Accountability sharing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Accountability sharing is not active in this workspace yet. Your goals and planner remain private and fully usable; these controls will become available after the database update is applied.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8 border-primary/15">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Accountability sharing
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              You decide what your assigned accountability mentor can see. Sharing is off by default.
            </p>
          </div>
          {groupName && <Badge variant="outline">{groupName}</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {!hasMentor ? (
          <div className="rounded-xl border border-dashed p-5">
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">No accountability mentor is assigned yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your goals and execution data remain private. Sharing controls become active when your accountability group has a mentor.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-muted/15 p-4">
              <p className="text-sm">
                Sharing with <span className="font-semibold">{mentorName || "your assigned mentor"}</span>.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your mentor receives read-only access. They cannot edit your goals, tasks, reviews, capacity, or calendar.
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
                <Checkbox
                  checked={sharing.share_goals}
                  disabled={saving}
                  onCheckedChange={(checked) => toggleGoals(checked === true)}
                />
                <div>
                  <p className="font-medium">Share goals and milestones</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Goal titles, descriptions, dates, confirmed effort and milestones.
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
                <Checkbox
                  checked={sharing.share_tasks}
                  disabled={saving}
                  onCheckedChange={(checked) => toggleTasks(checked === true)}
                />
                <div>
                  <p className="font-medium">Share weekly actions and task execution</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lets your mentor see the execution work you scheduled and its completion state. Enabling this also enables goal context.
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
                <Checkbox
                  checked={sharing.share_weekly_reviews}
                  disabled={saving}
                  onCheckedChange={(checked) => toggleReviews(checked === true)}
                />
                <div>
                  <p className="font-medium">Share weekly execution reviews</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Includes saved execution totals plus the wins, blockers and adjustments you wrote. Enabling this also enables goal context.
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
                <Checkbox
                  checked={sharing.share_monthly_checkins}
                  disabled={saving}
                  onCheckedChange={(checked) => toggleMonthlyCheckins(checked === true)}
                />
                <div>
                  <p className="font-medium">Share monthly accountability check-ins</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Includes the monthly execution snapshot plus the wins, blockers, adjustments and next-month focus you chose to save. Enabling this also enables goal context.
                  </p>
                </div>
              </label>
            </div>
          </>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Weekly capacity settings, temporary capacity periods, fixed commitments such as sleep/classes/work, and private calendar blocks are not included in mentor sharing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
