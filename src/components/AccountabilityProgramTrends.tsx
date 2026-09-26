import { useEffect, useState } from "react";
import { format, startOfWeek } from "date-fns";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface GroupTrend {
  groupId: string;
  groupName: string;
  memberCount: number;
  membersWithActiveGoals: number;
  membersReviewedThisWeek: number;
  plannedMinutesThisWeek: number;
  completedMinutesThisWeek: number;
  overdueMilestones: number;
  membersSharingWithMentor: number;
}

interface ProgramTrends {
  weekStart: string;
  weekEnd: string;
  participants: number;
  participantsAssignedToGroups: number;
  participantsWithActiveGoals: number;
  activeGoals: number;
  participantsReviewedThisWeek: number;
  weeklyReviews: number;
  plannedMinutesThisWeek: number;
  completedMinutesThisWeek: number;
  overdueMilestones: number;
  participantsSharingWithMentor: number;
  groups: GroupTrend[];
}

const completionPercent = (completed: number, planned: number) =>
  planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 0;

const hoursLabel = (minutes: number) => {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
};

const isRpcPending = (code?: string) =>
  code === "PGRST202" || code === "42883";

export function AccountabilityProgramTrends() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [trends, setTrends] = useState<ProgramTrends | null>(null);

  const load = async () => {
    setLoading(true);
    const weekStart = format(
      startOfWeek(new Date(), { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );

    const { data, error } = await supabase.rpc(
      "get_accountability_program_trends",
      { p_week_start: weekStart },
    );

    if (error) {
      if (isRpcPending(error.code)) {
        setAvailable(false);
        setLoading(false);
        return;
      }

      toast({
        title: "Program trends could not load",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    setAvailable(true);
    setTrends(data as unknown as ProgramTrends);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!available) {
    return (
      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Accountability program trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Aggregate execution trends are prepared but the database update is still pending. No participant-level planning details are exposed by this dashboard.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!trends) return null;

  const portfolioCompletion = completionPercent(
    trends.completedMinutesThisWeek,
    trends.plannedMinutesThisWeek,
  );

  return (
    <div className="space-y-6">
      <Card className="border-primary/15">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Accountability program trends
              </CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Aggregate execution signals for the week of {trends.weekStart}. This view intentionally excludes task titles, private calendar blocks, coaching context, vision text and capacity details.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Participants</p>
              <p className="mt-1 text-2xl font-bold">{trends.participants}</p>
              <p className="text-xs text-muted-foreground">
                {trends.participantsAssignedToGroups} assigned to accountability groups
              </p>
            </div>

            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Active goal portfolios</p>
              <p className="mt-1 text-2xl font-bold">{trends.participantsWithActiveGoals}</p>
              <p className="text-xs text-muted-foreground">
                {trends.activeGoals} draft/active goals represented
              </p>
            </div>

            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Reviewed this week</p>
              <p className="mt-1 text-2xl font-bold">{trends.participantsReviewedThisWeek}</p>
              <p className="text-xs text-muted-foreground">
                {trends.weeklyReviews} saved weekly reviews
              </p>
            </div>

            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Sharing with mentors</p>
              <p className="mt-1 text-2xl font-bold">{trends.participantsSharingWithMentor}</p>
              <p className="text-xs text-muted-foreground">
                participants who opted to share goal context
              </p>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-semibold">Represented execution this week</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hoursLabel(trends.completedMinutesThisWeek)} completed of {hoursLabel(trends.plannedMinutesThisWeek)} represented in saved weekly reviews.
                </p>
              </div>
              <Badge variant="outline">{portfolioCompletion}% represented completion</Badge>
            </div>
            <Progress value={portfolioCompletion} className="mt-3" />
          </div>

          {trends.overdueMilestones > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="font-medium">
                  {trends.overdueMilestones} overdue incomplete {trends.overdueMilestones === 1 ? "milestone" : "milestones"} across active portfolios
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This is an aggregate deadline signal only. It does not identify which participant or goal should receive priority.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            Group-level signals
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Compare participation and review coverage without exposing members' detailed plans.
          </p>
        </CardHeader>

        <CardContent>
          {trends.groups.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No accountability groups exist yet.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {trends.groups.map((group) => {
                const reviewCoverage = group.memberCount
                  ? Math.round((group.membersReviewedThisWeek / group.memberCount) * 100)
                  : 0;
                const executionPercent = completionPercent(
                  group.completedMinutesThisWeek,
                  group.plannedMinutesThisWeek,
                );

                return (
                  <div key={group.groupId} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{group.groupName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {group.memberCount} members · {group.membersWithActiveGoals} with active goals
                        </p>
                      </div>
                      {group.membersSharingWithMentor > 0 ? (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          {group.membersSharingWithMentor} sharing
                        </Badge>
                      ) : (
                        <Badge variant="outline">No goal sharing yet</Badge>
                      )}
                    </div>

                    <div className="mt-4 space-y-3">
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>Weekly review coverage</span>
                          <span>{group.membersReviewedThisWeek}/{group.memberCount} · {reviewCoverage}%</span>
                        </div>
                        <Progress value={reviewCoverage} />
                      </div>

                      <div>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>Represented execution</span>
                          <span>{hoursLabel(group.completedMinutesThisWeek)} / {hoursLabel(group.plannedMinutesThisWeek)}</span>
                        </div>
                        <Progress value={executionPercent} />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {group.overdueMilestones > 0 ? (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-700">
                          {group.overdueMilestones} overdue milestones
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          No overdue milestone signal
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
