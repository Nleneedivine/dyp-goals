import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type ProgramEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  session_start_time: string;
  session_end_time: string;
  timezone: string;
  platform: string;
};

type GroupMeeting = {
  group_id: string;
  title: string;
  meeting_url: string | null;
  starts_at: string | null;
  duration_minutes: number;
  recurrence: string;
  timezone: string;
  notes: string;
};

const utcStamp = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const escapeIcs = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

function parseClockMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function programSessions(event: ProgramEvent) {
  const first = new Date(event.starts_at);
  const last = new Date(event.ends_at);
  const startMinutes = parseClockMinutes(event.session_start_time);
  const endMinutes = parseClockMinutes(event.session_end_time);
  let durationMinutes =
    startMinutes !== null && endMinutes !== null ? endMinutes - startMinutes : 90;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  if (durationMinutes <= 0 || durationMinutes > 720) durationMinutes = 90;

  const count =
    Math.max(
      1,
      Math.round(
        (Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()) -
          Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate())) /
          86400000,
      ) + 1,
    );

  return Array.from({ length: count }, (_, index) => {
    const start = new Date(first.getTime() + index * 86400000);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    return { start, end, title: event.title + " · Day " + (index + 1) };
  });
}

function googleCalendarUrl(
  title: string,
  start: Date,
  end: Date,
  details: string,
  location = "",
  recurrence?: string,
) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: utcStamp(start) + "/" + utcStamp(end),
    details,
  });
  if (location) params.set("location", location);
  if (recurrence) params.set("recur", recurrence);
  return "https://calendar.google.com/calendar/render?" + params.toString();
}

function downloadIcs(filename: string, events: string[]) {
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Discover Your Purpose//DYP GOALS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".ics") ? filename : filename + ".ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ProgramCalendarSync() {
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<ProgramEvent | null>(null);
  const [meeting, setMeeting] = useState<GroupMeeting | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: cohort } = await supabase
        .from("program_cohorts")
        .select("id,program_event_id")
        .eq("program_key", "goals")
        .eq("is_current", true)
        .maybeSingle();

      if (cohort?.program_event_id) {
        const { data: event } = await supabase
          .from("program_events")
          .select("id,title,starts_at,ends_at,session_start_time,session_end_time,timezone,platform")
          .eq("id", cohort.program_event_id)
          .maybeSingle();
        setProgram((event ?? null) as ProgramEvent | null);
      }

      const { data: chatData } = await supabase.rpc("current_user_accountability_chat");
      const groupId = (chatData as { groupId?: string } | null)?.groupId;
      if (groupId) {
        const { data: groupMeeting } = await supabase
          .from("accountability_group_meetings")
          .select("group_id,title,meeting_url,starts_at,duration_minutes,recurrence,timezone,notes")
          .eq("group_id", groupId)
          .maybeSingle();
        setMeeting((groupMeeting ?? null) as GroupMeeting | null);
      }

      setLoading(false);
    };

    void load();
  }, []);

  const sessions = useMemo(
    () => (program ? programSessions(program) : []),
    [program],
  );

  const downloadProgramCalendar = () => {
    if (!program) return;
    const events = sessions.map((session, index) =>
      [
        "BEGIN:VEVENT",
        "UID:" + program.id + "-day-" + (index + 1) + "@dyp-goals",
        "DTSTAMP:" + utcStamp(new Date()),
        "DTSTART:" + utcStamp(session.start),
        "DTEND:" + utcStamp(session.end),
        "SUMMARY:" + escapeIcs(session.title),
        "DESCRIPTION:" + escapeIcs("DYP GOALS session. Platform: " + program.platform),
        "LOCATION:" + escapeIcs(program.platform),
        "END:VEVENT",
      ].join("\r\n"),
    );
    downloadIcs("DYP-GOALS-Masterclass", events);
  };

  const downloadGroupCalendar = () => {
    if (!meeting?.starts_at) return;
    const start = new Date(meeting.starts_at);
    const end = new Date(start.getTime() + meeting.duration_minutes * 60000);
    const rrule =
      meeting.recurrence === "weekly"
        ? "RRULE:FREQ=WEEKLY"
        : meeting.recurrence === "biweekly"
          ? "RRULE:FREQ=WEEKLY;INTERVAL=2"
          : meeting.recurrence === "monthly"
            ? "RRULE:FREQ=MONTHLY"
            : "";
    const event = [
      "BEGIN:VEVENT",
      "UID:accountability-" + meeting.group_id + "@dyp-goals",
      "DTSTAMP:" + utcStamp(new Date()),
      "DTSTART:" + utcStamp(start),
      "DTEND:" + utcStamp(end),
      "SUMMARY:" + escapeIcs(meeting.title),
      meeting.meeting_url ? "LOCATION:" + escapeIcs(meeting.meeting_url) : "",
      meeting.notes ? "DESCRIPTION:" + escapeIcs(meeting.notes) : "",
      rrule,
      "END:VEVENT",
    ].filter(Boolean).join("\r\n");
    downloadIcs("DYP-Accountability-Checkin", [event]);
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
          <CalendarDays className="h-6 w-6 text-primary" />
          Calendar
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Add DYP events without granting calendar access. Google Calendar opens a pre-filled event; .ics works with Apple Calendar, Outlook and most calendar apps.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {program && (
          <div className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{program.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {sessions.length} sessions · {program.session_start_time}–{program.session_end_time} · {program.timezone}
                </p>
                <Badge variant="outline" className="mt-2">{program.platform}</Badge>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {sessions[0] && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={googleCalendarUrl(
                        program.title,
                        sessions[0].start,
                        sessions[0].end,
                        "DYP GOALS. This adds Day 1; use the .ics file to add all sessions together.",
                        program.platform,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Google Calendar
                    </a>
                  </Button>
                )}
                <Button type="button" size="sm" onClick={downloadProgramCalendar}>
                  <Download className="mr-2 h-4 w-4" />
                  Add all sessions (.ics)
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border p-4">
          <p className="font-semibold">Accountability check-in</p>
          {meeting?.starts_at ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date(meeting.starts_at).toLocaleString()} · {meeting.duration_minutes} min · {meeting.recurrence}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button asChild size="sm" variant="outline">
                  <a
                    href={googleCalendarUrl(
                      meeting.title,
                      new Date(meeting.starts_at),
                      new Date(new Date(meeting.starts_at).getTime() + meeting.duration_minutes * 60000),
                      meeting.notes || "DYP Accountability Lab check-in",
                      meeting.meeting_url || "",
                      meeting.recurrence === "weekly"
                        ? "RRULE:FREQ=WEEKLY"
                        : meeting.recurrence === "biweekly"
                          ? "RRULE:FREQ=WEEKLY;INTERVAL=2"
                          : meeting.recurrence === "monthly"
                            ? "RRULE:FREQ=MONTHLY"
                            : undefined,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Google Calendar
                  </a>
                </Button>
                <Button type="button" size="sm" onClick={downloadGroupCalendar}>
                  <Download className="mr-2 h-4 w-4" />
                  Download .ics
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Your group does not have a scheduled check-in yet. Once Admin or your Accountability Coach sets it, calendar buttons will appear here.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
