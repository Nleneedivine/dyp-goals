import type { Json } from "@/integrations/supabase/types";

export const FIELD_TYPES = [
  ["text", "Short text"], ["textarea", "Long text"], ["email", "Email"],
  ["phone", "Phone"], ["number", "Number"], ["date", "Date"],
  ["dropdown", "Dropdown"], ["multi_select", "Multi-select"], ["checkbox", "Checkbox"],
  ["radio", "Radio"], ["file", "File upload"], ["rating", "Rating scale"], ["section", "Section heading"],
] as const;

export type FieldType = typeof FIELD_TYPES[number][0];

export type ProgramForm = {
  id: string; slug: string; title: string; description: string; brand: "goals" | "dyp";
  status: "draft" | "published" | "archived"; opens_at: string | null; closes_at: string | null;
  submission_deadline: string | null; response_limit: number | null; confirmation_message: string;
  confirmation_email_enabled: boolean; featured: boolean; dropoff_warning_threshold: number;
  low_fill_threshold: number; created_by: string; created_at: string; updated_at: string;
};

export type ProgramField = {
  id: string; form_id: string; field_type: FieldType; label: string; helper_text: string;
  placeholder: string; required: boolean; display_order: number; options: Json;
  validation_rules: Json; conditional_logic: Json; created_at: string; updated_at: string;
};

export const makeSlug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export const parseOptions = (value: Json): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export const answerAsText = (answer: Json) => Array.isArray(answer) ? answer.join(", ") : typeof answer === "object" ? JSON.stringify(answer) : String(answer ?? "");