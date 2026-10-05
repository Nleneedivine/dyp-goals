import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  Gift,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Campaign = {
  id: string;
  form_id: string;
  sponsor_name: string;
  name: string;
  code: string;
  active: boolean;
  questions_enabled: boolean;
  approval_required: boolean;
  seat_limit: number | null;
  seat_value_minor: number;
  participant_amount_minor: number;
  currency: string;
  referral_commission_mode: string;
  count_for_referral_leaderboard: boolean;
};

type Question = {
  id: string;
  campaign_id: string;
  label: string;
  helper_text: string;
  field_type: string;
  options: unknown;
  required: boolean;
  display_order: number;
  active: boolean;
  archived_at: string | null;
};

type Claim = {
  claim_id: string;
  submission_id: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  rejection_reason: string;
  covered_amount_minor: number;
  participant_amount_minor: number;
  currency: string;
  participant_name: string;
  participant_email: string;
  answers: Record<string, unknown>;
};

type Analytics = {
  seatLimit?: number | null;
  pending?: number;
  approved?: number;
  rejected?: number;
  revoked?: number;
  claimed?: number;
  remaining?: number | null;
  approvedSeatValueMinor?: number;
  potentialSeatValueMinor?: number;
  accountsActivated?: number;
  trainingCompleted?: number;
  certified?: number;
  currency?: string;
};

