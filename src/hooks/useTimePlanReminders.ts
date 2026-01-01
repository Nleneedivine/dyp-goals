import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

type TimePlan = Tables<'time_plans'>;

interface TimeBlock {
  startTime: string;
  endTime: string;
  activity: string;
  category: string;
}

interface DailyPlan {
  weekdayTemplate: {
    wakeTime: string;
    sleepTime: string;
    timeBlocks: TimeBlock[];
  };
  weekendTemplate: {
    wakeTime: string;
    sleepTime: string;
    timeBlocks: TimeBlock[];
  };
}

export function useTimePlanReminders() {
  const checkAndNotify = useCallback(async () => {
    // Check if notifications are supported and permitted
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    // Get enabled reminders from localStorage
    const savedReminders = localStorage.getItem('timePlanReminders');
    if (!savedReminders) return;

    const remindersEnabled: Record<string, boolean> = JSON.parse(savedReminders);
    const enabledPlanIds = Object.entries(remindersEnabled)
      .filter(([_, enabled]) => enabled)
      .map(([id]) => id);

    if (enabledPlanIds.length === 0) return;

    // Fetch plans with reminders enabled
    const { data: plans } = await supabase
      .from('time_plans')
      .select('*')
      .in('id', enabledPlanIds);

    if (!plans || plans.length === 0) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    // Check each plan for upcoming activities
    plans.forEach((plan: TimePlan) => {
      const dailyPlan = plan.daily_plan as unknown as DailyPlan;
      if (!dailyPlan) return;

      const template = isWeekend 
        ? dailyPlan.weekendTemplate 
        : dailyPlan.weekdayTemplate;

      if (!template?.timeBlocks) return;

      // Find activities starting in the next 5 minutes
      template.timeBlocks.forEach((block: TimeBlock) => {
        const blockStartTime = block.startTime;
        const [blockHour, blockMinute] = blockStartTime.split(':').map(Number);
        
        const blockDate = new Date(now);
        blockDate.setHours(blockHour, blockMinute, 0, 0);
        
        const diffMs = blockDate.getTime() - now.getTime();
        const diffMinutes = diffMs / (1000 * 60);

        // Notify 5 minutes before and at the start time
        if (diffMinutes > 0 && diffMinutes <= 5) {
          showNotification(
            `⏰ Upcoming: ${block.activity}`,
            `Starting at ${block.startTime} - ${block.category}`
          );
        } else if (diffMinutes >= 0 && diffMinutes < 1) {
          showNotification(
            `🎯 Time for: ${block.activity}`,
            `It's ${block.startTime} - Let's go!`
          );
        }
      });
    });
  }, []);

  const showNotification = (title: string, body: string) => {
    // Check if we already showed this notification recently
    const notifKey = `notif_${title}_${new Date().getHours()}_${Math.floor(new Date().getMinutes() / 5)}`;
    if (localStorage.getItem(notifKey)) return;
    
    localStorage.setItem(notifKey, 'shown');
    
    // Clean up old notification keys after 10 minutes
    setTimeout(() => localStorage.removeItem(notifKey), 10 * 60 * 1000);

    new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: notifKey,
      requireInteraction: false,
    });
  };

  useEffect(() => {
    // Check immediately on mount
    checkAndNotify();

    // Check every minute
    const interval = setInterval(checkAndNotify, 60 * 1000);

    return () => clearInterval(interval);
  }, [checkAndNotify]);

  return { checkAndNotify };
}
