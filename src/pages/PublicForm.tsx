import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseOptions, type ProgramField, type ProgramForm } from "@/lib/formTypes";

type Answer = string | number | boolean | string[] | null;
type Timing = { firstInputDelayMs: number | null; activeTimeMs: number | null };

export default function PublicForm() {
  const { slug } = useParams();
  const [form, setForm] = useState<ProgramForm | null>(null);
  const [fields, setFields] = useState<ProgramField[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [files, setFiles] = useState<Record<string, File>>({});
  const [timings, setTimings] = useState<Record<string, Timing>>({});
  const startedAt = useRef(Date.now());
  const focusedAt = useRef<Record<string, number>>({});

  const deviceType = useMemo(() => window.innerWidth < 640 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop", []);

  useEffect(() => {
    const load = async () => {
      const { data: formData } = await supabase.from("program_forms").select("*").eq("slug", slug ?? "").eq("status", "published").maybeSingle();
      if (!formData) { setLoading(false); return; }
      const { data: fieldData } = await supabase.from("program_form_fields").select("*").eq("form_id", formData.id).order("display_order");
      setForm(formData as ProgramForm); setFields((fieldData ?? []) as ProgramField[]);
      const { data } = await supabase.functions.invoke("program-form-public", { body: { action: "start", formId: formData.id, deviceType, browserFamily: navigator.userAgent.slice(0, 80) } });
      if (data?.sessionToken) setSessionToken(data.sessionToken);
      setLoading(false);
    };
    void load();
  }, [slug, deviceType]);

  const track = (fieldId: string | null, eventType: "view" | "focus" | "first_input" | "change" | "blur" | "submit") => {
    if (!form || !sessionToken) return;
    void supabase.functions.invoke("program-form-public", { body: { action: "track", formId: form.id, sessionToken, fieldId, eventType, elapsedMs: Date.now() - startedAt.current } });
  };
  const focus = (id: string) => { focusedAt.current[id] = Date.now(); track(id, "focus"); };
  const change = (id: string, value: Answer) => {
    if (answers[id] === undefined) setTimings((current) => ({ ...current, [id]: { firstInputDelayMs: Date.now() - (focusedAt.current[id] ?? Date.now()), activeTimeMs: current[id]?.activeTimeMs ?? null } }));
    setAnswers((current) => ({ ...current, [id]: value })); track(id, answers[id] === undefined ? "first_input" : "change");
  };
  const blur = (id: string) => { const active = Math.max(0, Date.now() - (focusedAt.current[id] ?? Date.now())); setTimings((current) => ({ ...current, [id]: { firstInputDelayMs: current[id]?.firstInputDelayMs ?? null, activeTimeMs: (current[id]?.activeTimeMs ?? 0) + active } })); track(id, "blur"); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    if (!form || !sessionToken) return setError("The form session could not start. Please refresh the page.");
    setSubmitting(true);
    const submittedAnswers = { ...answers };
    for (const [fieldId, file] of Object.entries(files)) {
      if (file.size > 10 * 1024 * 1024) { setSubmitting(false); return setError(`${file.name} is larger than 10 MB.`); }
      const { data: upload, error: uploadRequestError } = await supabase.functions.invoke("program-form-public", { body: { action: "upload", formId: form.id, sessionToken, fieldId, fileName: file.name, contentType: file.type } });
      if (uploadRequestError || !upload?.path || !upload?.token) { setSubmitting(false); return setError("A file could not be prepared for upload."); }
      const { error: uploadError } = await supabase.storage.from("program-form-uploads").uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
      if (uploadError) { setSubmitting(false); return setError(`${file.name} could not be uploaded.`); }
      submittedAnswers[fieldId] = upload.path;
    }
    const { data, error: invokeError } = await supabase.functions.invoke("program-form-public", { body: { action: "submit", formId: form.id, sessionToken, answers: submittedAnswers, timings } });
    setSubmitting(false);
    if (invokeError || data?.error) return setError(data?.error ?? invokeError?.message ?? "Your response could not be submitted.");
    setSuccess(data.confirmationMessage ?? form.confirmation_message);
  };

  const renderField = (field: ProgramField) => {
    const common = { id: field.id, required: field.required, placeholder: field.placeholder, onFocus: () => focus(field.id), onBlur: () => blur(field.id) };
    const value = answers[field.id]; const options = parseOptions(field.options);
    if (field.field_type === "textarea") return <Textarea {...common} value={String(value ?? "")} onChange={(event) => change(field.id, event.target.value)} />;
    if (field.field_type === "dropdown") return <Select value={String(value ?? "")} onValueChange={(next) => change(field.id, next)}><SelectTrigger onFocus={common.onFocus} onBlur={common.onBlur}><SelectValue placeholder={field.placeholder || "Select an option"} /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>;
    if (field.field_type === "radio") return <RadioGroup value={String(value ?? "")} onValueChange={(next) => change(field.id, next)} className="space-y-2">{options.map((option) => <label key={option} className="flex min-h-11 items-center gap-3 rounded-md border p-3"><RadioGroupItem value={option} />{option}</label>)}</RadioGroup>;
    if (field.field_type === "multi_select") return <div className="grid gap-2 sm:grid-cols-2">{options.map((option) => { const selected = Array.isArray(value) ? value : []; return <label key={option} className="flex min-h-11 items-center gap-3 rounded-md border p-3"><Checkbox checked={selected.includes(option)} onCheckedChange={(checked) => change(field.id, checked ? [...selected, option] : selected.filter((item) => item !== option))} />{option}</label>; })}</div>;
    if (field.field_type === "checkbox") return <label className="flex min-h-11 items-center gap-3 rounded-md border p-3"><Checkbox checked={Boolean(value)} onCheckedChange={(checked) => change(field.id, Boolean(checked))} />{field.placeholder || "Yes"}</label>;
    if (field.field_type === "rating") return <div className="flex gap-2">{[1,2,3,4,5].map((rating) => <Button key={rating} type="button" size="icon" variant={Number(value) >= rating ? "default" : "outline"} onClick={() => change(field.id, rating)} aria-label={`${rating} stars`}><Star className="h-4 w-4" /></Button>)}</div>;
    if (field.field_type === "file") return <Input {...common} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" aria-describedby={`${field.id}-help`} onChange={(event) => { const file = event.target.files?.[0]; if (file) { setFiles((current) => ({ ...current, [field.id]: file })); change(field.id, file.name); } }} />;
    return <Input {...common} type={field.field_type === "phone" ? "tel" : field.field_type} value={String(value ?? "")} onChange={(event) => change(field.id, field.field_type === "number" ? Number(event.target.value) : event.target.value)} />;
  };

  if (loading) return <main className="min-h-screen brand-wash grid place-items-center"><Loader2 className="h-9 w-9 animate-spin text-primary-foreground" /></main>;
  if (!form) return <main className="min-h-screen brand-wash grid place-items-center p-4"><Card className="max-w-lg"><CardContent className="p-8 text-center"><h1 className="text-2xl font-bold">This form is not available</h1><p className="mt-3 text-muted-foreground">It may not be open yet, or submissions may have closed.</p></CardContent></Card></main>;
  return <main className="min-h-screen bg-secondary/45 px-4 py-10 sm:py-16"><div className="mx-auto max-w-3xl"><BrandLogo brand={form.brand} className="mb-6" />{success ? <Card><CardContent className="p-10 text-center"><CheckCircle2 className="mx-auto mb-5 h-14 w-14 text-primary" /><h1 className="text-3xl font-bold">Response received</h1><p className="mt-4 text-muted-foreground">{success}</p></CardContent></Card> : <form onSubmit={submit}><header className="brand-wash rounded-t-lg px-5 py-8 text-primary-foreground sm:px-9"><h1 className="text-3xl font-bold sm:text-4xl">{form.title}</h1><p className="mt-3 max-w-2xl text-primary-foreground/85">{form.description}</p></header><Card className="rounded-t-none border-t-0"><CardContent className="space-y-7 p-5 sm:p-9">{fields.map((field) => field.field_type === "section" ? <section key={field.id} className="border-b pb-3 pt-3"><h2 className="text-xl font-semibold text-primary">{field.label}</h2>{field.helper_text && <p className="mt-1 text-sm text-muted-foreground">{field.helper_text}</p>}</section> : <div key={field.id} className="space-y-2"><Label htmlFor={field.id} className="text-base">{field.label}{field.required && <span className="ml-1 text-destructive">*</span>}</Label>{field.helper_text && <p id={`${field.id}-help`} className="text-sm text-muted-foreground">{field.helper_text}</p>}{renderField(field)}</div>)}{error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<Button type="submit" size="lg" className="min-h-12 w-full sm:w-auto" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button></CardContent></Card></form>}</div></main>;
}