import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert WAT (West Africa Time, UTC+1) to user's local time
export function convertWATToLocal(watTime: string): string {
  // WAT is UTC+1
  const [hours, minutes] = watTime.split(':').map(Number);
  
  // Create a date object in WAT (UTC+1)
  const watDate = new Date();
  watDate.setUTCHours(hours - 1, minutes, 0, 0); // Convert WAT to UTC
  
  // Format in user's local time
  return watDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function getEventTimeDisplay(): string {
  const startLocal = convertWATToLocal('20:00');
  const endLocal = convertWATToLocal('21:30');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  return `${startLocal} - ${endLocal} (${timezone})`;
}
