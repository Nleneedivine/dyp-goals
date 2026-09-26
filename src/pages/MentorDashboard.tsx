import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  Target, 
  MessageSquare, 
  Loader2, 
  Calendar,
  CheckCircle2,
  Clock,
  Award,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface GroupMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface MemberGoals {
  user_id: string;
  original_goals: string;
  refined_goals: string | null;
  created_at: string;
}

interface MentorshipRequest {
  id: string;
  user_id: string;
  goals: string;
  areas: string;
  experience: string;
  status: string;
  created_at: string;
}
interface SharedPortfolioGoal {
  id: string;
  user_id: string;
  title: string;
  life_area: string;
  priority: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  estimated_hours_per_week: number;
}

interface SharedMilestone {
  id: string;
  goal_id: string;
  title: string;
  due_date: string | null;
  status: string;
}

interface SharedGoalTask {
  id: string;
  user_id: string;
  goal_id: string;
  title: string;
  scheduled_date: string | null;
  estimated_minutes: number;
  status: string;
}

interface SharedWeeklyReview {
  id: string;
  user_id: string;
  week_start: string;
  planned_tasks: number;
  completed_tasks: number;
  planned_minutes: number;
  completed_minutes: number;
  wins: string;
  blockers: string;
  adjustments: string;
}

interface SharingPreference {
  user_id: string;
  share_goals: boolean;
  share_tasks: boolean;
  share_weekly_reviews: boolean;
  share_monthly_checkins: boolean;
}

interface SharedMonthlyCheckin {
  id: string;
  user_id: string;
  month_start: string;
  planned_tasks: number;
  completed_tasks: number;
  planned_minutes: number;
  completed_minutes: number;
  milestones_due: number;
  milestones_completed: number;
  wins: string;
  blockers: string;
  adjustments: string;
  next_month_focus: string;
}

