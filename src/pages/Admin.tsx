import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Target, Search, Mail, Calendar, Shield } from "lucide-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

interface GoalAnalysis {
  id: string;
  user_id: string | null;
  original_goals: string;
  ai_analysis: any;
  refined_goals: string | null;
  created_at: string;
  profiles?: Profile | null;
}

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [goals, setGoals] = useState<GoalAnalysis[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredUsers, setFilteredUsers] = useState<Profile[]>([]);
  const [filteredGoals, setFilteredGoals] = useState<GoalAnalysis[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchQuery, users]);

  useEffect(() => {
    filterGoals();
  }, [searchQuery, goals]);

  const loadAdminData = async () => {
    try {
      // Load all users
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;
      setUsers(profilesData || []);

      // Load all goals
      const { data: goalsData, error: goalsError } = await supabase
        .from("goal_analyses")
        .select("*")
        .order("created_at", { ascending: false });

      if (goalsError) throw goalsError;

      // Manually join with profiles
      const goalsWithProfiles = await Promise.all(
        (goalsData || []).map(async (goal) => {
          if (goal.user_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", goal.user_id)
              .single();
            return { ...goal, profiles: profile };
          }
          return { ...goal, profiles: null };
        })
      );

      setGoals(goalsWithProfiles);
    } catch (error: any) {
      toast({
        title: "Error loading admin data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = users.filter((user) => {
      const name = `${user.first_name} ${user.last_name}`.toLowerCase();
      const email = user.email.toLowerCase();
      return name.includes(query) || email.includes(query);
    });

    setFilteredUsers(filtered);
  };

  const filterGoals = () => {
    if (!searchQuery.trim()) {
      setFilteredGoals(goals);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = goals.filter((goal) => {
      const originalGoals = goal.original_goals.toLowerCase();
      const refinedGoals = goal.refined_goals?.toLowerCase() || "";
      const userName = goal.profiles 
        ? `${goal.profiles.first_name} ${goal.profiles.last_name}`.toLowerCase()
        : "";
      return originalGoals.includes(query) || refinedGoals.includes(query) || userName.includes(query);
    });

    setFilteredGoals(filtered);
  };

  const getOverallScore = (analysis: any): number => {
    try {
      return analysis?.overallScore || 0;
    } catch {
      return 0;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 pb-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Shield className="h-12 w-12 text-primary" />
            <h1 className="text-5xl md:text-6xl font-bold">
              Admin <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Dashboard</span>
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Monitor all user activity, manage profiles, and oversee goal submissions
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-primary">{users.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-secondary/10 to-accent/10 border-secondary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Total Goals Submitted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-secondary">{goals.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="bg-card border-border mb-8">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search users or goals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background"
              />
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users ({filteredUsers.length})
            </TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Goals ({filteredGoals.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>All Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Goals Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => {
                        const userGoalsCount = goals.filter(g => g.user_id === user.id).length;
                        return (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">
                              {user.first_name} {user.last_name}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                {user.email}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {format(new Date(user.created_at), "MMM d, yyyy")}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{userGoalsCount}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="goals">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>All Goal Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredGoals.map((goal) => (
                    <Card key={goal.id} className="bg-muted/30 border-border">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <CardTitle className="text-lg mb-2">
                              {goal.profiles 
                                ? `${goal.profiles.first_name} ${goal.profiles.last_name}`
                                : "Unknown User"
                              }
                            </CardTitle>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {goal.profiles?.email || "N/A"}
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(goal.created_at), "MMM d, yyyy")}
                              </div>
                              <Badge variant="outline" className="bg-background">
                                Score: {getOverallScore(goal.ai_analysis)}%
                              </Badge>
                              {goal.refined_goals && (
                                <Badge className="bg-accent text-accent-foreground">
                                  Refined
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            <strong>Original Goals:</strong>
                          </p>
                          <p className="text-sm text-foreground line-clamp-3">
                            {goal.original_goals}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
