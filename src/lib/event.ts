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
  discount_deadline: string | null;
  platform: string;
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

export const formatEventTime = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return value;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return value;
  }

  const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
};

export const formatNaira = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
