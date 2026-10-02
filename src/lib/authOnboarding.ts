import { supabase } from "@/integrations/supabase/client";

export async function linkAuthenticatedEnrollments() {
  const { data, error } = await supabase.rpc("link_current_user_enrollments");
  if (error) throw error;
  return data;
}

export function safeNextPath(value: string | null | undefined, fallback = "/journey") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