const MentorDashboard = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isMentor, setIsMentor] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{ id: string; name: string } | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [memberGoals, setMemberGoals] = useState<MemberGoals[]>([]);
  const [mentorshipRequests, setMentorshipRequests] = useState<MentorshipRequest[]>([]);
  const [sharedPortfolioGoals, setSharedPortfolioGoals] = useState<SharedPortfolioGoal[]>([]);
  const [sharedGoalTasks, setSharedGoalTasks] = useState<SharedGoalTask[]>([]);
  const [sharedMilestones, setSharedMilestones] = useState<SharedMilestone[]>([]);
  const [sharedWeeklyReviews, setSharedWeeklyReviews] = useState<SharedWeeklyReview[]>([]);
  const [sharedMonthlyCheckins, setSharedMonthlyCheckins] = useState<SharedMonthlyCheckin[]>([]);
  const [sharingPreferences, setSharingPreferences] = useState<SharingPreference[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    checkMentorStatus();
  }, []);

  const checkMentorStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Check if user is a mentor
      const { data: hasMentorRole } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'mentor'
      });

      if (!hasMentorRole) {
        toast({
          title: "Access Denied",
          description: "This page is only accessible to mentors.",
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      setIsMentor(true);

      // Get mentor's group
      const { data: group } = await supabase
        .from('accountability_groups')
        .select('id, name')
        .eq('mentor_id', user.id)
        .maybeSingle();

      if (group) {
        setGroupInfo(group);
        await loadGroupData(group.id);
      }

      // Load mentorship requests (mentors can view all) - using any to bypass type check
      const { data: requests } = await (supabase as any)
        .from('mentorship_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (requests) {
        setMentorshipRequests(requests as MentorshipRequest[]);
      }
    } catch (error) {
      console.error('Error checking mentor status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadGroupData = async (groupId: string) => {
    try {
      // Get group members
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('group_id', groupId);

      if (profiles) {
        setGroupMembers(profiles);

        const memberIds = profiles.map(p => p.id);
        if (!memberIds.length) {
          setMemberGoals([]);
          setSharedPortfolioGoals([]);
          setSharedGoalTasks([]);
          setSharedMilestones([]);
          setSharedWeeklyReviews([]);
          setSharedMonthlyCheckins([]);
          setSharingPreferences([]);
          return;
        }

        const [
          legacyGoalsResult,
          portfolioGoalsResult,
          tasksResult,
          reviewsResult,
          monthlyCheckinsResult,
          sharingResult,
        ] = await Promise.all([
          supabase
            .from('goal_analyses')
            .select('user_id, original_goals, refined_goals, created_at')
            .in('user_id', memberIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('goals')
            .select('id, user_id, title, life_area, priority, status, start_date, end_date, estimated_hours_per_week')
            .in('user_id', memberIds)
            .neq('status', 'archived')
            .order('updated_at', { ascending: false }),
          supabase
            .from('goal_tasks')
            .select('id, user_id, goal_id, title, scheduled_date, estimated_minutes, status')
            .in('user_id', memberIds)
            .order('scheduled_date', { ascending: false, nullsFirst: false })
            .limit(300),
          supabase
            .from('goal_weekly_reviews')
            .select('id, user_id, week_start, planned_tasks, completed_tasks, planned_minutes, completed_minutes, wins, blockers, adjustments')
            .in('user_id', memberIds)
            .order('week_start', { ascending: false })
            .limit(40),
          supabase
            .from('goal_monthly_checkins')
            .select('id, user_id, month_start, planned_tasks, completed_tasks, planned_minutes, completed_minutes, milestones_due, milestones_completed, wins, blockers, adjustments, next_month_focus')
            .in('user_id', memberIds)
            .order('month_start', { ascending: false })
            .limit(40),
          supabase
            .from('accountability_sharing_preferences')
            .select('user_id, share_goals, share_tasks, share_weekly_reviews, share_monthly_checkins')
            .in('user_id', memberIds),
        ]);

        if (legacyGoalsResult.data) setMemberGoals(legacyGoalsResult.data);
        const portfolioGoals = (portfolioGoalsResult.data ?? []) as SharedPortfolioGoal[];
        setSharedPortfolioGoals(portfolioGoals);
        if (tasksResult.data) setSharedGoalTasks(tasksResult.data as SharedGoalTask[]);
        if (reviewsResult.data) setSharedWeeklyReviews(reviewsResult.data as SharedWeeklyReview[]);
        if (monthlyCheckinsResult.data) setSharedMonthlyCheckins(monthlyCheckinsResult.data as SharedMonthlyCheckin[]);
        if (sharingResult.data) setSharingPreferences(sharingResult.data as SharingPreference[]);

        if (portfolioGoals.length) {
          const { data: milestoneData, error: milestoneError } = await supabase
            .from('goal_milestones')
            .select('id, goal_id, title, due_date, status')
            .in('goal_id', portfolioGoals.map((goal) => goal.id))
            .order('due_date', { ascending: true, nullsFirst: false });

          if (milestoneError) {
            console.error('Error loading shared milestones:', milestoneError);
          } else {
            setSharedMilestones((milestoneData ?? []) as SharedMilestone[]);
          }
        } else {
          setSharedMilestones([]);
        }

        const sharingError =
          portfolioGoalsResult.error ||
          tasksResult.error ||
          reviewsResult.error ||
          monthlyCheckinsResult.error ||
          sharingResult.error;

        if (sharingError) {
          console.error('Error loading shared execution data:', sharingError);
        }
      }
    } catch (error) {
      console.error('Error loading group data:', error);
    }
  };

  const getMemberGoals = (userId: string) => {
    return memberGoals.filter(g => g.user_id === userId);
  };

  const getMemberRequest = (userId: string) => {
    return mentorshipRequests.find(r => r.user_id === userId);
  };
  const getSharingPreference = (userId: string) =>
    sharingPreferences.find((preference) => preference.user_id === userId) ?? null;

  const getSharedPortfolioGoals = (userId: string) =>
    sharedPortfolioGoals.filter((goal) => goal.user_id === userId);

  const getSharedTasks = (userId: string) =>
    sharedGoalTasks.filter((task) => task.user_id === userId);

  const getSharedMilestones = (userId: string) => {
    const goalIds = new Set(getSharedPortfolioGoals(userId).map((goal) => goal.id));
    return sharedMilestones.filter((milestone) => goalIds.has(milestone.goal_id));
  };

  const getLatestSharedReview = (userId: string) =>
    sharedWeeklyReviews
      .filter((review) => review.user_id === userId)
      .sort((a, b) => b.week_start.localeCompare(a.week_start))[0] ?? null;

  const getLatestSharedMonthlyCheckin = (userId: string) =>
    sharedMonthlyCheckins
      .filter((checkin) => checkin.user_id === userId)
      .sort((a, b) => b.month_start.localeCompare(a.month_start))[0] ?? null;

  const today = format(new Date(), "yyyy-MM-dd");
  const currentWeekStart = format(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );
  const currentWeekEnd = format(
    endOfWeek(new Date(), { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );

  const optedInMembers = sharingPreferences.filter(
    (preference) => preference.share_goals,
  ).length;
  const activeSharedGoals = sharedPortfolioGoals.filter(
    (goal) => goal.status === "draft" || goal.status === "active",
  ).length;
  const sharedReviewsThisWeek = sharedWeeklyReviews.filter(
    (review) => review.week_start === currentWeekStart,
  ).length;

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 pb-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isMentor) {
    return null;
  }

  return (
    <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Mentor <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Dashboard</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Review only the goal and execution context each member explicitly chose to share, then support their next accountability conversation.
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 max-w-6xl mx-auto">
          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Group Members</p>
                  <p className="text-2xl font-bold">{groupMembers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-secondary to-accent rounded-full flex items-center justify-center">
                  <Target className="h-6 w-6 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sharing execution</p>
                  <p className="text-2xl font-bold">{optedInMembers}/{groupMembers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent to-primary rounded-full flex items-center justify-center">
                  <Award className="h-6 w-6 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Shared active goals</p>
                  <p className="text-2xl font-bold">{activeSharedGoals}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reviews this week</p>
                  <p className="text-2xl font-bold">{sharedReviewsThisWeek}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Group Info */}
        {groupInfo && (
          <Card className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 border-0 mb-8 max-w-6xl mx-auto">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{groupInfo.name}</h2>
                  <p className="text-muted-foreground">Your accountability group</p>
                </div>
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  {groupMembers.length}/5 Members
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <Tabs defaultValue="members" className="max-w-6xl mx-auto">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="members">Group Members</TabsTrigger>
            <TabsTrigger value="requests">Mentorship Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            {groupMembers.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="p-12 text-center">
                  <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">No Members Yet</h3>
                  <p className="text-muted-foreground">
                    Members will appear here once they join your accountability group.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {groupMembers.map((member) => {
                  const goals = getMemberGoals(member.id);
                  const request = getMemberRequest(member.id);
                  const sharing = getSharingPreference(member.id);
                  const portfolioGoals = getSharedPortfolioGoals(member.id);
                  const sharedTasks = getSharedTasks(member.id);
                  const memberMilestones = getSharedMilestones(member.id);
                  const latestReview = getLatestSharedReview(member.id);
                  const latestMonthlyCheckin = getLatestSharedMonthlyCheckin(member.id);
                  const activeSharedTasks = sharedTasks.filter(
                    (task) => task.status === 'planned' || task.status === 'completed',
                  );
                  const completedSharedTasks = activeSharedTasks.filter(
                    (task) => task.status === 'completed',
                  );
                  const currentWeekTasks = activeSharedTasks.filter(
                    (task) =>
                      task.scheduled_date &&
                      task.scheduled_date >= currentWeekStart &&
                      task.scheduled_date <= currentWeekEnd,
                  );
                  const currentWeekCompletedTasks = currentWeekTasks.filter(
                    (task) => task.status === 'completed',
                  );
                  const overdueSharedMilestones = memberMilestones.filter(
                    (milestone) =>
                      milestone.status !== 'completed' &&
                      Boolean(milestone.due_date && milestone.due_date < today),
                  );
                  const nextSharedMilestone =
                    memberMilestones
                      .filter(
                        (milestone) =>
                          milestone.status !== 'completed' &&
                          Boolean(milestone.due_date && milestone.due_date >= today),
                      )
                      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0] ?? null;
                  
                  return (
                    <Card key={member.id} className="bg-card border-border">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xl">
                            {member.first_name} {member.last_name}
                          </CardTitle>
                          <Badge variant={goals.some(g => g.refined_goals) ? "default" : "secondary"}>
                            {goals.some(g => g.refined_goals) ? "Goals Refined" : "In Progress"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {request && (
                          <div className="bg-muted/30 rounded-lg p-4">
                            <h4 className="font-semibold text-sm text-primary mb-2">Mentorship Areas</h4>
                            <p className="text-sm text-muted-foreground">{request.areas}</p>
                          </div>
                        )}

                        {goals.length > 0 ? (
                          <div>
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                              <Target className="h-4 w-4 text-secondary" />
                              Latest Goals
                            </h4>
                            <div className="bg-muted/20 rounded-lg p-3">
                              <p className="text-sm text-foreground whitespace-pre-line line-clamp-4">
                                {goals[0].original_goals}
                              </p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {new Date(goals[0].created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span className="text-sm">No goals submitted yet</span>
                          </div>
                        )}

                        <div className="rounded-xl border p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {sharing?.share_goals ? (
                                <ShieldCheck className="h-4 w-4 text-primary" />
                              ) : (
                                <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                              )}
                              <h4 className="text-sm font-semibold">Shared execution</h4>
                            </div>
                            <Badge variant={sharing?.share_goals ? "secondary" : "outline"}>
                              {sharing?.share_goals ? "Opted in" : "Private"}
                            </Badge>
                          </div>

                          {!sharing?.share_goals ? (
                            <p className="text-xs text-muted-foreground">
                              This member has not shared their execution portfolio with you.
                            </p>
                          ) : (
                            <div className="space-y-3 text-sm">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg bg-muted/20 p-3">
                                  <p className="text-xs text-muted-foreground">Shared goals</p>
                                  <p className="mt-1 text-xl font-bold">{portfolioGoals.length}</p>
                                </div>
                                <div className="rounded-lg bg-muted/20 p-3">
                                  <p className="text-xs text-muted-foreground">Weekly effort</p>
                                  <p className="mt-1 text-xl font-bold">
                                    {portfolioGoals
                                      .filter((goal) => goal.status === 'active' || goal.status === 'draft')
                                      .reduce((sum, goal) => sum + Number(goal.estimated_hours_per_week || 0), 0)
                                      .toFixed(1)}h
                                  </p>
                                </div>
                              </div>

                              {sharing.share_tasks && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="rounded-lg bg-muted/20 p-3">
                                    <p className="text-xs text-muted-foreground">This week</p>
                                    <p className="mt-1 text-lg font-bold">
                                      {currentWeekCompletedTasks.length}/{currentWeekTasks.length}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">visible tasks complete</p>
                                  </div>
                                  <div className="rounded-lg bg-muted/20 p-3">
                                    <p className="text-xs text-muted-foreground">All visible tasks</p>
                                    <p className="mt-1 text-lg font-bold">
                                      {completedSharedTasks.length}/{activeSharedTasks.length}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">complete</p>
                                  </div>
                                </div>
                              )}

                              {overdueSharedMilestones.length > 0 && (
                                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                                  <p className="text-xs font-medium">
                                    {overdueSharedMilestones.length} overdue shared {overdueSharedMilestones.length === 1 ? 'milestone' : 'milestones'}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    This is a deadline signal from the member's shared plan, not a priority judgment.
                                  </p>
                                </div>
                              )}

                              {nextSharedMilestone && (
                                <div className="rounded-lg bg-muted/20 p-3">
                                  <p className="text-xs text-muted-foreground">Next shared milestone</p>
                                  <p className="mt-1 text-xs font-medium">{nextSharedMilestone.title}</p>
                                  <p className="mt-1 text-[11px] text-muted-foreground">{nextSharedMilestone.due_date}</p>
                                </div>
                              )}

                              {sharing.share_weekly_reviews && latestReview && (
                                <div className="rounded-lg bg-muted/20 p-3">
                                  <p className="text-xs font-medium">Latest weekly review · {latestReview.week_start}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {latestReview.completed_tasks}/{latestReview.planned_tasks} tasks · {(latestReview.completed_minutes / 60).toFixed(1)}h/{(latestReview.planned_minutes / 60).toFixed(1)}h represented effort
                                  </p>
                                  {latestReview.wins && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Wins: {latestReview.wins}
                                    </p>
                                  )}
                                  {latestReview.blockers && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Blockers: {latestReview.blockers}
                                    </p>
                                  )}
                                  {latestReview.adjustments && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Member's adjustment: {latestReview.adjustments}
                                    </p>
                                  )}
                                </div>
                              )}

                              {sharing.share_monthly_checkins && latestMonthlyCheckin && (
                                <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                                  <p className="text-xs font-medium">Latest monthly check-in · {latestMonthlyCheckin.month_start}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {latestMonthlyCheckin.completed_tasks}/{latestMonthlyCheckin.planned_tasks} tasks · {(latestMonthlyCheckin.completed_minutes / 60).toFixed(1)}h/{(latestMonthlyCheckin.planned_minutes / 60).toFixed(1)}h represented effort · {latestMonthlyCheckin.milestones_completed}/{latestMonthlyCheckin.milestones_due} milestones
                                  </p>
                                  {latestMonthlyCheckin.wins && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Wins: {latestMonthlyCheckin.wins}
                                    </p>
                                  )}
                                  {latestMonthlyCheckin.blockers && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Blockers: {latestMonthlyCheckin.blockers}
                                    </p>
                                  )}
                                  {latestMonthlyCheckin.adjustments && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Member's adjustment: {latestMonthlyCheckin.adjustments}
                                    </p>
                                  )}
                                  {latestMonthlyCheckin.next_month_focus && (
                                    <p className="mt-2 text-xs font-medium">
                                      Next month focus: {latestMonthlyCheckin.next_month_focus}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {goals.some(g => g.refined_goals) && (
                          <div className="flex items-center gap-2 text-primary">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Has refined action plan</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests">
            {mentorshipRequests.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="p-12 text-center">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">No Requests Yet</h3>
                  <p className="text-muted-foreground">
                    Mentorship requests will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {mentorshipRequests.map((request) => (
                  <Card key={request.id} className="bg-card border-border">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <Badge variant={request.status === 'pending' ? "secondary" : "default"}>
                            {request.status}
                          </Badge>
                          <p className="text-sm text-muted-foreground mt-2">
                            Submitted {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <h4 className="font-semibold text-sm text-primary mb-2">Goals</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-3">
                            {request.goals}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm text-secondary mb-2">Mentorship Areas</h4>
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {request.areas}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm text-accent mb-2">Experience</h4>
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {request.experience}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default MentorDashboard;