import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  Target, 
  TrendingUp, 
  MessageSquare, 
  Loader2, 
  Calendar,
  CheckCircle2,
  Clock,
  Award
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

const MentorDashboard = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isMentor, setIsMentor] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{ id: string; name: string } | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [memberGoals, setMemberGoals] = useState<MemberGoals[]>([]);
  const [mentorshipRequests, setMentorshipRequests] = useState<MentorshipRequest[]>([]);
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

        // Get goals for each member
        const memberIds = profiles.map(p => p.id);
        const { data: goals } = await supabase
          .from('goal_analyses')
          .select('user_id, original_goals, refined_goals, created_at')
          .in('user_id', memberIds)
          .order('created_at', { ascending: false });

        if (goals) {
          setMemberGoals(goals);
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
            Track your mentees' progress and support their goal achievement journey.
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
                  <p className="text-sm text-muted-foreground">Goals Submitted</p>
                  <p className="text-2xl font-bold">{memberGoals.length}</p>
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
                  <p className="text-sm text-muted-foreground">Refined Goals</p>
                  <p className="text-2xl font-bold">{memberGoals.filter(g => g.refined_goals).length}</p>
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
                  <p className="text-sm text-muted-foreground">Pending Requests</p>
                  <p className="text-2xl font-bold">{mentorshipRequests.filter(r => r.status === 'pending').length}</p>
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