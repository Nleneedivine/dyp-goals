import { useEffect, useState } from "react";
import { CalendarDays, CreditCard, Gift, Save, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatProgramDate } from "@/hooks/use-platform-configuration";

type PaymentSettings = {
  form_id: string;
  amount_minor: number;
  currency: string;
  manual_enabled: boolean;
  paystack_enabled: boolean;
  bank_name: string;
  account_name: string;
  account_number: string;
  manual_instructions: string;
  whatsapp_group_url: string;
};


type ProgramFormOption = {
  id: string;
  title: string;
  slug: string;
  status: string;
};

type RewardSettings = {
  form_id: string;
  base_commission_bps: number;
  base_qualification: "paid" | "completed" | "certified";
  rank_bonus_enabled: boolean;
  rank_basis: "paid" | "completed" | "certified";
  rank_bonus_bps: number[];
  minimum_rank_referrals: number;
  reward_start_at: string;
  reward_end_at: string;
  rank_bonus_finalized_at: string | null;
};

const defaultRewards: RewardSettings = {
  form_id: "",
  base_commission_bps: 1000,
  base_qualification: "paid",
  rank_bonus_enabled: true,
  rank_basis: "certified",
  rank_bonus_bps: [500, 300, 200],
  minimum_rank_referrals: 1,
  reward_start_at: "",
  reward_end_at: "",
  rank_bonus_finalized_at: null,
};

const defaultPayment: PaymentSettings = {
  form_id: "",
  amount_minor: 500000,
  currency: "NGN",
  manual_enabled: true,
  paystack_enabled: false,
  bank_name: "",
  account_name: "",
  account_number: "",
  manual_instructions: "",
  whatsapp_group_url: "",
};

