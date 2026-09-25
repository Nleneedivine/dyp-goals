import type { Json } from "@/integrations/supabase/types";

export type ProgramEvent = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  session_start_time: string;
  session_end_time: string;
  currency: string;
  original_price: number;
  discounted_price: number;
  registration_slug: string;
  benefits: Json;
  status: "draft" | "published" | "archived";
};

export const eventBenefits = (benefits: Json): string[] =>
  Array.isArray(benefits)
    ? benefits.filter((item): item is string => typeof item === "string")
    : [];

export const formatEventDate = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));

export const formatNaira = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
