import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Target, Search, Mail, Calendar, Shield, UserCog, UsersRound, Trash2, Plus, CheckSquare, RefreshCw, Eye, Download, FileText, SlidersHorizontal, Layers3 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountabilityProgramTrends } from "@/components/AccountabilityProgramTrends";
import { GoalsPDFDocument } from "@/components/GoalsPDFDocument";
import { pdf } from "@react-pdf/renderer";
import { Ui2PageHeader } from "@/components/Ui2PageHeader";
import { useUiMode } from "@/components/UiModeProvider";

const getOverallScore = (analysis: any): number => {
  try {
    return analysis?.overallScore || 0;
  } catch {
    return 0;
  }
};

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
  enrollment_id: string | null;
  original_goals: string;
  ai_analysis?: any;
  refined_goals: string | null;
  created_at: string;
  profiles?: Profile | null;
}

interface ProgramCohort {
  id: string;
  slug: string;
  name: string;
  cohort_year: number;
  status: string;
  is_current: boolean;
}

interface ProgramEnrollment {
  id: string;
  cohort_id: string;
  user_id: string | null;
  source_submission_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  registered_at: string;
  activated_at: string | null;
  completed_at: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'user' | 'mentor' | 'accountability_coach';
}

interface AccountabilityGroup {
  id: string;
  cohort_id: string;
  name: string;
  mentor_id: string | null;
  created_at: string;
  members?: ProgramEnrollment[];
}

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [goals, setGoals] = useState<GoalAnalysis[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [groups, setGroups] = useState<AccountabilityGroup[]>([]);
  const [accountabilityMemberships, setAccountabilityMemberships] = useState<Array<{ enrollment_id: string; group_id: string; status: string }>>([]);
  const [cohorts, setCohorts] = useState<ProgramCohort[]>([]);
  const [enrollments, setEnrollments] = useState<ProgramEnrollment[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [syncingChats, setSyncingChats] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<GoalAnalysis | null>(null);
  const [selectedGoalLoading, setSelectedGoalLoading] = useState(false);
  const [exportingGoalId, setExportingGoalId] = useState<string | null>(null);
  const { toast } = useToast();
  const { isUi2, globalMode, refreshGlobalMode } = useUiMode();
  const [savingUiDefault, setSavingUiDefault] = useState(false);

  interface RefinedGoal {
    title: string;
    description: string;
    actionSteps: string[];
    timeline: string;
    successMetrics: string[];
  }

  const getRefinedGoals = (goal: GoalAnalysis): RefinedGoal[] | null => {
    if (!goal.refined_goals) return null;
    try {
      return JSON.parse(goal.refined_goals);
    } catch {
      return null;
    }
  };

  const handleDownloadGoalPDF = async (goal: GoalAnalysis) => {
    const refinedGoals = getRefinedGoals(goal);
    if (!refinedGoals) {
      toast({
        title: "No refined goals",
        description: "This submission doesn't have refined goals to export.",
        variant: "destructive",
      });
      return;
    }

    setExportingGoalId(goal.id);
    try {
      const targetYear = new Date(goal.created_at).getFullYear() + 1;
      const userName = goal.profiles 
        ? `${goal.profiles.first_name} ${goal.profiles.last_name}`
        : "Unknown User";
      const doc = <GoalsPDFDocument goals={refinedGoals} userName={userName} targetYear={targetYear} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DYP-Goals-${userName.replace(/\s+/g, '-')}-${format(new Date(goal.created_at), "yyyy-MM-dd")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "PDF Downloaded!",
        description: `Goals for ${userName} exported successfully.`,
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExportingGoalId(null);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      const [
        profilesResult,
        rolesResult,
        groupsResult,
        goalsResult,
        cohortsResult,
        enrollmentsResult,
        accountabilityMembershipsResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,first_name,last_name,created_at,group_id")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("id,user_id,role"),
        supabase
          .from("accountability_groups")
          .select("id,cohort_id,name,mentor_id,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("goal_analyses")
          .select("id,user_id,enrollment_id,original_goals,refined_goals,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("program_cohorts")
          .select("id,slug,name,cohort_year,status,is_current")
          .order("cohort_year", { ascending: false }),
        supabase
          .from("program_enrollments")
          .select("id,cohort_id,user_id,source_submission_id,email,first_name,last_name,status,registered_at,activated_at,completed_at")
          .order("registered_at", { ascending: false }),
        supabase
          .from("program_accountability_memberships")
          .select("enrollment_id,group_id,status"),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (rolesResult.error) throw rolesResult.error;
      if (groupsResult.error) throw groupsResult.error;
      if (goalsResult.error) throw goalsResult.error;
      if (cohortsResult.error) throw cohortsResult.error;
      if (enrollmentsResult.error) throw enrollmentsResult.error;
      if (accountabilityMembershipsResult.error) throw accountabilityMembershipsResult.error;

      const profilesData = profilesResult.data ?? [];
      const rolesData = rolesResult.data ?? [];
      const groupsData = groupsResult.data ?? [];
      const goalsData = goalsResult.data ?? [];
      const cohortsData = cohortsResult.data ?? [];
      const enrollmentsData = enrollmentsResult.data ?? [];
      const accountabilityMembershipsData = accountabilityMembershipsResult.data ?? [];

      setUsers(profilesData);
      setCohorts(cohortsData);
      setEnrollments(enrollmentsData);
      setAccountabilityMemberships(accountabilityMembershipsData);
      setSelectedCohortId((current) => {
        if (current !== null) return current;
        return cohortsData.find((cohort) => cohort.is_current)?.id ?? "all";
      });
      setUserRoles(rolesData);

      const enrollmentByIdForGroups = new Map(
        enrollmentsData.map((enrollment) => [enrollment.id, enrollment] as const),
      );
      const membersByGroup = new Map<string, ProgramEnrollment[]>();

      accountabilityMembershipsData
        .filter((membership) => membership.status === "active")
        .forEach((membership) => {
          const enrollment = enrollmentByIdForGroups.get(membership.enrollment_id);
          if (!enrollment) return;
          const members = membersByGroup.get(membership.group_id) ?? [];
          members.push(enrollment);
          membersByGroup.set(membership.group_id, members);
        });

      const groupsWithMembers = groupsData.map((group) => ({
        ...group,
        members: membersByGroup.get(group.id) ?? [],
      }));
      setGroups(groupsWithMembers);

      // Reuse the profiles we already loaded instead of making one profile
      // request per goal submission.
      const profileById = new Map(profilesData.map((profile) => [profile.id, profile]));
      setGoals(
        goalsData.map((goal) => ({
          ...goal,
          profiles: goal.user_id ? profileById.get(goal.user_id) ?? null : null,
        }))
      );
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

  const roleByUserId = useMemo(
    () => new Map(userRoles.map((role) => [role.user_id, role.role] as const)),
    [userRoles],
  );

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user] as const)),
    [users],
  );

  const legacyGoalCountByUserId = useMemo(() => {
    const counts = new Map<string, number>();
    goals.forEach((goal) => {
      if (!goal.user_id) return;
      counts.set(goal.user_id, (counts.get(goal.user_id) ?? 0) + 1);
    });
    return counts;
  }, [goals]);

  const openGoalDetails = async (goal: GoalAnalysis) => {
    setSelectedGoalLoading(true);
    const { data, error } = await supabase
      .from("goal_analyses")
      .select("ai_analysis")
      .eq("id", goal.id)
      .single();
    setSelectedGoalLoading(false);

    if (error) {
      toast({
        title: "Goal details could not load",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setSelectedGoal({ ...goal, ai_analysis: data.ai_analysis });
  };

  const getUserRole = (userId: string): 'admin' | 'user' | 'mentor' | 'accountability_coach' | null =>
    roleByUserId.get(userId) ?? null;

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
      // Get the group to find its name and old mentor
      const group = groups.find(g => g.id === groupId);
      if (!group) throw new Error("Group not found");
      
      const oldMentorId = group.mentor_id;

      if (mentorId) {
        const { error: roleError } = await supabase.rpc("admin_set_user_role", {
          p_user_id: mentorId,
          p_role: "accountability_coach",
          p_enabled: true,
        });
        if (roleError) throw roleError;
      }

      // Update accountability group
      const { error } = await supabase
        .from("accountability_groups")
        .update({ mentor_id: mentorId })
        .eq("id", groupId);

      if (error) throw error;

      // Find corresponding chat group
      const { data: chatGroup } = await supabase
        .from("chat_groups")
        .select("id")
        .eq("accountability_group_id", group.id)
        .maybeSingle();

      if (chatGroup) {
        // Remove old mentor from chat group if exists
        if (oldMentorId) {
          await supabase
            .from("chat_group_members")
            .delete()
            .eq("group_id", chatGroup.id)
            .eq("user_id", oldMentorId);
        }

        // Add new mentor as admin to chat group
        if (mentorId) {
          // Check if already a member
          const { data: existingMember } = await supabase
            .from("chat_group_members")
            .select("id")
            .eq("group_id", chatGroup.id)
            .eq("user_id", mentorId)
            .single();

          if (existingMember) {
            // Update role to admin
            await supabase
              .from("chat_group_members")
              .update({ role: 'admin' })
              .eq("group_id", chatGroup.id)
              .eq("user_id", mentorId);
          } else {
            // Insert as admin
            await supabase
              .from("chat_group_members")
              .insert({
                group_id: chatGroup.id,
                user_id: mentorId,
                role: 'admin'
              });
          }
        }
      }

      toast({
        title: "Group updated",
        description: mentorId ? "Accountability Coach assigned to group and chat." : "Accountability Coach removed from group and chat.",
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
      const group = groups.find((item) => item.id === groupId);
      if (!group) throw new Error("Group not found");

      if ((group.members?.length ?? 0) > 0) {
        throw new Error("Move or remove all cohort members before deleting this group.");
      }

      const { data: chatGroup } = await supabase
        .from("chat_groups")
        .select("id")
        .eq("accountability_group_id", groupId)
        .maybeSingle();

      if (chatGroup) {
        await supabase.from("chat_group_members").delete().eq("group_id", chatGroup.id);
        await supabase.from("chat_messages").delete().eq("group_id", chatGroup.id);
        await supabase.from("chat_groups").delete().eq("id", chatGroup.id);
      }

      const { error } = await supabase
        .from("accountability_groups")
        .delete()
        .eq("id", groupId);

      if (error) throw error;

      toast({
        title: "Group deleted",
        description: "The empty cohort accountability group and its chat were deleted.",
      });

      await loadAdminData();
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

  const getAccountabilityCoaches = () => {
    return users.filter((u) =>
      userRoles.some(
        (role) => role.user_id === u.id && role.role === 'accountability_coach',
      ),
    );
  };

  const getMentorName = (mentorId: string | null) => {
    if (!mentorId) return "Unassigned";
    const mentor = userById.get(mentorId);
    return mentor ? `${mentor.first_name} ${mentor.last_name}` : "Unknown";
  };

  const createGroup = async () => {
    if (!selectedCohortId || selectedCohortId === "all") {
      toast({
        title: "Choose a cohort",
        description: "Select a specific GOALS cohort before creating an accountability group.",
        variant: "destructive",
      });
      return;
    }

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: groupData, error } = await supabase
        .from("accountability_groups")
        .insert({ name: newGroupName.trim(), cohort_id: selectedCohortId })
        .select()
        .single();

      if (error) throw error;

      const { data: chatGroupData, error: chatError } = await supabase
        .from("chat_groups")
        .insert({
          name: newGroupName.trim(),
          created_by: user.id,
          description: `Chat for accountability group: ${newGroupName.trim()}`,
          is_channel: false,
          accountability_group_id: groupData.id,
        })
        .select()
        .single();

      if (chatError) throw chatError;

      await supabase.from("chat_group_members").insert({
        group_id: chatGroupData.id,
        user_id: user.id,
        role: "admin",
      });

      toast({
        title: "Group created",
        description: `"${newGroupName}" has been created for ${selectedCohort?.name ?? "the selected cohort"}.`,
      });

      setNewGroupName("");
      await loadAdminData();
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
      if (!selectedCohortId || selectedCohortId === "all") {
        throw new Error("Choose a specific cohort before moving accountability members.");
      }

      const enrollment = enrollments.find(
        (item) => item.cohort_id === selectedCohortId && item.user_id === userId,
      );
      if (!enrollment) {
        throw new Error("This user does not have an enrollment in the selected cohort.");
      }

      const { data, error } = await supabase.rpc("admin_bulk_assign_enrollments_to_group", {
        p_enrollment_ids: [enrollment.id],
        p_group_id: groupId,
      });

      if (error) throw error;

      const result = data as { chatSynced?: boolean } | null;
      toast({
        title: "Participant moved",
        description: groupId
          ? `Participant moved to the accountability group${result?.chatSynced === false ? "." : " and chat membership is synchronized."}`
          : "Participant removed from the selected cohort accountability group.",
      });

      await loadAdminData();
    } catch (error: any) {
      toast({
        title: "Error moving participant",
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

    if (!selectedCohortId || selectedCohortId === "all") {
      toast({
        title: "Choose a cohort",
        description: "Bulk accountability assignment requires a specific cohort.",
        variant: "destructive",
      });
      return;
    }

    setBulkAssigning(true);
    try {
      const userIds = Array.from(selectedUsers);
      const enrollmentIds = enrollments
        .filter(
          (enrollment) =>
            enrollment.cohort_id === selectedCohortId &&
            enrollment.user_id &&
            userIds.includes(enrollment.user_id),
        )
        .map((enrollment) => enrollment.id);

      if (!enrollmentIds.length) {
        throw new Error("None of the selected users has an enrollment in this cohort.");
      }

      const { data, error } = await supabase.rpc("admin_bulk_assign_enrollments_to_group", {
        p_enrollment_ids: enrollmentIds,
        p_group_id: groupId,
      });

      if (error) throw error;

      const result = data as { updatedCount?: number; chatSynced?: boolean } | null;
      toast({
        title: "Participants assigned",
        description: `${result?.updatedCount ?? enrollmentIds.length} cohort participant(s) updated.`,
      });

      setSelectedUsers(new Set());
      await loadAdminData();
    } catch (error: any) {
      toast({
        title: "Error assigning participants",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBulkAssigning(false);
    }
  };

  const syncExistingGroupsToChat = async () => {
    setSyncingChats(true);
    try {
      const { data, error } = await supabase.rpc("admin_sync_accountability_chats");
      if (error) throw error;

      const result = data as {
        createdChats?: number;
        membershipsSynced?: number;
      } | null;

      toast({
        title: "Sync complete",
        description: `${result?.createdChats ?? 0} chat group(s) created · ${result?.membershipsSynced ?? 0} memberships synchronized.`,
      });
    } catch (error: any) {
      toast({
        title: "Error syncing groups",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncingChats(false);
    }
  };

  const selectedCohort = useMemo(
    () =>
      selectedCohortId && selectedCohortId !== "all"
        ? cohorts.find((cohort) => cohort.id === selectedCohortId) ?? null
        : null,
    [cohorts, selectedCohortId],
  );

  const cohortGroups = useMemo(
    () =>
      selectedCohortId && selectedCohortId !== "all"
        ? groups.filter((group) => group.cohort_id === selectedCohortId)
        : groups,
    [groups, selectedCohortId],
  );

  const cohortById = useMemo(
    () => new Map(cohorts.map((cohort) => [cohort.id, cohort] as const)),
    [cohorts],
  );

  const enrollmentById = useMemo(
    () => new Map(enrollments.map((enrollment) => [enrollment.id, enrollment] as const)),
    [enrollments],
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    if (!normalizedSearch) return users;
    return users.filter((user) => {
      const name = `${user.first_name} ${user.last_name}`.toLowerCase();
      return name.includes(normalizedSearch) || user.email.toLowerCase().includes(normalizedSearch);
    });
  }, [normalizedSearch, users]);

  const cohortEnrollments = useMemo(
    () =>
      selectedCohortId && selectedCohortId !== "all"
        ? enrollments.filter((enrollment) => enrollment.cohort_id === selectedCohortId)
        : enrollments,
    [enrollments, selectedCohortId],
  );

  const filteredEnrollments = useMemo(() => {
    if (!normalizedSearch) return cohortEnrollments;

    return cohortEnrollments.filter((enrollment) => {
      const name = `${enrollment.first_name} ${enrollment.last_name}`.toLowerCase();
      return (
        name.includes(normalizedSearch) ||
        enrollment.email.toLowerCase().includes(normalizedSearch) ||
        enrollment.status.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [cohortEnrollments, normalizedSearch]);

  const activeEnrollmentCount = useMemo(
    () => cohortEnrollments.filter((enrollment) => enrollment.status === "active").length,
    [cohortEnrollments],
  );

  const cohortScopedGoals = useMemo(
    () =>
      selectedCohortId && selectedCohortId !== "all"
        ? goals.filter((goal) => {
            if (!goal.enrollment_id) return false;
            return enrollmentById.get(goal.enrollment_id)?.cohort_id === selectedCohortId;
          })
        : goals,
    [enrollmentById, goals, selectedCohortId],
  );

  const filteredGoals = useMemo(() => {
    if (!normalizedSearch) return cohortScopedGoals;
    return cohortScopedGoals.filter((goal) => {
      const originalGoals = goal.original_goals.toLowerCase();
      const refinedGoals = goal.refined_goals?.toLowerCase() || "";
      const userName = goal.profiles
        ? `${goal.profiles.first_name} ${goal.profiles.last_name}`.toLowerCase()
        : "";
      return (
        originalGoals.includes(normalizedSearch) ||
        refinedGoals.includes(normalizedSearch) ||
        userName.includes(normalizedSearch)
      );
    });
  }, [cohortScopedGoals, normalizedSearch]);


  const groupedLegacyGoals = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      profile: Profile | null;
      goals: GoalAnalysis[];
      latestCreatedAt: string;
    }>();

    filteredGoals.forEach((goal) => {
      const key = goal.user_id ?? goal.profiles?.email ?? `unknown:${goal.id}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.goals.push(goal);
        if (new Date(goal.created_at).getTime() > new Date(existing.latestCreatedAt).getTime()) {
          existing.latestCreatedAt = goal.created_at;
        }
        return;
      }

      grouped.set(key, {
        key,
        profile: goal.profiles ?? null,
        goals: [goal],
        latestCreatedAt: goal.created_at,
      });
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        goals: [...group.goals].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      }))
      .sort(
        (a, b) =>
          new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime(),
      );
  }, [filteredGoals]);

  if (loading) {
    return (
      <div className={`min-h-screen ${isUi2 ? "pt-28 pb-16" : "pt-20 pb-12"} flex items-center justify-center`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isUi2 ? "pt-28 pb-16" : "pt-20 pb-12"} font-poppins`}>
      <div className="container mx-auto px-4 max-w-7xl">
        {isUi2 ? (
          <Ui2PageHeader
            eyebrow="Operations console"
            title="Admin Dashboard"
            description="Monitor participation, manage accountability, review goal activity and control the GOALS experience."
            icon={Shield}
            actions={
              <>
                <Button asChild variant="outline">
                  <Link to="/admin/people">
                    <UserCog className="mr-2 h-4 w-4" />
                    People & Roles
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/admin/communications">
                    <Mail className="mr-2 h-4 w-4" />
                    Communications
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/admin/forms">
                    <FileText className="mr-2 h-4 w-4" />
                    Forms & Applications
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/admin/settings">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Program settings
                  </Link>
                </Button>
                <Button asChild>
                  <Link to="/admin/appearance">
                    <Eye className="mr-2 h-4 w-4" />
                    Appearance
                  </Link>
                </Button>
              </>
            }
          />
        ) : (
          <div className="text-center mb-12 animate-fade-in">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Shield className="h-12 w-12 text-primary" />
              <h1 className="text-5xl md:text-6xl font-bold">
                Admin <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Dashboard</span>
              </h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Monitor all user activity, manage profiles, oversee goal submissions, and run program applications.
            </p>
            <div className="mt-6 flex justify-center">
              <Button asChild size="lg" variant="outline">
                <Link to="/admin/forms">
                  <FileText className="mr-2 h-5 w-5" />
                  Forms & Applications
                </Link>
              </Button>
            </div>
          </div>
        )}

        <Card className="mb-6 border-primary/20">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Layers3 className="h-5 w-5 text-primary" />
                <p className="font-semibold">Admin cohort view</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedCohort
                  ? `Viewing ${selectedCohort.name}. System-user management remains global.`
                  : "Viewing all cohorts and historical activity."}
              </p>
            </div>
            <Select
              value={selectedCohortId ?? "all"}
              onValueChange={setSelectedCohortId}
            >
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="Choose cohort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cohorts</SelectItem>
                {cohorts.map((cohort) => (
                  <SelectItem key={cohort.id} value={cohort.id}>
                    {cohort.name}{cohort.is_current ? " · Current" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="mb-8 border-primary/20">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Participant interface</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {globalMode === "ui2"
                  ? "UI 2.0 is currently the default for participants."
                  : "Current UI is currently the default for participants."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">UI 2.0</span>
              <Switch
                checked={globalMode === "ui2"}
                disabled={savingUiDefault}
                onCheckedChange={async (checked) => {
                  setSavingUiDefault(true);
                  const { error } = await supabase
                    .from("platform_configuration")
                    .update({ ui2_default: checked })
                    .eq("id", "global");
                  setSavingUiDefault(false);
                  if (error) {
                    toast({
                      title: "Interface setting could not be saved",
                      description: error.message,
                      variant: "destructive",
                    });
                    return;
                  }
                  await refreshGlobalMode();
                  toast({
                    title: checked ? "UI 2.0 switched on" : "Current UI restored",
                    description: "The participant default has been updated.",
                  });
                }}
                aria-label="Use UI 2.0 as participant default"
              />
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
          <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersRound className="h-5 w-5" />
                Cohort participants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-primary">{cohortEnrollments.length}</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Active participants</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-primary">{activeEnrollmentCount}</p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">System users</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{users.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-secondary/10 to-accent/10 border-secondary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-5 w-5" />
                Cohort goal submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-secondary">{cohortScopedGoals.length}</p>
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
        <Tabs defaultValue="participants" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6 mb-8">
            <TabsTrigger value="participants" className="flex items-center gap-2">
              <UsersRound className="h-4 w-4" />
              Participants ({filteredEnrollments.length})
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              System Users ({filteredUsers.length})
            </TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Legacy Goals ({filteredGoals.length})
            </TabsTrigger>
            <TabsTrigger value="mentors" className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              Mentors
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex items-center gap-2">
              <UsersRound className="h-4 w-4" />
              Groups ({groups.length})
            </TabsTrigger>
            <TabsTrigger value="trends" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Trends
            </TabsTrigger>
          </TabsList>

          <TabsContent value="participants">
            <Card className="bg-card border-border">
              <CardHeader>
                <div>
                  <CardTitle>
                    {selectedCohort?.name ?? "All Cohort Participants"}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enrollment status is cohort-specific. A person may appear in multiple years without creating duplicate accounts.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Participant</TableHead>
                        <TableHead>Cohort</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Registered</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEnrollments.map((enrollment) => {
                        const cohort = cohortById.get(enrollment.cohort_id);
                        const displayName =
                          [enrollment.first_name, enrollment.last_name].filter(Boolean).join(" ") ||
                          enrollment.email ||
                          "Unnamed participant";
                        return (
                          <TableRow key={enrollment.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{displayName}</p>
                                <p className="text-sm text-muted-foreground">{enrollment.email || "No email captured"}</p>
                              </div>
                            </TableCell>
                            <TableCell>{cohort?.name ?? "Unknown cohort"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  enrollment.status === "active"
                                    ? "secondary"
                                    : enrollment.status === "completed"
                                      ? "default"
                                      : "outline"
                                }
                              >
                                {enrollment.status.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {enrollment.user_id ? (
                                <Badge variant="outline">Linked account</Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">Registration only</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {format(new Date(enrollment.registered_at), "MMM d, yyyy")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {filteredEnrollments.length === 0 && (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No participants match this cohort/search yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle>All System Users</CardTitle>
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
                          {cohortGroups.map((group) => (
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
                        const userGoalsCount = legacyGoalCountByUserId.get(user.id) ?? 0;
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
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <CardTitle>
                      {selectedCohort ? `${selectedCohort.name} Goal History` : "Goal History by Participant"}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {groupedLegacyGoals.length} participant{groupedLegacyGoals.length === 1 ? "" : "s"} · {filteredGoals.length} scoped submission{filteredGoals.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {groupedLegacyGoals.map((group) => {
                    const participantName = group.profile
                      ? `${group.profile.first_name} ${group.profile.last_name}`
                      : "Unknown User";

                    return (
                      <Card key={group.key} className="overflow-hidden border-border">
                        <CardHeader className="bg-muted/25">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <CardTitle className="text-xl">{participantName}</CardTitle>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Mail className="h-3.5 w-3.5" />
                                  {group.profile?.email || "N/A"}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  Latest: {format(new Date(group.latestCreatedAt), "MMM d, yyyy")}
                                </div>
                              </div>
                            </div>
                            <Badge variant="outline" className="w-fit bg-background">
                              {group.goals.length} goal submission{group.goals.length === 1 ? "" : "s"}
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3 p-4 sm:p-5">
                          {group.goals.map((goal, index) => (
                            <div
                              key={goal.id}
                              className="rounded-xl border bg-background p-4"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold">
                                      Submission {group.goals.length - index}
                                    </p>
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(goal.created_at), "MMM d, yyyy")}
                                    </span>
                                    {goal.refined_goals && (
                                      <Badge className="bg-accent text-accent-foreground">
                                        Refined
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Original Goals
                                  </p>
                                  <p className="mt-1 line-clamp-3 text-sm text-foreground">
                                    {goal.original_goals}
                                  </p>
                                </div>

                                <div className="flex shrink-0 gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void openGoalDetails(goal)}
                                    disabled={selectedGoalLoading}
                                    title="View details"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {goal.refined_goals && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDownloadGoalPDF(goal)}
                                      disabled={exportingGoalId === goal.id}
                                      title="Download PDF"
                                    >
                                      {exportingGoalId === goal.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Download className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  })}

                  {groupedLegacyGoals.length === 0 && (
                    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                      No legacy goal submissions match this search.
                    </div>
                  )}
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

          <TabsContent value="trends">
            <AccountabilityProgramTrends />
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
                    <Button 
                      onClick={syncExistingGroupsToChat} 
                      disabled={syncingChats || cohortGroups.length === 0} 
                      size="sm"
                      variant="outline"
                    >
                      {syncingChats ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-1">Sync to Chat</span>
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
                          <span className="text-sm font-medium">Accountability Coach:</span>
                          <Select
                            value={group.mentor_id || "unassigned"}
                            onValueChange={(value) => 
                              assignMentorToGroup(group.id, value === "unassigned" ? null : value)
                            }
                          >
                            <SelectTrigger className="w-[250px]">
                              <SelectValue placeholder="Select a coach" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {getAccountabilityCoaches().map((mentor) => (
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

                  {cohortGroups.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No accountability groups created yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Goal Detail Dialog */}
        <Dialog open={!!selectedGoal} onOpenChange={() => setSelectedGoal(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-2xl">
                Goal Analysis - {selectedGoal?.profiles 
                  ? `${selectedGoal.profiles.first_name} ${selectedGoal.profiles.last_name}`
                  : "Unknown User"}
              </DialogTitle>
            </DialogHeader>
            {selectedGoal && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {selectedGoal.profiles?.email || "N/A"}
                  <span className="mx-2">•</span>
                  <Calendar className="h-4 w-4" />
                  {format(new Date(selectedGoal.created_at), "MMM d, yyyy")}
                </div>

                <div>
                  <h3 className="font-semibold text-primary mb-2">Original Goals</h3>
                  <p className="text-foreground whitespace-pre-wrap">{selectedGoal.original_goals}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-secondary mb-2">AI Analysis</h3>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Overall Score: <span className="text-primary font-bold">{getOverallScore(selectedGoal.ai_analysis)}%</span>
                    </p>
                    <p className="text-foreground">{selectedGoal.ai_analysis?.generalAdvice}</p>
                  </div>
                </div>

                {selectedGoal.refined_goals && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-accent">Refined Goals</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadGoalPDF(selectedGoal)}
                        disabled={exportingGoalId === selectedGoal.id}
                      >
                        {exportingGoalId === selectedGoal.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Download PDF
                      </Button>
                    </div>
                    <div className="space-y-4">
                      {getRefinedGoals(selectedGoal)?.map((goal, i) => (
                        <div key={i} className="bg-accent/10 rounded-lg p-4 border border-accent/30">
                          <h4 className="font-semibold text-lg mb-2">{goal.title}</h4>
                          <p className="text-foreground mb-3">{goal.description}</p>
                          <div className="text-sm text-muted-foreground mb-2">
                            <strong>Timeline:</strong> {goal.timeline}
                          </div>
                          {goal.actionSteps && goal.actionSteps.length > 0 && (
                            <div className="text-sm text-muted-foreground mb-2">
                              <strong>Action Steps:</strong>
                              <ul className="list-disc ml-5 mt-1">
                                {goal.actionSteps.map((step, stepIdx) => (
                                  <li key={stepIdx}>{step}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {goal.successMetrics && goal.successMetrics.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              <strong>Success Metrics:</strong>
                              <ul className="list-disc ml-5 mt-1">
                                {goal.successMetrics.map((metric, metricIdx) => (
                                  <li key={metricIdx}>{metric}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Admin;
