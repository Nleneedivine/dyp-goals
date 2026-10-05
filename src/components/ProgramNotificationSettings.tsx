import { useEffect, useMemo, useState } from "react";
import { BellRing, Loader2, Mail, MessageSquareText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function ProgramNotificationSettings() {
  const { toast } = useToast();
  const detectedTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos",
    [],
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [programEmails, setProgramEmails] = useState(true);
  const [sessionReminders, setSessionReminders] = useState(true);
  const [accountabilityReminders, setAccountabilityReminders] = useState(true);
  const [referralUpdates, setReferralUpdates] = useState(true);
  const [groupDigest, setGroupDigest] = useState("off");
  const [timezone, setTimezone] = useState(detectedTimezone);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setProgramEmails(data.program_emails_enabled);
        setSessionReminders(data.session_reminders_enabled);
        setAccountabilityReminders(data.accountability_reminders_enabled);
        setReferralUpdates(data.referral_updates_enabled);
        setGroupDigest(data.group_digest);
        setTimezone(data.timezone);
      }
      setLoading(false);
    };

    void load();
  }, []);

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    } catch {
      toast({
        title: "Timezone is not recognized",
        description: "Use a timezone such as Africa/Lagos.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({
        user_id: user.id,
        program_emails_enabled: programEmails,
        session_reminders_enabled: sessionReminders,
        accountability_reminders_enabled: accountabilityReminders,
        referral_updates_enabled: referralUpdates,
        group_digest: groupDigest,
        timezone,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    setSaving(false);

    if (error) {
      toast({
        title: "Notification preferences could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Program notifications saved",
      description: "Critical account/security messages remain available even if optional program emails are reduced.",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="grid min-h-32 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <BellRing className="h-6 w-6 text-primary" />
          Program Notifications
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Control program, accountability and referral emails. Important sign-in/security messages are managed by the authentication system separately.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <Mail className="h-4 w-4 text-primary" />
              Program emails
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Master switch for optional program emails below.
            </p>
          </div>
          <Switch checked={programEmails} onCheckedChange={setProgramEmails} />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="flex items-start justify-between gap-3 rounded-xl border p-4">
            <div>
              <p className="font-medium">Session reminders</p>
              <p className="mt-1 text-xs text-muted-foreground">Masterclass and scheduled program reminders.</p>
            </div>
            <Switch checked={sessionReminders} onCheckedChange={setSessionReminders} disabled={!programEmails} />
          </div>
          <div className="flex items-start justify-between gap-3 rounded-xl border p-4">
            <div>
              <p className="font-medium">Accountability updates</p>
              <p className="mt-1 text-xs text-muted-foreground">Group placement, coach and meeting updates.</p>
            </div>
            <Switch checked={accountabilityReminders} onCheckedChange={setAccountabilityReminders} disabled={!programEmails} />
          </div>
          <div className="flex items-start justify-between gap-3 rounded-xl border p-4">
            <div>
              <p className="font-medium">Referral updates</p>
              <p className="mt-1 text-xs text-muted-foreground">Earnings and payout activity.</p>
            </div>
            <Switch checked={referralUpdates} onCheckedChange={setReferralUpdates} disabled={!programEmails} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              Group-chat email digest
            </Label>
            <Select value={groupDigest} onValueChange={setGroupDigest}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="daily">Daily summary</SelectItem>
                <SelectItem value="weekly">Weekly summary</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Normal chat messages stay in-app. Digests are for catching up, not one email per message.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="program-timezone">Timezone</Label>
            <Input
              id="program-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Africa/Lagos"
            />
            <p className="text-xs text-muted-foreground">Detected: {detectedTimezone}</p>
          </div>
        </div>

        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save program notifications
        </Button>
      </CardContent>
    </Card>
  );
}
