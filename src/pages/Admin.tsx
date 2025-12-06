import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Target, Search, Mail, Calendar, Shield, UserCog, UsersRound, Trash2, Plus, CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
  group_id: string | null;
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

interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'user' | 'mentor';
}

interface AccountabilityGroup {
  id: string;
  name: string;
  mentor_id: string | null;
  created_at: string;
  members?: Profile[];
}

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [goals, setGoals] = useState<GoalAnalysis[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [groups, setGroups] = useState<AccountabilityGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredUsers, setFilteredUsers] = useState<Profile[]>([]);
  const [filteredGoals, setFilteredGoals] = useState<GoalAnalysis[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);
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

      // Load all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;
      setUserRoles(rolesData || []);

      // Load all accountability groups
      const { data: groupsData, error: groupsError } = await supabase
        .from("accountability_groups")
        .select("*")
        .order("created_at", { ascending: false });

      if (groupsError) throw groupsError;

      // Add members to each group
      const groupsWithMembers = (groupsData || []).map((group) => ({
        ...group,
        members: (profilesData || []).filter((p) => p.group_id === group.id),
      }));

      setGroups(groupsWithMembers);

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

  const getUserRole = (userId: string): 'admin' | 'user' | 'mentor' | null => {
    const role = userRoles.find((r) => r.user_id === userId);
    return role?.role || null;
  };

  const assignMentorRole = async (userId: string) => {
    try {
      // Check if user already has a role
      const existingRole = userRoles.find((r) => r.user_id === userId);
      
      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from("user_roles")
          .update({ role: 'mentor' })
          .eq("user_id", userId);
        
        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: 'mentor' });
        
        if (error) throw error;
      }

      toast({
        title: "Role assigned",
        description: "User has been assigned the mentor role.",
      });

      loadAdminData();
    } catch (error: any) {
      toast({
        title: "Error assigning role",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removeMentorRole = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "mentor");

      if (error) throw error;

      toast({
        title: "Role removed",
        description: "Mentor role has been removed from user.",
      });

      loadAdminData();
    } catch (error: any) {
      toast({
        title: "Error removing role",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const assignMentorToGroup = async (groupId: string, mentorId: string | null) => {
    try {
      const { error } = await supabase
        .from("accountability_groups")
        .update({ mentor_id: mentorId })
        .eq("id", groupId);

      if (error) throw error;

      toast({
        title: "Group updated",
        description: mentorId ? "Mentor assigned to group." : "Mentor removed from group.",
      });

      loadAdminData();
    } catch (error: any) {
      toast({
        title: "Error updating group",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteGroup = async (groupId: string) => {
    try {
      // First remove group_id from all members
      const { error: membersError } = await supabase
        .from("profiles")
        .update({ group_id: null })
        .eq("group_id", groupId);

      if (membersError) throw membersError;

      // Then delete the group
      const { error } = await supabase
        .from("accountability_groups")
        .delete()
        .eq("id", groupId);

      if (error) throw error;

      toast({
        title: "Group deleted",
        description: "Accountability group has been deleted.",
      });

      loadAdminData();
    } catch (error: any) {
      toast({
        title: "Error deleting group",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getMentors = () => {
    return users.filter((u) => getUserRole(u.id) === 'mentor');
  };

  const getMentorName = (mentorId: string | null) => {
    if (!mentorId) return "Unassigned";
    const mentor = users.find((u) => u.id === mentorId);
    return mentor ? `${mentor.first_name} ${mentor.last_name}` : "Unknown";
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a group name.",
        variant: "destructive",
      });
      return;
    }

    setCreatingGroup(true);
    try {
      const { error } = await supabase
        .from("accountability_groups")
        .insert({ name: newGroupName.trim() });

      if (error) throw error;

      toast({
        title: "Group created",
        description: `"${newGroupName}" has been created.`,
      });

      setNewGroupName("");
      loadAdminData();
    } catch (error: any) {
      toast({
        title: "Error creating group",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  const moveUserToGroup = async (userId: string, groupId: string | null) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ group_id: groupId })
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: "User moved",
        description: groupId ? "User has been moved to the new group." : "User has been removed from group.",
      });

      loadAdminData();
    } catch (error: any) {
      toast({
        title: "Error moving user",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getGroupName = (groupId: string | null) => {
    if (!groupId) return "No Group";
    const group = groups.find((g) => g.id === groupId);
    return group?.name || "Unknown";
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const bulkAssignToGroup = async (groupId: string | null) => {
    if (selectedUsers.size === 0) {
      toast({
        title: "No users selected",
        description: "Please select at least one user to assign.",
        variant: "destructive",
      });
      return;
    }

    setBulkAssigning(true);
    try {
      const userIds = Array.from(selectedUsers);
      
      for (const userId of userIds) {
        const { error } = await supabase
          .from("profiles")
          .update({ group_id: groupId })
          .eq("id", userId);

        if (error) throw error;
      }

      toast({
        title: "Users assigned",
        description: `${userIds.length} user(s) have been ${groupId ? "assigned to the group" : "removed from groups"}.`,
      });

      setSelectedUsers(new Set());
      loadAdminData();
    } catch (error: any) {
      toast({
        title: "Error assigning users",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBulkAssigning(false);
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
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users ({filteredUsers.length})
            </TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Goals ({filteredGoals.length})
            </TabsTrigger>
            <TabsTrigger value="mentors" className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              Mentors
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex items-center gap-2">
              <UsersRound className="h-4 w-4" />
              Groups ({groups.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle>All Users</CardTitle>
                  {selectedUsers.size > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <CheckSquare className="h-3 w-3" />
                        {selectedUsers.size} selected
                      </Badge>
                      <Select
                        onValueChange={(value) => bulkAssignToGroup(value === "none" ? null : value)}
                        disabled={bulkAssigning}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Assign to group..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Remove from group</SelectItem>
                          {groups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {bulkAssigning && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <Checkbox
                            checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Goals</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => {
                        const userGoalsCount = goals.filter(g => g.user_id === user.id).length;
                        const isSelected = selectedUsers.has(user.id);
                        return (
                          <TableRow key={user.id} className={isSelected ? "bg-muted/50" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleUserSelection(user.id)}
                                aria-label={`Select ${user.first_name} ${user.last_name}`}
                              />
                            </TableCell>
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
                              <Select
                                value={user.group_id || "none"}
                                onValueChange={(value) => 
                                  moveUserToGroup(user.id, value === "none" ? null : value)
                                }
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue placeholder="Select group" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No Group</SelectItem>
                                  {groups.map((group) => (
                                    <SelectItem key={group.id} value={group.id}>
                                      {group.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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

          {/* Mentors Tab */}
          <TabsContent value="mentors">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Manage Mentor Roles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Current Role</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => {
                        const role = getUserRole(user.id);
                        const isMentor = role === 'mentor';
                        const isAdmin = role === 'admin';
                        
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
                              {isAdmin ? (
                                <Badge className="bg-primary text-primary-foreground">Admin</Badge>
                              ) : isMentor ? (
                                <Badge className="bg-secondary text-secondary-foreground">Mentor</Badge>
                              ) : (
                                <Badge variant="outline">User</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {!isAdmin && (
                                isMentor ? (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => removeMentorRole(user.id)}
                                  >
                                    Remove Mentor
                                  </Button>
                                ) : (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => assignMentorRole(user.id)}
                                  >
                                    Make Mentor
                                  </Button>
                                )
                              )}
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

          <TabsContent value="groups">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle>Manage Accountability Groups</CardTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder="New group name..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-[200px]"
                      onKeyDown={(e) => e.key === 'Enter' && createGroup()}
                    />
                    <Button onClick={createGroup} disabled={creatingGroup} size="sm">
                      {creatingGroup ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      <span className="ml-1">Create</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {groups.map((group) => (
                    <Card key={group.id} className="bg-muted/30 border-border">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{group.name}</CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {group.members?.length || 0} members
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteGroup(group.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-medium">Assigned Mentor:</span>
                          <Select
                            value={group.mentor_id || "unassigned"}
                            onValueChange={(value) => 
                              assignMentorToGroup(group.id, value === "unassigned" ? null : value)
                            }
                          >
                            <SelectTrigger className="w-[250px]">
                              <SelectValue placeholder="Select a mentor" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {getMentors().map((mentor) => (
                                <SelectItem key={mentor.id} value={mentor.id}>
                                  {mentor.first_name} {mentor.last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {group.members && group.members.length > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-2">Members:</p>
                            <div className="flex flex-wrap gap-2">
                              {group.members.map((member) => (
                                <Badge key={member.id} variant="outline" className="bg-background">
                                  {member.first_name} {member.last_name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  {groups.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No accountability groups created yet.
                    </div>
                  )}
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
