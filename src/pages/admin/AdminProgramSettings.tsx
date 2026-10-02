import { useEffect, useState } from "react";
import { CalendarDays, CreditCard, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  const [payment, setPayment] = useState<PaymentSettings>(defaultPayment);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const [{ data: config }, { data: form }] = await Promise.all([
        supabase
          .from("platform_configuration")
          .select("accountability_lab_start_date")
          .eq("id", "global")
          .maybeSingle(),
        supabase
          .from("program_forms")
          .select("id")
          .eq("slug", "goals-masterclass-2026")
          .maybeSingle(),
      ]);

      if (config?.accountability_lab_start_date) {
        setStartDate(config.accountability_lab_start_date);
      }

      if (!form?.id) return;

      const { data: pay } = await supabase
        .from("program_payment_settings")
        .select("*")
        .eq("form_id", form.id)
        .maybeSingle();

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
          : { ...defaultPayment, form_id: form.id },
      );
    };

    void load();
  }, []);

  const save = async () => {
    setSaving(true);

    const { error: configError } = await supabase
      .from("platform_configuration")
      .update({ accountability_lab_start_date: startDate })
      .eq("id", "global");

    let paymentError: { message: string } | null = null;
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

    setSaving(false);
    const error = configError ?? paymentError;
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
      description: "Accountability Lab, payment options and WhatsApp access settings are updated.",
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

        <Button onClick={() => void save()} disabled={saving || !startDate} size="lg">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save program settings"}
        </Button>
      </div>
    </main>
  );
}
