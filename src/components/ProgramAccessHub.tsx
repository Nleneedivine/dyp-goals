import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Gift,
  Loader2,
  RefreshCw,
  Share2,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type ReferralDashboard = {
  available?: boolean;
  formId?: string;
  formSlug?: string;
  formTitle?: string;
  enrollmentStatus?: string;
  paymentStatus?: string;
  whatsappGroupUrl?: string;
  referralCode?: string;
  shortCode?: string;
  currency?: string;
  totalClicks?: number;
  uniqueVisitors?: number;
  registrationStarts?: number;
  submittedRegistrations?: number;
  pendingRegistrations?: number;
  pendingPayments?: number;
  paidReferrals?: number;
  activatedAccounts?: number;
  completedTraining?: number;
  certifiedReferrals?: number;
  currentRank?: number | null;
  rankQualifyingCount?: number;
  baseCommissionBps?: number;
  baseQualification?: string;
  rankBasis?: string;
  rankBonusFinalized?: boolean;
  projectedRankBonusMinor?: number;
  baseEarningsMinor?: number;
  finalizedRankBonusMinor?: number;
  totalEarnedMinor?: number;
  paidOutMinor?: number;
  outstandingMinor?: number;
};

const money = (minor = 0, currency = "NGN") =>
  (minor / 100).toLocaleString("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });

export function ProgramAccessHub() {
  const { toast } = useToast();
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: dashboard, error } = await supabase.rpc(
      "get_current_user_referral_dashboard",
    );
    setLoading(false);

    if (error) {
      console.error("Program access dashboard could not load:", error);
      return;
    }

    setData((dashboard ?? null) as ReferralDashboard | null);
  };

  useEffect(() => {
    void load();
  }, []);

  const referralLink = useMemo(() => {
    if (!data?.shortCode) return "";
    return `${window.location.origin}/r/${encodeURIComponent(data.shortCode)}`;
  }, [data?.shortCode]);

  const copyReferralLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    toast({
      title: "Referral link copied",
      description: "Anyone who registers through this link will be attributed to you.",
    });
  };

  const shareReferralLink = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: data?.formTitle ?? "DYP GOALS",
        text: "Register for DYP GOALS using my referral link.",
        url: referralLink,
      });
      return;
    }
    await copyReferralLink();
  };

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="flex min-h-36 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.available) return null;

  const currency = data.currency ?? "NGN";
  const projectedBonus = Number(data.projectedRankBonusMinor ?? 0);
  const finalizedBonus = Number(data.finalizedRankBonusMinor ?? 0);

  return (
    <Card data-tour="program-access" className="overflow-hidden border-primary/20">
      <CardHeader className="bg-primary/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Program access
            </p>
            <CardTitle className="mt-1 text-xl">
              {data.formTitle ?? "My GOALS Program Hub"}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              WhatsApp access, referral performance and earnings stay here after registration.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border p-4">
            <p className="text-sm font-semibold">WhatsApp group</p>
            {data.whatsappGroupUrl ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your payment is confirmed. You can reopen the program WhatsApp group anytime.
                </p>
                <Button asChild className="mt-4 w-full sm:w-auto">
                  <a href={data.whatsappGroupUrl} target="_blank" rel="noreferrer">
                    Join / open WhatsApp group
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </>
            ) : (
              <div className="mt-2">
                <Badge variant="outline">
                  Payment: {data.paymentStatus ?? "unpaid"}
                </Badge>
                <p className="mt-2 text-sm text-muted-foreground">
                  WhatsApp access appears automatically after payment is confirmed.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-4">
            <p className="text-sm font-semibold">Your referral link</p>
            <p className="mt-2 break-all font-mono text-sm text-primary">
              {data.referralCode}
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {referralLink}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => void copyReferralLink()}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => void shareReferralLink()}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <p className="font-semibold">Referral funnel</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Unique visitors", data.uniqueVisitors ?? 0],
              ["Registrations", data.submittedRegistrations ?? 0],
              ["Paid referrals", data.paidReferrals ?? 0],
              ["Certified", data.certifiedReferrals ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Clicks: {data.totalClicks ?? 0}</Badge>
            <Badge variant="outline">Started: {data.registrationStarts ?? 0}</Badge>
            <Badge variant="outline">Incomplete: {data.pendingRegistrations ?? 0}</Badge>
            <Badge variant="outline">Payment pending: {data.pendingPayments ?? 0}</Badge>
            <Badge variant="outline">Accounts activated: {data.activatedAccounts ?? 0}</Badge>
            <Badge variant="outline">Training completed: {data.completedTraining ?? 0}</Badge>
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                <p className="font-semibold">Referral earnings</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Base commission: {((data.baseCommissionBps ?? 0) / 100).toFixed(1)}% · qualifies on {data.baseQualification ?? "paid"} referrals.
              </p>
            </div>
            {data.currentRank ? (
              <Badge className="gap-1">
                <Trophy className="h-3 w-3" />
                Current rank #{data.currentRank}
              </Badge>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Base earned</p>
              <p className="text-xl font-bold">{money(Number(data.baseEarningsMinor ?? 0), currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {data.rankBonusFinalized ? "Rank bonus" : "Projected rank bonus"}
              </p>
              <p className="text-xl font-bold text-primary">
                {money(data.rankBonusFinalized ? finalizedBonus : projectedBonus, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Confirmed earnings</p>
              <p className="text-xl font-bold">{money(Number(data.totalEarnedMinor ?? 0), currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding payout</p>
              <p className="text-xl font-bold">{money(Number(data.outstandingMinor ?? 0), currency)}</p>
              <p className="text-xs text-muted-foreground">
                Paid out: {money(Number(data.paidOutMinor ?? 0), currency)}
              </p>
            </div>
          </div>

          {!data.rankBonusFinalized && projectedBonus > 0 && (
            <p className="mt-4 rounded-lg bg-primary/10 p-3 text-xs text-muted-foreground">
              Rank bonuses remain projected until Admin finalizes the leaderboard. Your current position can still change as more referrals qualify.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
