import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarClock, Loader2, Mail, Megaphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Cohort = { id: string; name: string; is_current: boolean };
type Group = { id: string; name: string; cohort_id: string; mentor_id: string | null };
type Meeting = {
  group_id: string;
  title: string;
  meeting_url: string | null;
  starts_at: string | null;
  duration_minutes: number;
  recurrence: string;
  timezone: string;
  notes: string;
};
type QueueRow = {
  id: string;
  subject: string;
  status: string;
  attempt_count: number;
  created_at: string;
  processed_at: string | null;
  last_error: string;
};

export default function AdminCommunications() {
  const { toast } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [meetings, setMeetings] = useState<Record<string, Meeting>>({});
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingMeetingId, setSavingMeetingId] = useState("");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionLabel, setActionLabel] = useState("");
  const [actionPath, setActionPath] = useState("/journey");
  const [cohortId, setCohortId] = useState("current");
  const [sendEmail, setSendEmail] = useState(true);

  const load = async () => {
    setLoading(true);
    const [cohortResult, groupResult, meetingResult, queueResult] = await Promise.all([
      supabase.from("program_cohorts").select("id,name,is_current").order("cohort_year", { ascending: false }),
      supabase.from("accountability_groups").select("id,name,cohort_id,mentor_id").order("created_at", { ascending: false }),
      supabase.from("accountability_group_meetings").select("*"),
      supabase
        .from("email_notification_queue")
        .select("id,subject,status,attempt_count,created_at,processed_at,last_error")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setLoading(false);

    const error = cohortResult.error ?? groupResult.error ?? meetingResult.error ?? queueResult.error;
    if (error) {
      toast({
        title: "Communications could not load",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setCohorts(cohortResult.data ?? []);
    setGroups(groupResult.data ?? []);
    setMeetings(
      Object.fromEntries((meetingResult.data ?? []).map((meeting) => [meeting.group_id, meeting])),
    );
    setQueue((queueResult.data ?? []) as QueueRow[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const currentCohort = cohorts.find((item) => item.is_current);
  const currentGroups = useMemo(
    () => groups.filter((group) => !currentCohort || group.cohort_id === currentCohort.id),
    [groups, currentCohort?.id],
  );

  const sendAnnouncement = async () => {
    if (title.trim().length < 3 || body.trim().length < 3) {
      toast({
        title: "Add a title and message",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    const targetCohort =
      cohortId === "all"
        ? undefined
        : cohortId === "current"
          ? currentCohort?.id
          : cohortId;

    const { data, error } = await supabase.rpc("admin_send_program_announcement", {
      p_title: title.trim(),
      p_body: body.trim(),
      p_action_label: actionLabel.trim() || undefined,
      p_action_path: actionPath.trim() || undefined,
      p_cohort_id: targetCohort,
      p_email: sendEmail,
    });
    setSending(false);

    if (error) {
      toast({
        title: "Announcement could not be sent",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Announcement queued",
      description: String(data ?? 0) + " participants received the in-app notification. Email delivery will follow the notification worker.",
    });
    setTitle("");
    setBody("");
    setActionLabel("");
    await load();
  };

  const patchMeeting = (groupId: string, patch: Partial<Meeting>) => {
    setMeetings((current) => ({
      ...current,
      [groupId]: {
        group_id: groupId,
        title: "Accountability Lab check-in",
        meeting_url: null,
        starts_at: null,
        duration_minutes: 60,
        recurrence: "weekly",
        timezone: "Africa/Lagos",
        notes: "",
        ...(current[groupId] ?? {}),
        ...patch,
      },
    }));
  };

  const saveMeeting = async (groupId: string) => {
    const meeting = meetings[groupId];
    if (!meeting?.starts_at) {
      toast({
        title: "Choose the first meeting date and time",
        variant: "destructive",
      });
      return;
    }

    setSavingMeetingId(groupId);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("accountability_group_meetings")
      .upsert({
        group_id: groupId,
        title: meeting.title || "Accountability Lab check-in",
        meeting_url: meeting.meeting_url || null,
        starts_at: new Date(meeting.starts_at).toISOString(),
        duration_minutes: meeting.duration_minutes,
        recurrence: meeting.recurrence,
        timezone: meeting.timezone || "Africa/Lagos",
        notes: meeting.notes || "",
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      }, { onConflict: "group_id" });
    setSavingMeetingId("");

    if (error) {
      toast({
        title: "Meeting schedule could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Group schedule saved",
      description: "Members can now add this check-in to their calendars from Profile.",
    });
    await load();
  };

  const queueCounts = queue.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <main className="min-h-screen pt-28 grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-28">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
              Admin · Communications
            </p>
            <h1 className="mt-2 text-3xl font-bold">Communications</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Send program announcements, schedule accountability check-ins and monitor transactional email delivery.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              Program announcement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select value={cohortId} onValueChange={setCohortId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current GOALS cohort</SelectItem>
                    <SelectItem value="all">All active/completed program users</SelectItem>
                    {cohorts.map((cohort) => (
                      <SelectItem key={cohort.id} value={cohort.id}>{cohort.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="font-medium">Also send email</p>
                  <p className="text-xs text-muted-foreground">In-app notification is always created.</p>
                </div>
                <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Important GOALS update" />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} placeholder="Write the announcement..." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Action label (optional)</Label>
                <Input value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} placeholder="Open Schedule" />
              </div>
              <div className="space-y-2">
                <Label>Action path (optional)</Label>
                <Input value={actionPath} onChange={(event) => setActionPath(event.target.value)} placeholder="/schedule" />
              </div>
            </div>
            <Button onClick={() => void sendAnnouncement()} disabled={sending}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send announcement
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Accountability meeting schedules
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Members receive an in-app/email update when the schedule changes and can add it to Google, Apple Calendar or Outlook.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentGroups.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No current accountability groups exist yet.
              </p>
            ) : (
              currentGroups.map((group) => {
                const meeting = meetings[group.id] ?? {
                  group_id: group.id,
                  title: "Accountability Lab check-in",
                  meeting_url: null,
                  starts_at: null,
                  duration_minutes: 60,
                  recurrence: "weekly",
                  timezone: "Africa/Lagos",
                  notes: "",
                };
                return (
                  <div key={group.id} className="rounded-2xl border p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{group.name}</p>
                        <p className="text-xs text-muted-foreground">Current cohort</p>
                      </div>
                      {meeting.starts_at && <Badge variant="secondary">Scheduled</Badge>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>First meeting</Label>
                        <Input
                          type="datetime-local"
                          value={meeting.starts_at ? meeting.starts_at.slice(0, 16) : ""}
                          onChange={(event) => patchMeeting(group.id, { starts_at: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Recurrence</Label>
                        <Select
                          value={meeting.recurrence}
                          onValueChange={(value) => patchMeeting(group.id, { recurrence: value })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="once">Once</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Duration (minutes)</Label>
                        <Input
                          type="number"
                          min="15"
                          max="360"
                          value={meeting.duration_minutes}
                          onChange={(event) => patchMeeting(group.id, { duration_minutes: Number(event.target.value || 60) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Meeting link (optional)</Label>
                        <Input
                          value={meeting.meeting_url ?? ""}
                          onChange={(event) => patchMeeting(group.id, { meeting_url: event.target.value })}
                          placeholder="https://meet.google.com/..."
                        />
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Label>Notes (optional)</Label>
                      <Input
                        value={meeting.notes}
                        onChange={(event) => patchMeeting(group.id, { notes: event.target.value })}
                        placeholder="Bring your weekly review..."
                      />
                    </div>
                    <Button
                      className="mt-4"
                      onClick={() => void saveMeeting(group.id)}
                      disabled={savingMeetingId === group.id}
                    >
                      {savingMeetingId === group.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save schedule
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Email delivery queue
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(queueCounts).map(([status, count]) => (
                <Badge key={status} variant="outline">{status}: {count}</Badge>
              ))}
            </div>
            <div className="space-y-2">
              {queue.slice(0, 20).map((item) => (
                <div key={item.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{item.subject}</p>
                    <Badge variant={item.status === "sent" ? "secondary" : "outline"}>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Attempts: {item.attempt_count} · {new Date(item.created_at).toLocaleString()}
                  </p>
                  {item.last_error && (
                    <p className="mt-2 text-xs text-destructive">{item.last_error}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
