import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, UserPlus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  group_id: string | null;
}

interface Group {
  id: string;
  name: string;
  mentor_id: string | null;
  mentor_profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  members: Profile[];
  member_count: number;
}

const Groups = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [availableMentors, setAvailableMentors] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadGroups();
    loadAvailableMentors();
  }, []);

  const loadGroups = async () => {
    setIsLoading(true);
    try {
      // Fetch all groups
      const { data: groupsData, error: groupsError } = await supabase
        .from("accountability_groups")
        .select("*")
        .order("name");

      if (groupsError) throw groupsError;

      // Fetch all profiles with group assignments
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*");

      if (profilesError) throw profilesError;

      // Organize data
      const groupsWithMembers = (groupsData || []).map((group) => {
        const members = (profilesData || []).filter(
          (p) => p.group_id === group.id && p.id !== group.mentor_id
        );
        const mentorProfile = (profilesData || []).find(
          (p) => p.id === group.mentor_id
        );

        return {
          ...group,
          mentor_profile: mentorProfile,
          members,
          member_count: members.length,
        };
      });

      setGroups(groupsWithMembers);
    } catch (error: any) {
      console.error("Error loading groups:", error);
      toast({
        title: "Error loading groups",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableMentors = async () => {
    try {
      // Get users with mentor role
      const { data: mentorRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "mentor");

      if (rolesError) throw rolesError;

      if (mentorRoles && mentorRoles.length > 0) {
        const mentorIds = mentorRoles.map((r) => r.user_id);

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("*")
          .in("id", mentorIds);

        if (profilesError) throw profilesError;

        setAvailableMentors(profiles || []);
      }
    } catch (error: any) {
      console.error("Error loading mentors:", error);
    }
  };

  const assignMentor = async (groupId: string, mentorId: string) => {
    try {
      const { error } = await supabase
        .from("accountability_groups")
        .update({ mentor_id: mentorId })
        .eq("id", groupId);

      if (error) throw error;

      // Also update the mentor's group_id in profiles
      await supabase
        .from("profiles")
        .update({ group_id: groupId })
        .eq("id", mentorId);

      toast({
        title: "Mentor assigned",
        description: "The mentor has been assigned to the group.",
      });

      loadGroups();
    } catch (error: any) {
      console.error("Error assigning mentor:", error);
      toast({
        title: "Error assigning mentor",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 pb-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Accountability Groups
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Manage accountability groups, assign mentors, and track member engagement.
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Total Groups</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-primary">{groups.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Total Members</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-secondary">
                {groups.reduce((sum, g) => sum + g.member_count, 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Available Mentors</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-accent">
                {availableMentors.length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Groups List */}
        <div className="space-y-6">
          {groups.map((group) => (
            <Card key={group.id} className="overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Users className="h-6 w-6 text-primary" />
                    {group.name}
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">
                    {group.member_count} / 5 members
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {/* Mentor Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-accent" />
                    Mentor
                  </h3>
                  {group.mentor_profile ? (
                    <div className="bg-accent/10 rounded-lg p-4 border border-accent/30">
                      <p className="font-medium">
                        {group.mentor_profile.first_name}{" "}
                        {group.mentor_profile.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {group.mentor_profile.email}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <Select
                        onValueChange={(mentorId) =>
                          assignMentor(group.id, mentorId)
                        }
                      >
                        <SelectTrigger className="w-full max-w-md">
                          <SelectValue placeholder="Assign a mentor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMentors.map((mentor) => (
                            <SelectItem key={mentor.id} value={mentor.id}>
                              {mentor.first_name} {mentor.last_name} (
                              {mentor.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Members Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Members</h3>
                  {group.members.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.members.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell>
                              {member.first_name} {member.last_name}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {member.email}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-muted-foreground text-center py-6">
                      No members assigned yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {groups.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No accountability groups yet. Groups will be created automatically
                  when users submit their goals.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Groups;