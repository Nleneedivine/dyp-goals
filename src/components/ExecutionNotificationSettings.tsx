import { useEffect, useMemo, useState } from "react";
import { Bell, Clock3, Loader2, Mail, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const DAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" },
];

const parseDeadlineDays = (value: string) => {
  const parts = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item));

  return Array.from(new Set(parts)).sort((a, b) => b - a);
};

export function ExecutionNotificationSettings() {
  const { toast } = useToast();
  const detectedTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [morningEnabled, setMorningEnabled] = useState(false);
  const [morningTime, setMorningTime] = useState("07:00");
  const [eveningEnabled, setEveningEnabled] = useState(false);
  const [eveningTime, setEveningTime] = useState("20:00");
  const [weeklyEnabled, setWeeklyEnabled] = useState(false);
  const [weeklyDay, setWeeklyDay] = useState("7");
  const [weeklyTime, setWeeklyTime] = useState("18:00");
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadlineTime, setDeadlineTime] = useState("08:00");
  const [deadlineDays, setDeadlineDays] = useState("7, 3, 1");
  const [monthlyCheckinEnabled, setMonthlyCheckinEnabled] = useState(false);
  const [monthlyCheckinTime, setMonthlyCheckinTime] = useState("18:00");
  const [timezone, setTimezone] = useState(detectedTimezone);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("execution_notification_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        if (error.code === "PGRST205" || error.code === "42P01") {
          setAvailable(false);
          setLoading(false);
          return;
        }
        toast({
          title: "Notification settings could not load",
          description: error.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      setAvailable(true);
      if (data) {
        setEmailEnabled(data.email_enabled);
        setMorningEnabled(data.morning_brief_enabled);
        setMorningTime(data.morning_time.slice(0, 5));
        setEveningEnabled(data.evening_debrief_enabled);
        setEveningTime(data.evening_time.slice(0, 5));
        setWeeklyEnabled(data.weekly_review_enabled);
        setWeeklyDay(String(data.weekly_review_day));
        setWeeklyTime(data.weekly_review_time.slice(0, 5));
        setDeadlineEnabled(data.deadline_alerts_enabled);
        setDeadlineTime(data.deadline_time.slice(0, 5));
        setDeadlineDays(data.deadline_days_before.join(", "));
        setMonthlyCheckinEnabled(data.monthly_checkin_enabled);
        setMonthlyCheckinTime(data.monthly_checkin_time.slice(0, 5));
        setTimezone(data.timezone);
      }

      setLoading(false);
    };

    void load();
  }, [toast]);

  const save = async () => {
    const parsedDeadlineDays = parseDeadlineDays(deadlineDays);
    if (parsedDeadlineDays.some((day) => day < 0 || day > 60)) {
      toast({
        title: "Check deadline alert days",
        description: "Use comma-separated whole numbers between 0 and 60.",
        variant: "destructive",
      });
      return;
    }

    if (parsedDeadlineDays.length > 5) {
      toast({
        title: "Too many deadline alert points",
        description: "Choose up to five days before a milestone.",
        variant: "destructive",
      });
      return;
    }

    if (deadlineEnabled && parsedDeadlineDays.length === 0) {
      toast({
        title: "Add at least one deadline alert day",
        description: "For example: 7, 3, 1",
        variant: "destructive",
      });
      return;
    }

    if (!timezone.trim()) {
      toast({
        title: "Timezone is required",
        variant: "destructive",
      });
      return;
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone.trim() }).format(new Date());
    } catch {
      toast({
        title: "Timezone is not recognized",
        description: "Use an IANA timezone such as Africa/Lagos, Europe/London or America/New_York.",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSaving(true);
    const { error } = await supabase
      .from("execution_notification_settings")
      .upsert({
        user_id: user.id,
        email_enabled: emailEnabled,
        morning_brief_enabled: morningEnabled,
        morning_time: morningTime,
        evening_debrief_enabled: eveningEnabled,
        evening_time: eveningTime,
        weekly_review_enabled: weeklyEnabled,
        weekly_review_day: Number(weeklyDay),
        weekly_review_time: weeklyTime,
        deadline_alerts_enabled: deadlineEnabled,
        deadline_time: deadlineTime,
        deadline_days_before: parsedDeadlineDays,
        monthly_checkin_enabled: monthlyCheckinEnabled,
        monthly_checkin_time: monthlyCheckinTime,
        timezone: timezone.trim(),
      }, { onConflict: "user_id" });
    setSaving(false);

    if (error) {
      toast({
        title: "Notification settings could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Execution notifications saved",
      description: emailEnabled
        ? "Your enabled GOALS execution emails will use these times and your saved timezone."
        : "Email delivery is currently off. Your detailed timing preferences are still saved.",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!available) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Bell className="h-6 w-6 text-primary" />
            Execution Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Notification preferences are not active in this workspace yet. Your profile and the rest of GOALS will keep working; these controls will become available after the database update is applied.
          </div>
        </CardContent>
      </Card>
    );
  }

  const childDisabled = !emailEnabled;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Bell className="h-6 w-6 text-primary" />
              Execution Notifications
            </CardTitle>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Choose the execution rhythm you want GOALS to send by email. Your fixed commitments remain private and are not included in these emails.
            </p>
          </div>
          <Badge variant={emailEnabled ? "secondary" : "outline"}>
            {emailEnabled ? "Email enabled" : "Email off"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <div>
            <div className="flex items-center gap-2 font-medium">
              <Mail className="h-4 w-4 text-primary" />
              GOALS execution emails
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Master switch for the briefings and alerts below.
            </p>
          </div>
          <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Morning brief</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Today's goal-linked tasks and the next relevant milestone.
                </p>
              </div>
              <Switch
                checked={morningEnabled}
                onCheckedChange={setMorningEnabled}
                disabled={childDisabled}
              />
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="morning-time">Send around</Label>
              <Input
                id="morning-time"
                type="time"
                value={morningTime}
                onChange={(event) => setMorningTime(event.target.value)}
                disabled={childDisabled || !morningEnabled}
              />
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Evening debrief</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  What was completed today and what still needs a deliberate decision.
                </p>
              </div>
              <Switch
                checked={eveningEnabled}
                onCheckedChange={setEveningEnabled}
                disabled={childDisabled}
              />
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="evening-time">Send around</Label>
              <Input
                id="evening-time"
                type="time"
                value={eveningTime}
                onChange={(event) => setEveningTime(event.target.value)}
                disabled={childDisabled || !eveningEnabled}
              />
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Weekly review reminder</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A prompt to close the week and save wins, blockers and adjustments.
                </p>
              </div>
              <Switch
                checked={weeklyEnabled}
                onCheckedChange={setWeeklyEnabled}
                disabled={childDisabled}
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Day</Label>
                <Select
                  value={weeklyDay}
                  onValueChange={setWeeklyDay}
                  disabled={childDisabled || !weeklyEnabled}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day) => (
                      <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="weekly-time">Time</Label>
                <Input
                  id="weekly-time"
                  type="time"
                  value={weeklyTime}
                  onChange={(event) => setWeeklyTime(event.target.value)}
                  disabled={childDisabled || !weeklyEnabled}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Monthly accountability check-in</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A month-end reminder to save your execution snapshot, wins, blockers, adjustments and next-month focus.
                </p>
              </div>
              <Switch
                checked={monthlyCheckinEnabled}
                onCheckedChange={setMonthlyCheckinEnabled}
                disabled={childDisabled}
              />
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="monthly-checkin-time">Send on the last day of the month around</Label>
              <Input
                id="monthly-checkin-time"
                type="time"
                value={monthlyCheckinTime}
                onChange={(event) => setMonthlyCheckinTime(event.target.value)}
                disabled={childDisabled || !monthlyCheckinEnabled}
              />
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Milestone deadline alerts</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Factual reminders before incomplete dated milestones.
                </p>
              </div>
              <Switch
                checked={deadlineEnabled}
                onCheckedChange={setDeadlineEnabled}
                disabled={childDisabled}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[150px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="deadline-time">Send around</Label>
                <Input
                  id="deadline-time"
                  type="time"
                  value={deadlineTime}
                  onChange={(event) => setDeadlineTime(event.target.value)}
                  disabled={childDisabled || !deadlineEnabled}
                />
              </div>
              <div className="space-y-2">
              <Label htmlFor="deadline-days">Days before milestone</Label>
              <Input
                id="deadline-days"
                value={deadlineDays}
                onChange={(event) => setDeadlineDays(event.target.value)}
                placeholder="7, 3, 1"
                disabled={childDisabled || !deadlineEnabled}
              />
              <p className="text-xs text-muted-foreground">
                Up to five comma-separated values from 0 to 60. Use 0 for the due date itself.
              </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" />
            <p className="font-medium">Timezone</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Detected from this browser as {detectedTimezone}. Change it if you normally plan in another timezone.
          </p>
          <Input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="mt-3 max-w-md"
            placeholder="Africa/Lagos"
          />
        </div>

        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save notification settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
