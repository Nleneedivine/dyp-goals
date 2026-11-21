import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Submission = { id: string; form_id: string; session_id: string; submitted_at: string };
type Field = { id: string; form_id: string; label: string; field_type: string; display_order: number };
type Answer = { submission_id: string; field_id: string; answer: unknown };
type Funding = { submission_id: string; status: string } | null;
type Admission = { submission_id: string; status: string; decision_reason: string; decided_at: string | null } | null;
type AdmissionRecord = NonNullable<Admission>;
type AdmissionRpcResult = { data: { expiresAt?: string } | null; error: { message: string } | null };

const callAdmissionRpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (functionName: string, parameters: Record<string, unknown>) => Promise<AdmissionRpcResult>)(name, args);
type Enrollment = { id: string; source_submission_id: string | null; status: string; first_name: string; last_name: string; email: string };

type ApplicationRow = {
  submission: Submission;
  fields: Field[];
  answers: Answer[];
  payment: Funding;
  sponsorship: Funding;
  admission: Admission;
  recoveryEligible: boolean;
};

const answerText = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(answerText).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(answerText).join(" ");
  return "";
};

const fieldValue = (row: ApplicationRow, matcher: RegExp) => {
  const field = row.fields.find((item) => matcher.test(item.label) || (matcher.source.includes("email") && item.field_type === "email"));
  if (!field) return "";
  return answerText(row.answers.find((answer) => answer.field_id === field.id)?.answer).trim();
};

const statusLabel = (row: ApplicationRow) => {
  if (!row.admission) return row.recoveryEligible ? "Incomplete payment recovery" : "Outside new workflow";
  if (row.admission?.status === "admitted") return "Admitted";
  if (row.admission?.status === "rejected") return "Admission rejected";
  if (row.admission?.status === "awaiting_admission") return "Awaiting admission";
  if (row.payment?.status === "paid" || row.sponsorship?.status === "approved") return "Awaiting admission";
  return "Awaiting funding";
};

