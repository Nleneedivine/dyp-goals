// Simple ICS (iCalendar) generator and parser for to-do items.
// Format compatible with Google Calendar, Apple Calendar, Outlook.

export interface IcsTodo {
  activity: string;
  time: string; // HH:mm
  date: string; // yyyy-MM-dd
  category?: string;
  tags?: string[];
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toIcsDateTime(date: string, time: string): string {
  // date: yyyy-MM-dd, time: HH:mm  -> yyyyMMddTHHmmss
  const [y, m, d] = date.split("-");
  const [h, mi] = time.split(":");
  return `${y}${m}${d}T${pad(parseInt(h || "0"))}${pad(parseInt(mi || "0"))}00`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map((v) => parseInt(v));
  const total = h * 60 + m + minutes;
  const nh = Math.floor((total % (24 * 60)) / 60);
  const nm = total % 60;
  return `${pad(nh)}:${pad(nm)}`;
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function generateIcs(todos: IcsTodo[], calendarName = "My To-Do"): string {
  const now = new Date();
  const dtstamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const events = todos
    .map((t, i) => {
      const start = toIcsDateTime(t.date, t.time);
      const end = toIcsDateTime(t.date, addMinutes(t.time, 30));
      const categories = [t.category, ...(t.tags || [])].filter(Boolean).join(",");
      return [
        "BEGIN:VEVENT",
        `UID:${Date.now()}-${i}@dyp-todo`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeIcs(t.activity)}`,
        categories ? `CATEGORIES:${escapeIcs(categories)}` : "",
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DYP//To-Do//EN",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ParsedIcsEvent {
  summary: string;
  date: string; // yyyy-MM-dd
  time: string; // HH:mm
  categories?: string[];
}

export function parseIcs(content: string): ParsedIcsEvent[] {
  // Unfold lines (RFC 5545: lines starting with space/tab are continuations)
  const unfolded = content.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events: ParsedIcsEvent[] = [];
  let current: Partial<ParsedIcsEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") {
      if (current?.summary && current?.date && current?.time) {
        events.push(current as ParsedIcsEvent);
      }
      current = null;
    } else if (current) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const keyPart = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1);
      const key = keyPart.split(";")[0];

      if (key === "SUMMARY") {
        current.summary = value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, "\n").replace(/\\\\/g, "\\");
      } else if (key === "DTSTART") {
        // Could be 20240115T090000 or 20240115T090000Z or 20240115
        const v = value.replace(/Z$/, "");
        if (v.length >= 8) {
          current.date = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
          if (v.length >= 13) {
            current.time = `${v.slice(9, 11)}:${v.slice(11, 13)}`;
          } else {
            current.time = "09:00";
          }
        }
      } else if (key === "CATEGORIES") {
        current.categories = value.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
  }
  return events;
}
