import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Gift,
  Medal,
  Plus,
  RefreshCw,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Submission = {
  id: string;
  submitted_at: string;
};

type FunnelRow = {
  referrer_submission_id: string | null;
  promoter_id: string | null;
  referral_code: string;
  display_name: string;
  total_clicks: number;
  unique_visitors: number;
  registration_starts: number;
  submitted_registrations: number;
  pending_registrations: number;
  pending_payments: number;
  paid_referrals: number;
  activated_accounts: number;
  completed_training: number;
  certified_referrals: number;
};

type Promoter = {
  id: string;
  display_name: string;
  phone: string;
  code: string;
  active: boolean;
};

type ReferralPerson = {
  referral_code: string;
  referred_submission_id: string;
  display_name: string;
  email: string;
  submitted_at: string;
  payment_status: string;
  account_activated: boolean;
  completion_status: string;
  certificate_issued_at: string | null;
};

type RewardSettings = {
  base_commission_bps: number;
  base_qualification: string;
  rank_bonus_enabled: boolean;
  rank_basis: string;
  rank_bonus_bps: number[];
  minimum_rank_referrals: number;
  rank_bonus_finalized_at: string | null;
};

const money = (minor: number, currency = "NGN") =>
  (minor / 100).toLocaleString("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });

export function ProgramReferralPanel({
  formId,
  submissions: _submissions,
  fields: _fields,
  answers: _answers,
}: {
  formId: string;
  submissions: Submission[];
  fields: unknown[];
  answers: unknown[];
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<FunnelRow[]>([]);
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [rewardSettings, setRewardSettings] = useState<RewardSettings | null>(null);
  const [currency, setCurrency] = useState("NGN");
  const [earnedByCode, setEarnedByCode] = useState<Record<string, number>>({});
  const [paidOutByCode, setPaidOutByCode] = useState<Record<string, number>>({});
  const [promoterName, setPromoterName] = useState("");
  const [promoterPhone, setPromoterPhone] = useState("");
  const [creatingPromoter, setCreatingPromoter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState("");
  const [people, setPeople] = useState<ReferralPerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);

  const load = async () => {
    setLoading(true);
    const [
      funnelResult,
      promoterResult,
      rewardResult,
      earningsResult,
      payoutsResult,
      paymentSettingsResult,
    ] = await Promise.all([
      supabase.rpc("get_program_referral_funnel_admin", { p_form_id: formId }),
      supabase
        .from("program_referral_promoters")
        .select("id,display_name,phone,code,active")
        .eq("form_id", formId)
        .order("created_at", { ascending: false }),
      supabase
        .from("program_referral_reward_settings")
        .select("base_commission_bps,base_qualification,rank_bonus_enabled,rank_basis,rank_bonus_bps,minimum_rank_referrals,rank_bonus_finalized_at")
        .eq("form_id", formId)
        .maybeSingle(),
      supabase
        .from("program_referral_earnings")
        .select("referral_code,amount_minor,status")
        .eq("form_id", formId),
      supabase
        .from("program_referral_payouts")
        .select("referral_code,amount_minor,status")
        .eq("form_id", formId),
      supabase
        .from("program_payment_settings")
        .select("currency")
        .eq("form_id", formId)
        .maybeSingle(),
    ]);
    setLoading(false);

    if (funnelResult.error) {
      toast({
        title: "Referral funnel could not load",
        description: funnelResult.error.message,
        variant: "destructive",
      });
      return;
    }

    setRows(
      (funnelResult.data ?? []).map((row) => ({
        ...row,
        total_clicks: Number(row.total_clicks),
        unique_visitors: Number(row.unique_visitors),
        registration_starts: Number(row.registration_starts),
        submitted_registrations: Number(row.submitted_registrations),
        pending_registrations: Number(row.pending_registrations),
        pending_payments: Number(row.pending_payments),
        paid_referrals: Number(row.paid_referrals),
        activated_accounts: Number(row.activated_accounts),
        completed_training: Number(row.completed_training),
        certified_referrals: Number(row.certified_referrals),
      })),
    );
    setPromoters(promoterResult.data ?? []);
    setRewardSettings((rewardResult.data ?? null) as RewardSettings | null);
    setCurrency(paymentSettingsResult.data?.currency ?? "NGN");

    const earned: Record<string, number> = {};
    for (const entry of earningsResult.data ?? []) {
      if (entry.status === "reversed") continue;
      earned[entry.referral_code] =
        (earned[entry.referral_code] ?? 0) + Number(entry.amount_minor);
    }
    setEarnedByCode(earned);

    const paid: Record<string, number> = {};
    for (const payout of payoutsResult.data ?? []) {
      if (payout.status !== "paid") continue;
      paid[payout.referral_code] =
        (paid[payout.referral_code] ?? 0) + Number(payout.amount_minor);
    }
    setPaidOutByCode(paid);
  };

  useEffect(() => {
    void load();
  }, [formId]);

  const rankingMetric = (row: FunnelRow) => {
    switch (rewardSettings?.rank_basis) {
      case "paid":
        return row.paid_referrals;
      case "completed":
        return row.completed_training;
      default:
        return row.certified_referrals;
    }
  };

  const rankedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          rankingMetric(b) - rankingMetric(a) ||
          b.paid_referrals - a.paid_referrals ||
          b.unique_visitors - a.unique_visitors ||
          a.referral_code.localeCompare(b.referral_code),
      ),
    [rows, rewardSettings?.rank_basis],
  );

  const prizeLeaders = rankedRows
    .filter(
      (row) =>
        rankingMetric(row) >= (rewardSettings?.minimum_rank_referrals ?? 1),
    )
    .slice(0, rewardSettings?.rank_bonus_bps?.length ?? 3);

  const totals = rows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.total_clicks,
      visitors: acc.visitors + row.unique_visitors,
      registrations: acc.registrations + row.submitted_registrations,
      paid: acc.paid + row.paid_referrals,
      certified: acc.certified + row.certified_referrals,
    }),
    { clicks: 0, visitors: 0, registrations: 0, paid: 0, certified: 0 },
  );

  const createPromoter = async () => {
    if (!promoterName.trim() || !promoterPhone.trim()) {
      toast({
        title: "Name and phone are required",
        description: "They are used to generate the promoter referral code.",
        variant: "destructive",
      });
      return;
    }

    setCreatingPromoter(true);
    const { data, error } = await supabase.rpc("admin_create_referral_promoter", {
      p_form_id: formId,
      p_display_name: promoterName.trim(),
      p_phone: promoterPhone.trim(),
    });
    setCreatingPromoter(false);

    if (error || !data) {
      toast({
        title: "Promoter code could not be created",
        description: error?.message ?? "No promoter record returned.",
        variant: "destructive",
      });
      return;
    }

    setPromoterName("");
    setPromoterPhone("");
    toast({
      title: "Referral code created",
      description: `${data.display_name}: ${data.code}`,
    });
    await load();
  };

  const copyShortLink = async (code: string) => {
    const shortCode = code.replace(/^DYPGL-/i, "");
    const url = `${window.location.origin}/r/${encodeURIComponent(shortCode)}`;
    await navigator.clipboard.writeText(url);
    toast({
      title: "Referral link copied",
      description: url,
    });
  };

  const loadPeople = async (code: string) => {
    setSelectedCode(code);
    setLoadingPeople(true);
    const { data, error } = await supabase.rpc("get_program_referral_people_admin", {
      p_form_id: formId,
      p_referral_code: code,
    });
    setLoadingPeople(false);

    if (error) {
      toast({
        title: "Referred participants could not load",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setPeople((data ?? []) as ReferralPerson[]);
  };

  const recordPayout = async () => {
    const amountMinor = Math.round(Number(payoutAmount || 0) * 100);
    if (!selectedCode || amountMinor <= 0) {
      toast({
        title: "Enter a payout amount",
        description: "Choose a referral source and enter the amount paid.",
        variant: "destructive",
      });
      return;
    }

    setSavingPayout(true);
    const { error } = await supabase.rpc("admin_record_referral_payout", {
      p_form_id: formId,
      p_referral_code: selectedCode,
      p_amount_minor: amountMinor,
      p_status: "paid",
      p_reference: payoutReference.trim() || undefined,
      p_note: "Referral payout recorded from Admin referral dashboard",
    });
    setSavingPayout(false);

    if (error) {
      toast({
        title: "Payout could not be recorded",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setPayoutAmount("");
    setPayoutReference("");
    toast({
      title: "Payout recorded",
      description: "The participant's paid-out and outstanding balances will update automatically.",
    });
    await load();
  };

  return (
    <div className="space-y-5">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Promoter referral links
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Create a referral source before someone registers. Share the short /r/CODE link so clicks and conversion are tracked from the first visit.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={promoterName}
              onChange={(event) => setPromoterName(event.target.value)}
              placeholder="Promoter full name"
            />
            <Input
              value={promoterPhone}
              onChange={(event) => setPromoterPhone(event.target.value)}
              placeholder="Phone / WhatsApp number"
            />
            <Button onClick={() => void createPromoter()} disabled={creatingPromoter}>
              <Plus className="mr-2 h-4 w-4" />
              Create code
            </Button>
          </div>

          {promoters.length > 0 && (
            <div className="space-y-2">
              {promoters.map((promoter) => (
                <div
                  key={promoter.id}
                  className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{promoter.display_name}</p>
                    <p className="font-mono text-sm text-primary">{promoter.code}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copyShortLink(promoter.code)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy short link
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Total clicks", totals.clicks],
          ["Unique visitors", totals.visitors],
          ["Registrations", totals.registrations],
          ["Paid referrals", totals.paid],
          ["Certified", totals.certified],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {prizeLeaders.length > 0 && rewardSettings?.rank_bonus_enabled && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Current top referrers
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ranking basis: {rewardSettings.rank_basis}. Bonuses are {rewardSettings.rank_bonus_finalized_at ? "finalized" : "still projected"}.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {prizeLeaders.map((row, index) => (
              <div key={row.referral_code} className="rounded-xl border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge className="gap-1">
                    <Medal className="h-3 w-3" />
                    #{index + 1}
                  </Badge>
                  <span className="text-sm font-semibold text-primary">
                    +{((rewardSettings.rank_bonus_bps[index] ?? 0) / 100).toFixed(1)}%
                  </span>
                </div>
                <p className="mt-3 font-semibold">{row.display_name}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{row.referral_code}</p>
                <p className="mt-3 text-2xl font-bold">{rankingMetric(row)}</p>
                <p className="text-xs text-muted-foreground">
                  qualifying {rewardSettings.rank_basis} referrals
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Referral funnel & earnings
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Click a referral source to inspect the people behind its numbers and record payouts.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rankedRows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No referral activity yet.
            </div>
          ) : (
            <div className="space-y-3">
              {rankedRows.map((row, index) => {
                const earned = earnedByCode[row.referral_code] ?? 0;
                const paidOut = paidOutByCode[row.referral_code] ?? 0;
                return (
                  <button
                    type="button"
                    key={row.referral_code}
                    onClick={() => void loadPeople(row.referral_code)}
                    className="w-full rounded-xl border p-4 text-left transition-colors hover:border-primary/40"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">#{index + 1}</span>
                          <span className="font-medium">{row.display_name}</span>
                          <Badge variant="outline">{row.referral_code}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">Clicks {row.total_clicks}</Badge>
                          <Badge variant="outline">Unique {row.unique_visitors}</Badge>
                          <Badge variant="outline">Started {row.registration_starts}</Badge>
                          <Badge variant="outline">Incomplete {row.pending_registrations}</Badge>
                          <Badge variant="outline">Submitted {row.submitted_registrations}</Badge>
                          <Badge variant="outline">Pending pay {row.pending_payments}</Badge>
                          <Badge variant="outline">Paid {row.paid_referrals}</Badge>
                          <Badge variant="outline">Activated {row.activated_accounts}</Badge>
                          <Badge variant="outline">Completed {row.completed_training}</Badge>
                          <Badge variant="outline">Certified {row.certified_referrals}</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Earned</p>
                          <p className="font-bold">{money(earned, currency)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Paid out</p>
                          <p className="font-bold">{money(paidOut, currency)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Outstanding</p>
                          <p className="font-bold text-primary">
                            {money(Math.max(earned - paidOut, 0), currency)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCode && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Referral detail · {selectedCode}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Individual participant progression is visible only to Admin.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void copyShortLink(selectedCode)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Copy link
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {loadingPeople ? (
              <p className="text-sm text-muted-foreground">Loading referred participants…</p>
            ) : people.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No completed registration is attributed to this code yet.
              </div>
            ) : (
              <div className="space-y-2">
                {people.map((person) => (
                  <div
                    key={person.referred_submission_id}
                    className="grid gap-3 rounded-xl border p-3 md:grid-cols-[1.4fr_1fr_1fr]"
                  >
                    <div>
                      <p className="font-medium">{person.display_name}</p>
                      <p className="text-xs text-muted-foreground">{person.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(person.submitted_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Payment: {person.payment_status}</Badge>
                      <Badge variant="outline">
                        {person.account_activated ? "Account active" : "No account yet"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{person.completion_status}</Badge>
                      <Badge variant={person.certificate_issued_at ? "secondary" : "outline"}>
                        {person.certificate_issued_at ? "Certified" : "Not certified"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border bg-muted/10 p-4">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" />
                <p className="font-semibold">Record payout</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Record a full or partial payout. This does not change the earnings ledger; it reduces the displayed outstanding balance.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payoutAmount}
                  onChange={(event) => setPayoutAmount(event.target.value)}
                  placeholder="Amount (NGN)"
                />
                <Input
                  value={payoutReference}
                  onChange={(event) => setPayoutReference(event.target.value)}
                  placeholder="Payment reference / note"
                />
                <Button onClick={() => void recordPayout()} disabled={savingPayout}>
                  {savingPayout ? "Saving…" : "Record paid"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