export default function AdminApplications() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [formsResult, submissionsResult, fieldsResult, paymentsResult, sponsorshipsResult, admissionsResult, answersResult, enrollmentsResult] = await Promise.all([
        supabase.from("program_forms").select("id,cohort:program_cohorts!inner(program_key)").eq("cohort.program_key", "goals"),
        supabase.from("program_form_submissions").select("id,form_id,session_id,submitted_at").order("submitted_at", { ascending: false }).limit(500),
        supabase.from("program_form_fields").select("id,form_id,label,field_type,display_order").order("display_order"),
        supabase.from("program_payments").select("submission_id,status"),
        supabase.from("program_sponsorship_claims").select("submission_id,status"),
        (supabase.from("program_application_admissions" as never).select("submission_id,status,decision_reason,decided_at") as unknown as Promise<{ data: AdmissionRecord[] | null; error: { message: string } | null }>),
        supabase.from("program_form_answers").select("submission_id,field_id,answer"),
        supabase.from("program_enrollments").select("id,source_submission_id,status,first_name,last_name,email,cohort:program_cohorts!inner(program_key)").eq("cohort.program_key", "goals").eq("status", "payment_pending").not("source_submission_id", "is", null),
      ]);
      const error = formsResult.error || submissionsResult.error || fieldsResult.error || paymentsResult.error || sponsorshipsResult.error || admissionsResult.error || answersResult.error || enrollmentsResult.error;
      if (error) throw error;
      const goalsFormIds = new Set((formsResult.data ?? []).map((form) => form.id));
      const submissions = (submissionsResult.data ?? []).filter((submission) => goalsFormIds.has(submission.form_id));
      const fields = fieldsResult.data ?? [];
      const answers = answersResult.data ?? [];
      const payments = paymentsResult.data ?? [];
      const claims = sponsorshipsResult.data ?? [];
      const admissions = admissionsResult.data ?? [];
      const pendingEnrollments = (enrollmentsResult.data ?? []) as Enrollment[];
      const paymentById = new Map(payments.map((item) => [item.submission_id, item]));
      const claimById = new Map(claims.map((item) => [item.submission_id, item]));
      const admissionById = new Map(admissions.map((item) => [item.submission_id, item]));
      const recoveryIds = new Set(pendingEnrollments
        .filter((enrollment) => enrollment.source_submission_id)
        .map((enrollment) => enrollment.source_submission_id as string)
        .filter((id) => !admissionById.has(id) && paymentById.get(id)?.status !== "paid" && claimById.get(id)?.status !== "approved"));
      const visibleIds = new Set([...admissionById.keys(), ...recoveryIds]);
      const visibleSubmissions = submissions.filter((item) => visibleIds.has(item.id));
      setRows(visibleSubmissions.map((submission) => ({
        submission,
        fields: fields.filter((field) => field.form_id === submission.form_id),
        answers: answers.filter((answer) => answer.submission_id === submission.id),
        payment: paymentById.get(submission.id) ?? null,
        sponsorship: claimById.get(submission.id) ?? null,
        admission: admissionById.get(submission.id) ?? null,
        recoveryEligible: recoveryIds.has(submission.id),
      })));
    } catch (error: unknown) {
      toast({ title: "Applications could not load", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((row) => {
    const name = [fieldValue(row, /first name/i), fieldValue(row, /last name/i), fieldValue(row, /full name|^name$/i)].join(" ");
    const email = fieldValue(row, /email/i);
    const matchesQuery = !query || (name + " " + email).toLowerCase().includes(query.toLowerCase());
    const state = statusLabel(row);
    const matchesFilter = filter === "all"
      || (filter === "funding" && state === "Awaiting funding")
      || (filter === "admission" && state === "Awaiting admission")
      || (filter === "admitted" && state === "Admitted")
      || (filter === "rejected" && state === "Admission rejected")
      || (filter === "recovery" && row.recoveryEligible);
    return matchesQuery && matchesFilter;
  }), [rows, query, filter]);

  const makePortalLink = async (submissionId: string) => {
    setBusyId(submissionId);
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const { data: tokenResult, error } = await callAdmissionRpc("admin_create_applicant_portal_token", {
        p_submission_id: submissionId,
        p_token_hash: tokenHash,
      });
      if (error) throw error;
      const url = new URL("/applicant-portal", window.location.origin);
      url.searchParams.set("token", token);
      await navigator.clipboard.writeText(url.toString());
      const expiry = tokenResult?.expiresAt ? new Date(tokenResult.expiresAt).toLocaleDateString() : "180 days after creation";
      toast({ title: "Applicant portal link copied", description: `Share this link manually. It expires on ${expiry}. It will not be emailed automatically.` });
      await load();
    } catch (error: unknown) {
      toast({ title: "Could not create portal link", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (submissionId: string, decision: "admitted" | "rejected") => {
    setBusyId(submissionId);
    try {
      const { error } = await callAdmissionRpc("admin_set_program_application_admission", {
        p_submission_id: submissionId,
        p_decision: decision,
        p_reason: reasons[submissionId] ?? "",
      });
      if (error) throw error;
      toast({ title: decision === "admitted" ? "Applicant admitted" : "Admission decision saved" });
      await load();
    } catch (error: unknown) {
      toast({ title: "Admission decision failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return <main className="container mx-auto max-w-7xl space-y-6 px-4 pb-16 pt-24">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-medium text-primary">Programme administration</p><h1 className="text-3xl font-bold">Applications & Admissions</h1><p className="mt-1 text-sm text-muted-foreground">Funding verification and admission are separate decisions. Existing participants are not included in this new admission workflow.</p></div>
      <div className="flex gap-2"><Button variant="outline" asChild><Link to="/admin/forms">Forms</Link></Button><Button variant="outline" asChild><Link to="/admin/sponsorships">Sponsorship review</Link></Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Applications in view</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{rows.length}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Awaiting funding</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{rows.filter(r => statusLabel(r) === "Awaiting funding").length}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Awaiting admission</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{rows.filter(r => statusLabel(r) === "Awaiting admission").length}</CardContent></Card>
    </div>
    <div className="flex flex-col gap-3 sm:flex-row"><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search applicant name or email"/><Select value={filter} onValueChange={setFilter}><SelectTrigger className="sm:w-64"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All applications</SelectItem><SelectItem value="funding">Awaiting funding</SelectItem><SelectItem value="admission">Awaiting admission</SelectItem><SelectItem value="admitted">Admitted</SelectItem><SelectItem value="rejected">Admission rejected</SelectItem><SelectItem value="recovery">Incomplete-payment recovery</SelectItem></SelectContent></Select></div>
    {loading ? <p className="py-10 text-center text-muted-foreground">Loading applications…</p> : filtered.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">No matching applications.</CardContent></Card> : <div className="space-y-3">{filtered.map(row => {
      const name = [fieldValue(row,/first name/i),fieldValue(row,/last name/i)].filter(Boolean).join(" ") || fieldValue(row,/full name|^name$/i) || "Applicant";
      const email = fieldValue(row,/email/i) || "Email not found";
      const funded = row.payment?.status === "paid" || row.sponsorship?.status === "approved";
      const newWorkflow = Boolean(row.admission);
      return <Card key={row.submission.id}><CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{name}</h2><Badge variant={statusLabel(row) === "Admitted" ? "default" : "secondary"}>{statusLabel(row)}</Badge>{row.sponsorship && <Badge variant="outline">Sponsored · {row.sponsorship.status}</Badge>}{row.payment && <Badge variant="outline">Payment · {row.payment.status}</Badge>}</div><p className="break-all text-sm text-muted-foreground">{email}</p><p className="text-xs text-muted-foreground">Submitted {new Date(row.submission.submitted_at).toLocaleString()} · {row.submission.id}</p>{row.admission?.decision_reason && <p className="text-sm text-muted-foreground">Decision reason: {row.admission.decision_reason}</p>}{row.recoveryEligible && <p className="text-xs text-muted-foreground">Recovery candidate: existing payment-pending enrollment; original application retained.</p> }</div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end"><Button size="sm" variant="outline" onClick={() => void makePortalLink(row.submission.id)} disabled={busyId === row.submission.id}><Copy className="mr-2 h-4 w-4"/>Copy / reissue portal link</Button>{newWorkflow && funded && row.admission?.status !== "admitted" && row.admission?.status !== "rejected" && <><Input className="sm:w-48" placeholder="Rejection reason" value={reasons[row.submission.id] ?? ""} onChange={e => setReasons(current => ({...current,[row.submission.id]:e.target.value}))}/><Button size="sm" onClick={() => void decide(row.submission.id,"admitted")} disabled={busyId === row.submission.id}><ShieldCheck className="mr-2 h-4 w-4"/>Admit</Button><Button size="sm" variant="destructive" onClick={() => void decide(row.submission.id,"rejected")} disabled={busyId === row.submission.id || (reasons[row.submission.id] ?? "").trim().length < 3}>Reject</Button></>}</div>
      </CardContent></Card>;
    })}</div>}
    <p className="text-xs text-muted-foreground">Only post-launch applications enter the admission queue. Recovery candidates are limited to payment-pending enrollments linked to their original submission; paid and approved-sponsored records are excluded. Funding verification remains in the existing <Link className="underline" to="/admin/forms">payment review</Link> and <Link className="underline" to="/admin/sponsorships">sponsorship review</Link> workspaces. Portal links are bearer links: share them only with the intended applicant. Reissuing a link revokes the previous link.</p>
  </main>;
}