const money = (minor = 0, currency = "NGN") =>
  (minor / 100).toLocaleString("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

export default function AdminSponsorships() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newHelper, setNewHelper] = useState("");
  const [newType, setNewType] = useState("text");
  const [newOptions, setNewOptions] = useState("");
  const [newRequired, setNewRequired] = useState(true);

  const loadCampaigns = async () => {
    const { data, error } = await supabase
      .from("program_sponsorship_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Sponsorship campaigns could not load", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Campaign[];
    setCampaigns(rows);
    const next = selectedId || rows.find((item) => item.code === "DITGOALS26")?.id || rows[0]?.id || "";
    setSelectedId(next);
    setLoading(false);
  };

  const loadSelected = async (campaignId: string) => {
    if (!campaignId) return;
    setLoading(true);
    const [campaignResult, questionsResult, claimsResult, analyticsResult] = await Promise.all([
      supabase.from("program_sponsorship_campaigns").select("*").eq("id", campaignId).single(),
      supabase
        .from("program_sponsorship_questions")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("display_order"),
      supabase.rpc("get_sponsorship_claims_admin", { p_campaign_id: campaignId }),
      supabase.rpc("get_sponsorship_analytics_admin", { p_campaign_id: campaignId }),
    ]);
    setLoading(false);

    const error = campaignResult.error ?? questionsResult.error ?? claimsResult.error ?? analyticsResult.error;
    if (error) {
      toast({ title: "Sponsorship details could not load", description: error.message, variant: "destructive" });
      return;
    }

    setCampaign(campaignResult.data as Campaign);
    setQuestions((questionsResult.data ?? []) as Question[]);
    setClaims((claimsResult.data ?? []) as Claim[]);
    setAnalytics((analyticsResult.data ?? null) as Analytics | null);
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedId) void loadSelected(selectedId);
  }, [selectedId]);

  const shortLink = useMemo(
    () => campaign ? `${window.location.origin}/s/${campaign.code}` : "",
    [campaign],
  );

  const saveCampaign = async () => {
    if (!campaign) return;
    setSaving(true);
    const { error } = await supabase
      .from("program_sponsorship_campaigns")
      .update({
        sponsor_name: campaign.sponsor_name.trim() || "DIT",
        name: campaign.name.trim(),
        code: campaign.code.trim().toUpperCase(),
        active: campaign.active,
        questions_enabled: campaign.questions_enabled,
        approval_required: campaign.approval_required,
        seat_limit: campaign.seat_limit,
        seat_value_minor: campaign.seat_value_minor,
        participant_amount_minor: campaign.participant_amount_minor,
        referral_commission_mode: campaign.referral_commission_mode,
        count_for_referral_leaderboard: campaign.count_for_referral_leaderboard,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
    setSaving(false);

    if (error) {
      toast({ title: "Campaign could not be saved", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "DIT sponsorship campaign saved" });
    await loadCampaigns();
    await loadSelected(campaign.id);
  };

  const addQuestion = async () => {
    if (!campaign || newLabel.trim().length < 3) return;
    const options = ["dropdown", "radio", "multi_select"].includes(newType)
      ? newOptions.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

    const { error } = await supabase.from("program_sponsorship_questions").insert({
      campaign_id: campaign.id,
      label: newLabel.trim(),
      helper_text: newHelper.trim(),
      field_type: newType,
      options,
      required: newRequired,
      display_order: (questions.at(-1)?.display_order ?? 0) + 10,
      active: true,
    });

    if (error) {
      toast({ title: "Question could not be added", description: error.message, variant: "destructive" });
      return;
    }

    setNewLabel("");
    setNewHelper("");
    setNewOptions("");
    setNewType("text");
    setNewRequired(true);
    await loadSelected(campaign.id);
  };

  const archiveQuestion = async (question: Question) => {
    if (!campaign) return;
    const { error } = await supabase
      .from("program_sponsorship_questions")
      .update({
        active: false,
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", question.id);
    if (error) {
      toast({ title: "Question could not be archived", description: error.message, variant: "destructive" });
      return;
    }
    await loadSelected(campaign.id);
  };

  const review = async (claimId: string, approve: boolean) => {
    if (!campaign) return;
    setReviewingId(claimId);
    const { error } = await supabase.rpc("admin_review_sponsorship_claim", {
      p_claim_id: claimId,
      p_approve: approve,
      p_reason: approve ? "" : (rejectReason[claimId] ?? ""),
    });
    setReviewingId("");

    if (error) {
      toast({ title: "Sponsorship request could not be updated", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: approve ? "DIT sponsorship approved" : "DIT sponsorship rejected",
      description: approve
        ? "The participant now has ₦0 sponsored access and can use program access once their account is linked."
        : "The registration remains intact and the participant can continue with regular payment.",
    });
    await loadSelected(campaign.id);
  };

  if (loading && !campaigns.length) {
    return <main className="min-h-screen pt-28 grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-28">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Admin · Funding</p>
            <h1 className="mt-2 text-3xl font-bold">Sponsorships & Seats</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Manage DIT-sponsored GOALS seats separately from participant payments while preserving registration, completion and certificate analytics.
            </p>
          </div>
          <Button asChild variant="outline"><Link to="/admin"><ArrowLeft className="mr-2 h-4 w-4" />Back to Admin</Link></Button>
        </div>

        {campaigns.length > 1 && (
          <Card><CardContent className="pt-6">
            <Label>Campaign</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>{campaigns.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </CardContent></Card>
        )}

        {campaign && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Claimed", analytics?.claimed ?? 0],
                ["Pending", analytics?.pending ?? 0],
                ["Approved", analytics?.approved ?? 0],
                ["Completed", analytics?.trainingCompleted ?? 0],
                ["Certified", analytics?.certified ?? 0],
              ].map(([label, value]) => (
                <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></CardContent></Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle>DIT sponsorship campaign</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Sponsor</Label><Input value={campaign.sponsor_name} onChange={(e) => setCampaign({ ...campaign, sponsor_name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Campaign name</Label><Input value={campaign.name} onChange={(e) => setCampaign({ ...campaign, name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Sponsorship code</Label><Input value={campaign.code} onChange={(e) => setCampaign({ ...campaign, code: e.target.value.toUpperCase() })} /></div>
                  <div className="space-y-2"><Label>Seat limit</Label><Input type="number" min="0" value={campaign.seat_limit ?? ""} onChange={(e) => setCampaign({ ...campaign, seat_limit: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                  <div className="space-y-2"><Label>Seat value (NGN)</Label><Input type="number" min="0" value={campaign.seat_value_minor / 100} onChange={(e) => setCampaign({ ...campaign, seat_value_minor: Math.round(Number(e.target.value || 0) * 100) })} /></div>
                  <div className="space-y-2"><Label>Participant contribution (NGN)</Label><Input type="number" min="0" value={campaign.participant_amount_minor / 100} onChange={(e) => setCampaign({ ...campaign, participant_amount_minor: Math.round(Number(e.target.value || 0) * 100) })} /></div>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-sm font-semibold">Sponsored link</p>
                  <p className="mt-1 break-all font-mono text-sm text-primary">{shortLink}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void navigator.clipboard.writeText(shortLink)}><Copy className="mr-2 h-4 w-4" />Copy DIT link</Button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="flex items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">Campaign active</p><p className="text-xs text-muted-foreground">Allow new sponsored claims.</p></div><Switch checked={campaign.active} onCheckedChange={(checked) => setCampaign({ ...campaign, active: checked })} /></label>
                  <label className="flex items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">DIT question segment</p><p className="text-xs text-muted-foreground">Show campaign-only questions.</p></div><Switch checked={campaign.questions_enabled} onCheckedChange={(checked) => setCampaign({ ...campaign, questions_enabled: checked })} /></label>
                  <label className="flex items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">Admin verification</p><p className="text-xs text-muted-foreground">Code alone never grants access.</p></div><Switch checked={campaign.approval_required} onCheckedChange={(checked) => setCampaign({ ...campaign, approval_required: checked })} /></label>
                </div>

                <div className="rounded-xl border bg-muted/15 p-4">
                  <p className="font-medium">Referral behavior</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Commission on sponsored seats</Label><Select value={campaign.referral_commission_mode} onValueChange={(value) => setCampaign({ ...campaign, referral_commission_mode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No commission</SelectItem><SelectItem value="participant_amount">Participant-paid amount</SelectItem><SelectItem value="seat_value">Sponsored seat value</SelectItem></SelectContent></Select></div>
                    <label className="flex items-center justify-between gap-3 rounded-xl border bg-background p-4"><div><p className="font-medium">Count for leaderboard</p><p className="text-xs text-muted-foreground">Default is off for DIT complimentary seats.</p></div><Switch checked={campaign.count_for_referral_leaderboard} onCheckedChange={(checked) => setCampaign({ ...campaign, count_for_referral_leaderboard: checked })} /></label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => void saveCampaign()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save campaign</Button>
                  <Badge variant="outline">Approved seat value: {money(analytics?.approvedSeatValueMinor ?? 0, analytics?.currency)}</Badge>
                  {analytics?.remaining !== null && analytics?.remaining !== undefined && <Badge variant="outline">Seats remaining: {analytics.remaining}</Badge>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>DIT-specific registration questions</CardTitle><p className="text-sm text-muted-foreground">Archive questions instead of deleting them so historical responses remain available for analytics.</p></CardHeader>
              <CardContent className="space-y-4">
                {questions.filter((q) => !q.archived_at).map((question) => (
                  <div key={question.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div><p className="font-medium">{question.label}</p><p className="mt-1 text-xs text-muted-foreground">{question.field_type} · {question.required ? "Required" : "Optional"}</p>{question.helper_text && <p className="mt-2 text-sm text-muted-foreground">{question.helper_text}</p>}</div>
                    <Button variant="outline" size="sm" onClick={() => void archiveQuestion(question)}><X className="mr-2 h-4 w-4" />Archive</Button>
                  </div>
                ))}

                <div className="rounded-2xl border border-dashed p-4">
                  <p className="font-semibold">Add question</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Question label" />
                    <Select value={newType} onValueChange={setNewType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["text","textarea","dropdown","radio","multi_select","checkbox","number"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
                    <Input value={newHelper} onChange={(e) => setNewHelper(e.target.value)} placeholder="Helper text (optional)" />
                    {["dropdown","radio","multi_select"].includes(newType) && <Input value={newOptions} onChange={(e) => setNewOptions(e.target.value)} placeholder="Options, comma separated" />}
                  </div>
                  <div className="mt-3 flex items-center gap-3"><Switch checked={newRequired} onCheckedChange={setNewRequired} /><Label>Required</Label></div>
                  <Button className="mt-3" variant="outline" onClick={() => void addQuestion()}><Plus className="mr-2 h-4 w-4" />Add question</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3"><div><CardTitle>Sponsored applicants</CardTitle><p className="mt-1 text-sm text-muted-foreground">DIT code use creates eligibility; Admin approval grants the sponsored seat.</p></div><Button variant="outline" size="sm" onClick={() => void loadSelected(campaign.id)}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
              </CardHeader>
              <CardContent className="space-y-3">
                {claims.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No sponsored registrations yet.</p> : claims.map((claim) => (
                  <div key={claim.claim_id} className="rounded-2xl border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{claim.participant_name}</p><Badge variant={claim.status === "approved" ? "secondary" : "outline"}>{claim.status}</Badge></div><p className="text-sm text-muted-foreground">{claim.participant_email}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(claim.requested_at).toLocaleString()}</p></div>
                      <p className="text-sm font-semibold">Seat value {money(claim.covered_amount_minor, claim.currency)} · participant {money(claim.participant_amount_minor, claim.currency)}</p>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {questions.map((question) => {
                        const raw = claim.answers?.[question.id];
                        const value = Array.isArray(raw) ? raw.join(", ") : raw === undefined || raw === null ? "—" : String(raw);
                        return <div key={question.id} className="rounded-xl bg-muted/25 p-3"><p className="text-xs font-medium text-muted-foreground">{question.label}</p><p className="mt-1 text-sm">{value}</p></div>;
                      })}
                    </div>

                    {claim.status === "pending" && (
                      <div className="mt-4 border-t pt-4">
                        <Textarea value={rejectReason[claim.claim_id] ?? ""} onChange={(e) => setRejectReason((current) => ({ ...current, [claim.claim_id]: e.target.value }))} placeholder="Reason if rejecting (optional)" rows={2} />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button onClick={() => void review(claim.claim_id, true)} disabled={reviewingId === claim.claim_id}>{reviewingId === claim.claim_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Approve sponsored seat</Button>
                          <Button variant="outline" onClick={() => void review(claim.claim_id, false)} disabled={reviewingId === claim.claim_id}><X className="mr-2 h-4 w-4" />Reject</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
