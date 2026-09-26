import type { Tables } from "@/integrations/supabase/types";

type GoalTask = Tables<"goal_tasks">;

interface CalendarTask extends GoalTask {
  goalTitle?: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

const formatLocalDateTime = (date: Date) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;

const compactDate = (value: string) => value.replaceAll("-", "");

const nextDateKey = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const escapeIcsText = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");

const utcStamp = () => {
  const now = new Date();
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

export const buildTasksIcs = (tasks: CalendarTask[]) => {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Discover Your Purpose//DYP GOALS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  tasks
    .filter(
      (task) =>
        Boolean(task.scheduled_date) &&
        task.status !== "skipped" &&
        task.status !== "deferred",
    )
    .forEach((task) => {
      const date = task.scheduled_date!;
      const title = escapeIcsText(task.title);
      const descriptionParts = [
        task.goalTitle ? `Goal: ${task.goalTitle}` : "",
        task.notes?.trim() ? task.notes.trim() : "",
      ].filter(Boolean);
      const description = escapeIcsText(descriptionParts.join("\n\n"));

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${task.id}@dyp-goals`);
      lines.push(`DTSTAMP:${utcStamp()}`);
      lines.push(`SUMMARY:${title}`);

      if (description) lines.push(`DESCRIPTION:${description}`);

      if (task.scheduled_time) {
        const start = new Date(`${date}T${task.scheduled_time.slice(0, 5)}:00`);
        const end = new Date(
          start.getTime() + Math.max(1, Number(task.estimated_minutes || 30)) * 60_000,
        );
        lines.push(`DTSTART:${formatLocalDateTime(start)}`);
        lines.push(`DTEND:${formatLocalDateTime(end)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`);
        lines.push(`DTEND;VALUE=DATE:${compactDate(nextDateKey(date))}`);
      }

      lines.push(`STATUS:${task.status === "completed" ? "COMPLETED" : "CONFIRMED"}`);
      lines.push("END:VEVENT");
    });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};

export const downloadTasksIcs = (
  tasks: CalendarTask[],
  filename: string,
) => {
  const calendar = buildTasksIcs(tasks);
  const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
