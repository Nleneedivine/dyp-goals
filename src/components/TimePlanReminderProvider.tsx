import { useTimePlanReminders } from "@/hooks/useTimePlanReminders";

export function TimePlanReminderProvider({ children }: { children: React.ReactNode }) {
  // Initialize the reminder system
  useTimePlanReminders();
  
  return <>{children}</>;
}