export default function AdminProgramSettings() {
  const [startDate, setStartDate] = useState("2027-01-08");
  const [forms, setForms] = useState<ProgramFormOption[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [payment, setPayment] = useState<PaymentSettings>(defaultPayment);
  const [rewards, setRewards] = useState<RewardSettings>(defaultRewards);
  const [saving, setSaving] = useState(false);
  const [finalizingRank, setFinalizingRank] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const [{ data: config }, { data: formRows }] = await Promise.all([
        supabase
          .from("platform_configuration")
          .select("accountability_lab_start_date")
          .eq("id", "global")
          .maybeSingle(),
        supabase
          .from("program_forms")
          .select("id,title,slug,status")
          .order("created_at", { ascending: false }),
      ]);

      if (config?.accountability_lab_start_date) {
        setStartDate(config.accountability_lab_start_date);
      }

      const availableForms = (formRows ?? []) as ProgramFormOption[];
      setForms(availableForms);

      const defaultForm =
        availableForms.find((form) => form.slug === "goals-masterclass-2026") ??
        availableForms[0];

      if (defaultForm) {
        setSelectedFormId(defaultForm.id);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (!selectedFormId) return;

    const loadFormSettings = async () => {
      const [{ data: pay }, { data: reward }] = await Promise.all([
        supabase
          .from("program_payment_settings")
          .select("*")
          .eq("form_id", selectedFormId)
          .maybeSingle(),
        supabase
          .from("program_referral_reward_settings")
          .select("*")
          .eq("form_id", selectedFormId)
          .maybeSingle(),
      ]);

      setPayment(
        pay
          ? {
              form_id: pay.form_id,
              amount_minor: pay.amount_minor,
              currency: pay.currency,
              manual_enabled: pay.manual_enabled,
              paystack_enabled: pay.paystack_enabled,
              bank_name: pay.bank_name,
              account_name: pay.account_name,
              account_number: pay.account_number,
              manual_instructions: pay.manual_instructions,
              whatsapp_group_url: pay.whatsapp_group_url,
            }
          : { ...defaultPayment, form_id: selectedFormId },
      );

      setRewards(
        reward
          ? {
              form_id: reward.form_id,
              base_commission_bps: reward.base_commission_bps,
              base_qualification: reward.base_qualification as RewardSettings["base_qualification"],
              rank_bonus_enabled: reward.rank_bonus_enabled,
              rank_basis: reward.rank_basis as RewardSettings["rank_basis"],
              rank_bonus_bps: reward.rank_bonus_bps ?? [500, 300, 200],
              minimum_rank_referrals: reward.minimum_rank_referrals,
              reward_start_at: reward.reward_start_at ?? "",
              reward_end_at: reward.reward_end_at ?? "",
              rank_bonus_finalized_at: reward.rank_bonus_finalized_at,
            }
          : { ...defaultRewards, form_id: selectedFormId },
      );
    };

    void loadFormSettings();
  }, [selectedFormId]);

  const save = async () => {
    setSaving(true);

    const { error: configError } = await supabase
      .from("platform_configuration")
      .update({ accountability_lab_start_date: startDate })
      .eq("id", "global");

    let paymentError: { message: string } | null = null;
    let rewardError: { message: string } | null = null;

    if (!configError && payment.form_id) {
      const { error } = await supabase
        .from("program_payment_settings")
        .upsert({
          ...payment,
          currency: "NGN",
          updated_at: new Date().toISOString(),
        });
      paymentError = error;
    }

    if (!configError && !paymentError && rewards.form_id) {
      const { error } = await supabase
        .from("program_referral_reward_settings")
        .upsert({
          form_id: rewards.form_id,
          base_commission_bps: rewards.base_commission_bps,
          base_qualification: rewards.base_qualification,
          rank_bonus_enabled: rewards.rank_bonus_enabled,
          rank_basis: rewards.rank_basis,
          rank_bonus_bps: rewards.rank_bonus_bps,
          minimum_rank_referrals: rewards.minimum_rank_referrals,
          reward_start_at: rewards.reward_start_at || null,
          reward_end_at: rewards.reward_end_at || null,
          rank_bonus_finalized_at: rewards.rank_bonus_finalized_at,
          updated_at: new Date().toISOString(),
        });
      rewardError = error;

      if (!error) {
        await supabase.rpc("admin_recalculate_program_referral_rewards", {
          p_form_id: rewards.form_id,
        });
      }
    }

    setSaving(false);
    const error = configError ?? paymentError ?? rewardError;
    if (error) {
      toast({
        title: "Program settings could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Program settings saved",
      description: "Accountability Lab, payments, WhatsApp access and referral reward settings are updated.",
    });
  };

  const finalizeRankBonuses = async () => {
    if (!rewards.form_id || rewards.rank_bonus_finalized_at) return;

    setFinalizingRank(true);
    const { data, error } = await supabase.rpc(
      "admin_finalize_program_referral_rank_bonuses",
      { p_form_id: rewards.form_id },
    );
    setFinalizingRank(false);

    if (error) {
      toast({
        title: "Leaderboard bonuses could not be finalized",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setRewards((current) => ({
      ...current,
      rank_bonus_finalized_at: new Date().toISOString(),
    }));

    toast({
      title: "Leaderboard bonuses finalized",
      description: `${(data as { bonusEntriesCreated?: number } | null)?.bonusEntriesCreated ?? 0} rank-bonus earning entries were created.`,
    });
  };

  const amountNaira = payment.amount_minor / 100;

  return (
    <main className="page-shell max-w-4xl">
      <div className="mb-8">
        <Button asChild variant="ghost" className="mb-3">
          <Link to="/admin">← Back to admin</Link>
        </Button>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Program operations
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Program settings</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Configure shared program dates, payment methods and paid-participant access.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Program / registration form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="program-form-select">Configure settings for</Label>
            <Select value={selectedFormId} onValueChange={setSelectedFormId}>
              <SelectTrigger id="program-form-select">
                <SelectValue placeholder="Choose a program" />
              </SelectTrigger>
              <SelectContent>
                {forms.map((form) => (
                  <SelectItem key={form.id} value={form.id}>
                    {form.title} · {form.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Payment and referral-reward rules are stored per program, so future registrations can use different settings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Accountability Lab
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="accountability-lab-start">Start date</Label>
              <Input
                id="accountability-lab-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Default: 8 January 2027. This date is shared with participant-facing program pages.
              </p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4 text-sm">
              Current display date: <strong>{formatProgramDate(startDate)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Registration payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="registration-amount">Registration amount (NGN)</Label>
              <Input
                id="registration-amount"
                type="number"
                min="1"
                value={amountNaira}
                onChange={(event) =>
                  setPayment((current) => ({
                    ...current,
                    amount_minor: Math.max(0, Math.round(Number(event.target.value || 0) * 100)),
                  }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="font-medium">Manual bank transfer</p>
                  <p className="text-xs text-muted-foreground">Admin verifies before WhatsApp access.</p>
                </div>
                <Switch
                  checked={payment.manual_enabled}
                  onCheckedChange={(checked) =>
                    setPayment((current) => ({ ...current, manual_enabled: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="font-medium">Paystack</p>
                  <p className="text-xs text-muted-foreground">Verified automatically on the server.</p>
                </div>
                <Switch
                  checked={payment.paystack_enabled}
                  onCheckedChange={(checked) =>
                    setPayment((current) => ({ ...current, paystack_enabled: checked }))
                  }
                />
              </div>
            </div>

            {payment.manual_enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bank-name">Bank name</Label>
                  <Input
                    id="bank-name"
                    value={payment.bank_name}
                    onChange={(event) =>
                      setPayment((current) => ({ ...current, bank_name: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-name">Account name</Label>
                  <Input
                    id="account-name"
                    value={payment.account_name}
                    onChange={(event) =>
                      setPayment((current) => ({ ...current, account_name: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-number">Account number</Label>
                  <Input
                    id="account-number"
                    inputMode="numeric"
                    value={payment.account_number}
                    onChange={(event) =>
                      setPayment((current) => ({ ...current, account_number: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="manual-instructions">Manual payment instructions</Label>
                  <Textarea
                    id="manual-instructions"
                    value={payment.manual_instructions}
                    onChange={(event) =>
                      setPayment((current) => ({
                        ...current,
                        manual_instructions: event.target.value,
                      }))
                    }
                    placeholder="Transfer the exact amount, then enter your bank transfer reference below."
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="whatsapp-link">WhatsApp group link</Label>
              <Input
                id="whatsapp-link"
                type="url"
                placeholder="https://chat.whatsapp.com/..."
                value={payment.whatsapp_group_url}
                onChange={(event) =>
                  setPayment((current) => ({
                    ...current,
                    whatsapp_group_url: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                This link is released only after payment is marked paid.
              </p>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              Paystack uses the server-side <code>PAYSTACK_SECRET_KEY</code>. The secret is never stored
              on this page or exposed to participants.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Referral rewards
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="base-commission">Base commission (%)</Label>
                <Input
                  id="base-commission"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={rewards.base_commission_bps / 100}
                  onChange={(event) =>
                    setRewards((current) => ({
                      ...current,
                      base_commission_bps: Math.round(Number(event.target.value || 0) * 100),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  GOALS26 default: 10%. At ₦{amountNaira.toLocaleString()} that is ₦{Math.round(amountNaira * rewards.base_commission_bps / 10000).toLocaleString()} per qualifying referral.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Base commission qualifies when</Label>
                <Select
                  value={rewards.base_qualification}
                  onValueChange={(value) =>
                    setRewards((current) => ({
                      ...current,
                      base_qualification: value as RewardSettings["base_qualification"],
                    }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Payment confirmed</SelectItem>
                    <SelectItem value="completed">Training completed</SelectItem>
                    <SelectItem value="certified">Certificate issued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reward-start">Reward window starts (optional)</Label>
                <Input
                  id="reward-start"
                  type="datetime-local"
                  value={rewards.reward_start_at ? rewards.reward_start_at.slice(0, 16) : ""}
                  onChange={(event) =>
                    setRewards((current) => ({ ...current, reward_start_at: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reward-end">Reward window ends (optional)</Label>
                <Input
                  id="reward-end"
                  type="datetime-local"
                  value={rewards.reward_end_at ? rewards.reward_end_at.slice(0, 16) : ""}
                  onChange={(event) =>
                    setRewards((current) => ({ ...current, reward_end_at: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <p className="font-medium">Top-referrer bonuses</p>
                <p className="text-xs text-muted-foreground">
                  Show live projected rank bonuses, then finalize once the campaign closes.
                </p>
              </div>
              <Switch
                checked={rewards.rank_bonus_enabled}
                onCheckedChange={(checked) =>
                  setRewards((current) => ({ ...current, rank_bonus_enabled: checked }))
                }
                disabled={Boolean(rewards.rank_bonus_finalized_at)}
              />
            </div>

            {rewards.rank_bonus_enabled && (
              <div className="space-y-5 rounded-xl border bg-muted/15 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Leaderboard ranking basis</Label>
                    <Select
                      value={rewards.rank_basis}
                      onValueChange={(value) =>
                        setRewards((current) => ({
                          ...current,
                          rank_basis: value as RewardSettings["rank_basis"],
                        }))
                      }
                      disabled={Boolean(rewards.rank_bonus_finalized_at)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">Paid referrals</SelectItem>
                        <SelectItem value="completed">Completed training</SelectItem>
                        <SelectItem value="certified">Certified referrals</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimum-rank">Minimum qualifying referrals</Label>
                    <Input
                      id="minimum-rank"
                      type="number"
                      min="0"
                      value={rewards.minimum_rank_referrals}
                      onChange={(event) =>
                        setRewards((current) => ({
                          ...current,
                          minimum_rank_referrals: Math.max(0, Number(event.target.value || 0)),
                        }))
                      }
                      disabled={Boolean(rewards.rank_bonus_finalized_at)}
                    />
                  </div>
                </div>

                <div>
                  <Label>Additional bonus by rank (%)</Label>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((index) => (
                      <div key={index} className="space-y-1">
                        <p className="text-xs text-muted-foreground">#{index + 1}</p>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={(rewards.rank_bonus_bps[index] ?? 0) / 100}
                          onChange={(event) =>
                            setRewards((current) => {
                              const next = [...current.rank_bonus_bps];
                              next[index] = Math.round(Number(event.target.value || 0) * 100);
                              return { ...current, rank_bonus_bps: next };
                            })
                          }
                          disabled={Boolean(rewards.rank_bonus_finalized_at)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Defaults: 1st +5%, 2nd +3%, 3rd +2% of qualifying referral-generated fee revenue.
                  </p>
                </div>

                {rewards.rank_bonus_finalized_at ? (
                  <div className="rounded-lg bg-primary/10 p-3 text-sm">
                    <Trophy className="mr-2 inline h-4 w-4 text-primary" />
                    Finalized {new Date(rewards.rank_bonus_finalized_at).toLocaleString()}
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void finalizeRankBonuses()}
                    disabled={finalizingRank || !rewards.form_id}
                  >
                    <Trophy className="mr-2 h-4 w-4" />
                    {finalizingRank ? "Finalizing…" : "Finalize leaderboard bonuses"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={() => void save()} disabled={saving || !startDate} size="lg">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save program settings"}
        </Button>
      </div>
    </main>
  );
}
