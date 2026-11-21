import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, RefreshCw, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PortalState = {
  valid: boolean;
  submissionId?: string;
  sessionToken?: string;
  submittedAt?: string;
  paymentStatus?: string;
  fundingType?: "self_paid" | "sponsored";
  sponsorshipStatus?: "pending" | "approved" | "rejected" | "revoked" | null;
  admissionStatus?: string | null;
  admissionReason?: string | null;
};

type PaymentState = {
  available?: boolean;
  amountMinor?: number;
  currency?: string;
  manualEnabled?: boolean;
  paystackEnabled?: boolean;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  manualInstructions?: string;
  paymentStatus?: "unpaid" | "pending" | "paid" | "rejected";
  fundingType?: "self_paid" | "sponsored";
  sponsorshipStatus?: "pending" | "approved" | "rejected" | "revoked" | null;
  financiallySatisfied?: boolean;
  proofUploaded?: boolean;
  paymentReference?: string | null;
  whatsappGroupUrl?: string;
  sponsorName?: string | null;
  rejectionReason?: string | null;
  sponsorshipRejectionReason?: string | null;
};

const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export default function ApplicantPortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [portal, setPortal] = useState<PortalState | null>(null);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    if (!token || token.length !== 64) {
      setPortal({ valid: false });
      setLoading(false);
      return;
    }
    try {
      const tokenHash = await hashToken(token);
      const { data, error: portalError } = await (supabase as any).rpc("get_applicant_portal_state", { p_token_hash: tokenHash });
      if (portalError) throw portalError;
      const resolved = data as PortalState | null;
      if (!resolved?.valid || !resolved.sessionToken) {
        setPortal({ valid: false });
        setPayment(null);
        return;
      }
      setPortal(resolved);
      const { data: paymentData, error: paymentError } = await supabase.rpc("get_program_payment_state", {
        p_session_token: resolved.sessionToken,
      });
      if (paymentError) throw paymentError;
      setPayment((paymentData ?? null) as PaymentState | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The application could not be loaded.");
      setPortal({ valid: false });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const submitProof = async () => {
    if (!portal?.sessionToken || !proof || reference.trim().length < 3) {
      setError("Enter your transfer reference and choose your payment proof.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(proof.type) || proof.size > 8 * 1024 * 1024 || proof.size < 20 * 1024) {
      setError("Choose a clear JPG, PNG or WebP image between 20 KB and 8 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data: upload, error: uploadError } = await supabase.functions.invoke("program-payment", {
        body: { action: "prepare-proof-upload", sessionToken: portal.sessionToken, fileName: proof.name, contentType: proof.type },
      });
      if (uploadError || upload?.error || !upload?.path || !upload?.token) throw new Error(upload?.error ?? uploadError?.message ?? "Could not prepare the proof upload.");
      const { error: storageError } = await supabase.storage.from("payment-proofs").uploadToSignedUrl(upload.path, upload.token, proof, { contentType: proof.type });
      if (storageError) throw storageError;
      const { data, error: submitError } = await supabase.rpc("submit_manual_program_payment_with_proof", {
        p_session_token: portal.sessionToken,
        p_manual_reference: reference.trim(),
        p_proof_path: upload.path,
        p_proof_content_type: proof.type,
      });
      if (submitError) throw submitError;
      setPayment((data ?? null) as PaymentState | null);
      setProof(null);
      setReference("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment proof could not be submitted.");
    } finally {
      setBusy(false);
    }
  };

  const startPaystack = async () => {
    if (!portal?.sessionToken) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("program-payment", {
        body: { action: "initialize", sessionToken: portal.sessionToken, returnUrl: window.location.href },
      });
      if (invokeError || data?.error || !data?.authorizationUrl) throw new Error(data?.error ?? invokeError?.message ?? "Payment could not be started.");
      window.location.assign(data.authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be started.");
      setBusy(false);
    }
  };

  if (loading) return <main className="page-shell flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /><span className="ml-3 text-muted-foreground">Loading your application…</span></main>;
  if (!portal?.valid) return <main className="page-shell max-w-2xl"><Card><CardContent className="p-8 text-center"><AlertCircle className="mx-auto h-10 w-10 text-destructive" /><h1 className="mt-4 text-2xl font-bold">Portal link unavailable</h1><p className="mt-2 text-muted-foreground">This link is invalid, expired or has been replaced. Contact the programme administrator and ask for a new applicant portal link.</p>{error && <p className="mt-3 text-sm text-destructive">{error}</p>}</CardContent></Card></main>;

  const money = typeof payment?.amountMinor === "number" ? new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currency || "NGN" }).format(payment.amountMinor / 100) : null;
  const admissionLabel = portal.admissionStatus === "admitted" ? "Admitted" : portal.admissionStatus === "rejected" ? "Not admitted" : portal.admissionStatus === "awaiting_admission" ? "Awaiting admission decision" : "Funding verification pending";

  return <main className="page-shell max-w-3xl space-y-5">
    <div><p className="text-sm font-medium uppercase tracking-wide text-primary">DYP GOALS</p><h1 className="mt-2 text-3xl font-bold">Applicant portal</h1><p className="mt-2 text-muted-foreground">Your original application and its funding and admission progress.</p></div>
    <Card><CardHeader><CardTitle>Application progress</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3">
      <div><p className="text-sm text-muted-foreground">Submitted</p><p className="font-medium">{portal.submittedAt ? new Date(portal.submittedAt).toLocaleDateString() : "Received"}</p></div>
      <div><p className="text-sm text-muted-foreground">Funding</p><p className="font-medium capitalize">{payment?.paymentStatus ?? portal.paymentStatus ?? "Pending"}</p>{portal.sponsorshipStatus && <p className="text-xs text-muted-foreground">Sponsorship: {portal.sponsorshipStatus}</p>}</div>
      <div><p className="text-sm text-muted-foreground">Admission</p><p className="font-medium">{admissionLabel}</p></div>
    </CardContent></Card>
    {portal.admissionReason && <Card><CardContent className="p-5"><p className="font-medium">Admission update</p><p className="mt-1 text-sm text-muted-foreground">{portal.admissionReason}</p></CardContent></Card>}
    {payment?.available && payment.paymentStatus !== "paid" && payment.sponsorshipStatus !== "approved" && <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Complete your funding step</CardTitle></CardHeader><CardContent className="space-y-4">
      {money && <p className="text-2xl font-bold">{money}</p>}
      {payment.manualInstructions && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{payment.manualInstructions}</p>}
      {payment.bankName && <div className="rounded-lg border p-4 text-sm"><p><strong>Bank:</strong> {payment.bankName}</p><p><strong>Account name:</strong> {payment.accountName}</p><p><strong>Account number:</strong> {payment.accountNumber}</p></div>}
      {payment.rejectionReason && <p className="text-sm text-destructive">Previous proof was not approved: {payment.rejectionReason}</p>}{payment.proofUploaded && payment.paymentStatus === "pending" && <p className="text-sm text-muted-foreground">Your proof is awaiting review. You can submit a replacement below if needed.</p>}{payment.sponsorshipRejectionReason && <p className="text-sm text-destructive">Sponsorship update: {payment.sponsorshipRejectionReason}</p>}
      {payment.manualEnabled && <div className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Submit or replace transfer proof</h2><div className="space-y-2"><Label htmlFor="portal-reference">Transfer reference</Label><Input id="portal-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Enter your bank transfer reference" /></div><div className="space-y-2"><Label htmlFor="portal-proof">Payment proof (JPG, PNG or WebP)</Label><Input id="portal-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProof(event.target.files?.[0] ?? null)} /></div><Button onClick={() => void submitProof()} disabled={busy || !proof}><Upload className="mr-2 h-4 w-4" />Submit payment proof</Button></div>}
      {payment.paystackEnabled && <Button variant="outline" onClick={() => void startPaystack()} disabled={busy}>Pay securely online</Button>}
    </CardContent></Card>}
    {payment?.paymentStatus === "paid" || payment?.sponsorshipStatus === "approved" ? <Card><CardContent className="flex items-center gap-3 p-5"><CheckCircle2 className="h-6 w-6 text-primary" /><div><p className="font-semibold">Funding verified</p><p className="text-sm text-muted-foreground">{portal.admissionStatus === "admitted" ? "Your admission has been confirmed. Follow the programme instructions shared by the DYP GOALS team." : "Your application is now awaiting the separate admission decision. Funding approval alone does not grant programme access."}</p></div></CardContent></Card> : null}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end"><Button variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh status</Button></div>
    <p className="text-xs text-muted-foreground">Keep this private link safe. Anyone who has it may access this application. If you lose access, contact the programme administrator for a replacement link.</p>
  </main>;
}
