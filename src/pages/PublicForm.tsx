import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Copy, Loader2, Search, Share2, Star, UserRound, X } from "lucide-react";
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
  const [ownReferralCode, setOwnReferralCode] = useState("");
  const [referrerQuery, setReferrerQuery] = useState("");
  const [referrerResults, setReferrerResults] = useState<Array<{ referral_code: string; display_name: string }>>([]);
  const [selectedReferralCode, setSelectedReferralCode] = useState("");
  const [selectedReferrerName, setSelectedReferrerName] = useState("");
  const [searchingReferrers, setSearchingReferrers] = useState(false);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [timings, setTimings] = useState<Record<string, Timing>>({});
  const startedAt = useRef(Date.now());
  const focusedAt = useRef<Record<string, number>>({});

  const deviceType = useMemo(() => window.innerWidth < 640 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop", []);
  const incomingReferralCode = useMemo(() => new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase() ?? "", []);


  const findReferrers = async (query = referrerQuery) => {
    if (!form || query.trim().length < 2) {
      setReferrerResults([]);
      return;
    }

    setSearchingReferrers(true);
    const { data, error } = await supabase.rpc("search_program_referrers", {
      p_form_id: form.id,
      p_query: query.trim(),
    });
    setSearchingReferrers(false);

    if (error) {
      setError("Referrer search is temporarily unavailable. You can still submit without selecting a referrer.");
      return;
    }

    const results = data ?? [];
    setError("");
    setReferrerResults(results);
    if (incomingReferralCode && !selectedReferralCode) {
      const exact = results.find((item) => item.referral_code.toUpperCase() === incomingReferralCode);
      if (exact) {
        setSelectedReferralCode(exact.referral_code);
        setSelectedReferrerName(exact.display_name);
      }
    }
  };

  useEffect(() => {
    if (!form || !incomingReferralCode) return;
    setReferrerQuery(incomingReferralCode);
    void findReferrers(incomingReferralCode);
  }, [form, incomingReferralCode]);

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
    if (invokeError || data?.error) {
      setSubmitting(false);
      return setError(data?.error ?? invokeError?.message ?? "Your response could not be submitted.");
    }

    const referralCodeToRecord = selectedReferralCode || incomingReferralCode;
    if (referralCodeToRecord) {
      const { error: referralError } = await supabase.rpc("record_program_referral", {
        p_session_token: sessionToken,
        p_referral_code: referralCodeToRecord,
      });
      if (referralError) console.error("Referral attribution could not be recorded:", referralError);
    }

    const { data: referralCode, error: referralCodeError } = await supabase.rpc(
      "get_program_referral_code",
      { p_session_token: sessionToken },
    );
    if (!referralCodeError && referralCode) setOwnReferralCode(referralCode);

    setSubmitting(false);
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
  return <main className="min-h-screen bg-secondary/45 px-4 py-10 sm:py-16"><div className="mx-auto max-w-3xl"><BrandLogo brand={form.brand} className="mb-6" />{success ? <Card><CardContent className="p-8 text-center sm:p-10"><CheckCircle2 className="mx-auto mb-5 h-14 w-14 text-primary" /><h1 className="text-3xl font-bold">Response received</h1><p className="mt-4 text-muted-foreground">{success}</p>{ownReferralCode && <div className="mx-auto mt-7 max-w-xl rounded-2xl border bg-muted/20 p-5"><div className="flex items-center justify-center gap-2 text-primary"><Share2 className="h-5 w-5" /><p className="font-semibold">Your referral code</p></div><p className="mt-3 font-mono text-2xl font-bold tracking-wider">{ownReferralCode}</p><p className="mt-2 text-sm text-muted-foreground">Share this code or your referral link. A referral counts toward the campaign leaderboard only after that participant completes the program and receives a certificate.</p><Button type="button" variant="outline" className="mt-4 gap-2" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/apply/${form.slug}?ref=${encodeURIComponent(ownReferralCode)}`)}><Copy className="h-4 w-4" />Copy referral link</Button></div>}</CardContent></Card> : <form onSubmit={submit}><header className="brand-wash rounded-t-lg px-5 py-8 text-primary-foreground sm:px-9"><h1 className="text-3xl font-bold sm:text-4xl">{form.title}</h1><p className="mt-3 max-w-2xl text-primary-foreground/85">{form.description}</p></header><Card className="rounded-t-none border-t-0"><CardContent className="space-y-7 p-5 sm:p-9"><div className="rounded-xl border bg-muted/15 p-4"><div className="flex items-start gap-3"><UserRound className="mt-1 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><Label htmlFor="referrer-search" className="text-base">Who referred you? <span className="font-normal text-muted-foreground">(optional)</span></Label><p className="mt-1 text-sm text-muted-foreground">Search by the person's name or DYP referral code.</p>{selectedReferralCode ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"><div><p className="font-medium">{selectedReferrerName || "Referral code applied"}</p><p className="font-mono text-xs text-muted-foreground">{selectedReferralCode}</p></div><Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedReferralCode(""); setSelectedReferrerName(""); setReferrerQuery(""); setReferrerResults([]); }}><X className="mr-1 h-4 w-4" />Change</Button></div> : <><div className="mt-3 flex gap-2"><Input id="referrer-search" value={referrerQuery} onChange={(event) => setReferrerQuery(event.target.value)} placeholder="Name or DYPGL code" /><Button type="button" variant="outline" onClick={() => void findReferrers()} disabled={searchingReferrers || referrerQuery.trim().length < 2}>{searchingReferrers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span className="sr-only">Find referrer</span></Button></div>{referrerResults.length > 0 && <div className="mt-2 space-y-2">{referrerResults.map((result) => <button key={result.referral_code} type="button" onClick={() => { setSelectedReferralCode(result.referral_code); setSelectedReferrerName(result.display_name); setReferrerResults([]); }} className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left hover:border-primary/40"><span className="font-medium">{result.display_name}</span><span className="font-mono text-xs text-muted-foreground">{result.referral_code}</span></button>)}</div>}</>}</div></div></div>{fields.map((field) => field.field_type === "section" ? <section key={field.id} className="border-b pb-3 pt-3"><h2 className="text-xl font-semibold text-primary">{field.label}</h2>{field.helper_text && <p className="mt-1 text-sm text-muted-foreground">{field.helper_text}</p>}</section> : <div key={field.id} className="space-y-2"><Label htmlFor={field.id} className="text-base">{field.label}{field.required && <span className="ml-1 text-destructive">*</span>}</Label>{field.helper_text && <p id={`${field.id}-help`} className="text-sm text-muted-foreground">{field.helper_text}</p>}{renderField(field)}</div>)}{error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<Button type="submit" size="lg" className="min-h-12 w-full sm:w-auto" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button></CardContent></Card></form>}</div></main>;
}