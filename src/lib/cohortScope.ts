import { supabase } from "@/integrations/supabase/client";

export type CurrentGoalEnrollment = {
  id: string;
  cohortId: string;
  cohortName: string;
  cohortYear: number;
  status: string;
};

export async function getCurrentGoalEnrollment(
  userId: string,
): Promise<CurrentGoalEnrollment | null> {
  const { data: cohort, error: cohortError } = await supabase
    .from("program_cohorts")
    .select("id,name,cohort_year")
    .eq("program_key", "goals")
    .eq("is_current", true)
    .maybeSingle();

  if (cohortError || !cohort) return null;

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("program_enrollments")
    .select("id,status")
    .eq("cohort_id", cohort.id)
    .eq("user_id", userId)
    .in("status", ["active", "completed"])
    .maybeSingle();

  if (enrollmentError || !enrollment) return null;

  return {
    id: enrollment.id,
    cohortId: cohort.id,
    cohortName: cohort.name,
    cohortYear: cohort.cohort_year,
    status: enrollment.status,
  };
}

export function weeklyReviewBelongsToGoalIds(
  summary: unknown,
  goalIds: Set<string>,
) {
  if (!goalIds.size) return false;
  if (!Array.isArray(summary)) return false;

  return summary.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const goalId = (item as Record<string, unknown>).goalId;
    return typeof goalId === "string" && goalIds.has(goalId);
  });
}
