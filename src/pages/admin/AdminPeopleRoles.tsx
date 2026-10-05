import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  UserCog,
  UsersRound,
  Search,
  Loader2,
  ArrowLeft,
  GraduationCap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "user" | "mentor" | "accountability_coach";

type Profile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
};

type RoleRow = {
  user_id: string;
  role: AppRole;
};

type Group = {
  id: string;
  name: string;
  cohort_id: string;
  mentor_id: string | null;
};

type Cohort = {
  id: string;
  name: string;
  is_current: boolean;
};

const ROLE_META: Array<{
  role: Exclude<AppRole, "user">;
  label: string;
  description: string;
}> = [
  {
    role: "admin",
    label: "Admin",
    description: "Full operational access to programs, people, settings and reports.",
  },
  {
    role: "accountability_coach",
    label: "Accountability Coach",
    description: "Supports assigned accountability groups, shared execution and group check-ins.",
  },
  {
    role: "mentor",
    label: "Mentor",
    description: "Optional deeper mentorship support, separate from Accountability Lab.",
  },
];

export default function AdminPeopleRoles() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [query, setQuery] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [profilesResult, rolesResult, groupsResult, cohortsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,first_name,last_name,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
      supabase
        .from("accountability_groups")
        .select("id,name,cohort_id,mentor_id")
        .order("created_at", { ascending: false }),
      supabase
        .from("program_cohorts")
        .select("id,name,is_current")
        .order("cohort_year", { ascending: false }),
    ]);
    setLoading(false);

    const error =
      profilesResult.error ??
      rolesResult.error ??
      groupsResult.error ??
      cohortsResult.error;

    if (error) {
      toast({
        title: "People & Roles could not load",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setProfiles(profilesResult.data ?? []);
    setRoles((rolesResult.data ?? []) as RoleRow[]);
    setGroups(groupsResult.data ?? []);
    setCohorts(cohortsResult.data ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const roleSetByUser = useMemo(() => {
    const map = new Map<string, Set<AppRole>>();
    roles.forEach((row) => {
      const set = map.get(row.user_id) ?? new Set<AppRole>();
      set.add(row.role);
      map.set(row.user_id, set);
    });
    return map;
  }, [roles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((profile) =>
      `${profile.first_name} ${profile.last_name} ${profile.email}`
        .toLowerCase()
        .includes(q),
    );
  }, [profiles, query]);

  const currentCohortIds = useMemo(
    () => new Set(cohorts.filter((cohort) => cohort.is_current).map((cohort) => cohort.id)),
    [cohorts],
  );

  const currentGroups = useMemo(
    () => groups.filter((group) => currentCohortIds.has(group.cohort_id)),
    [groups, currentCohortIds],
  );

  const setRole = async (
    userId: string,
    role: Exclude<AppRole, "user">,
    enabled: boolean,
  ) => {
    const key = `${userId}:${role}`;
    setSavingKey(key);

    const { error } = await supabase.rpc("admin_set_user_role", {
      p_user_id: userId,
      p_role: role,
      p_enabled: enabled,
    });

    setSavingKey("");

    if (error) {
      toast({
        title: "Role could not be updated",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setRoles((current) => {
      const without = current.filter(
        (row) => !(row.user_id === userId && row.role === role),
      );
      return enabled ? [...without, { user_id: userId, role }] : without;
    });

    toast({
      title: enabled ? "Role added" : "Role removed",
      description: ROLE_META.find((item) => item.role === role)?.label,
    });
  };

  const assignCoachToGroup = async (groupId: string, coachId: string | null) => {
    const key = `group:${groupId}`;
    setSavingKey(key);

    if (coachId) {
      const { error: roleError } = await supabase.rpc("admin_set_user_role", {
        p_user_id: coachId,
        p_role: "accountability_coach",
        p_enabled: true,
      });
      if (roleError) {
        setSavingKey("");
        toast({
          title: "Coach role could not be assigned",
          description: roleError.message,
          variant: "destructive",
        });
        return;
      }
    }

    const group = groups.find((item) => item.id === groupId);
    const oldCoachId = group?.mentor_id ?? null;

    const { error } = await supabase
      .from("accountability_groups")
      .update({ mentor_id: coachId })
      .eq("id", groupId);

    if (!error) {
      const { data: chat } = await supabase
        .from("chat_groups")
        .select("id")
        .eq("accountability_group_id", groupId)
        .maybeSingle();

      if (chat?.id) {
        if (oldCoachId && oldCoachId !== coachId) {
          await supabase
            .from("chat_group_members")
            .delete()
            .eq("group_id", chat.id)
            .eq("user_id", oldCoachId);
        }

        if (coachId) {
          await supabase.from("chat_group_members").upsert(
            {
              group_id: chat.id,
              user_id: coachId,
              role: "admin",
            },
            { onConflict: "group_id,user_id" },
          );
        }
      }
    }

    setSavingKey("");

    if (error) {
      toast({
        title: "Group coach could not be updated",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    await load();
    toast({
      title: "Accountability Coach updated",
      description: coachId
        ? "The coach can now support this group and its chat."
        : "This group is currently unassigned.",
    });
  };

  const coaches = profiles.filter((profile) =>
    roleSetByUser.get(profile.id)?.has("accountability_coach"),
  );

  if (loading) {
    return (
      <main className="min-h-screen pt-28 grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-28">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
              Admin · People
            </p>
            <h1 className="mt-2 text-3xl font-bold">People & Roles</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Manage staff permissions separately from program enrollment. A person can hold more than one staff role.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or email"
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filtered.map((profile) => {
              const userRoles = roleSetByUser.get(profile.id) ?? new Set<AppRole>();
              return (
                <div
                  key={profile.id}
                  className="rounded-2xl border p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unnamed account"}
                      </p>
                      <p className="break-all text-sm text-muted-foreground">{profile.email}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ROLE_META.filter((meta) => userRoles.has(meta.role)).map((meta) => (
                          <Badge key={meta.role} variant="secondary">{meta.label}</Badge>
                        ))}
                        {!ROLE_META.some((meta) => userRoles.has(meta.role)) && (
                          <Badge variant="outline">Participant / User</Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[620px]">
                      {ROLE_META.map((meta) => {
                        const enabled = userRoles.has(meta.role);
                        const saving = savingKey === `${profile.id}:${meta.role}`;
                        return (
                          <div key={meta.role} className="rounded-xl border p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">{meta.label}</p>
                                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                  {meta.description}
                                </p>
                              </div>
                              {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              ) : (
                                <Switch
                                  checked={enabled}
                                  onCheckedChange={(checked) =>
                                    void setRole(profile.id, meta.role, checked)
                                  }
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-primary" />
              Current Accountability Lab coaches
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Assign Accountability Coaches to current-cohort groups. Group-chat admin membership is synchronized automatically.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No current-cohort accountability groups exist yet.
              </div>
            ) : (
              currentGroups.map((group) => {
                const cohort = cohorts.find((item) => item.id === group.cohort_id);
                return (
                  <div
                    key={group.id}
                    className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{cohort?.name ?? "Current cohort"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-primary" />
                      <Select
                        value={group.mentor_id ?? "unassigned"}
                        onValueChange={(value) =>
                          void assignCoachToGroup(
                            group.id,
                            value === "unassigned" ? null : value,
                          )
                        }
                        disabled={savingKey === `group:${group.id}`}
                      >
                        <SelectTrigger className="w-full sm:w-[260px]">
                          <SelectValue placeholder="Assign coach" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {coaches.map((coach) => (
                            <SelectItem key={coach.id} value={coach.id}>
                              {coach.first_name} {coach.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
