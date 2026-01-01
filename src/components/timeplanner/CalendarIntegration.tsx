import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Download, ExternalLink, Check, Copy } from "lucide-react";
import { format, addDays, parse, startOfWeek } from "date-fns";

interface CalendarIntegrationProps {
  planId: string;
  goal: string;
  dailyPlan: any;
  weeklyPlan: any;
}

export const CalendarIntegration = ({ planId, goal, dailyPlan, weeklyPlan }: CalendarIntegrationProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generateICSContent = () => {
    const events: string[] = [];
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    
    // Generate events for a 4-week period
    for (let week = 0; week < 4; week++) {
      for (let day = 0; day < 7; day++) {
        const currentDate = addDays(weekStart, week * 7 + day);
        const dayName = format(currentDate, 'EEEE');
        const isWeekend = day >= 5;
        
        const template = isWeekend ? dailyPlan?.weekendTemplate : dailyPlan?.weekdayTemplate;
        const timeBlocks = template?.timeBlocks || [];
        
        timeBlocks.forEach((block: any, index: number) => {
          if (block.activity && block.category !== 'Sleep') {
            const startTime = block.startTime || '09:00';
            const endTime = block.endTime || '10:00';
            
            // Parse times
            const startDate = parse(startTime, 'HH:mm', currentDate);
            const endDate = parse(endTime, 'HH:mm', currentDate);
            
            const uid = `${planId}-${format(currentDate, 'yyyyMMdd')}-${index}@dypgoals`;
            const dtstart = format(startDate, "yyyyMMdd'T'HHmmss");
            const dtend = format(endDate, "yyyyMMdd'T'HHmmss");
            
            const event = [
              'BEGIN:VEVENT',
              `UID:${uid}`,
              `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`,
              `DTSTART:${dtstart}`,
              `DTEND:${dtend}`,
              `SUMMARY:${block.activity}`,
              `DESCRIPTION:${block.notes || ''} - Category: ${block.category || 'General'}`,
              `CATEGORIES:${block.category || 'General'}`,
              'END:VEVENT',
            ].join('\r\n');
            
            events.push(event);
          }
        });
      }
    }
    
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DYP Goals//Time Planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${goal.substring(0, 50)}`,
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');
    
    return icsContent;
  };

  const handleDownloadICS = () => {
    setIsExporting(true);
    try {
      const icsContent = generateICSContent();
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DYP-Goals-${format(new Date(), 'yyyy-MM-dd')}.ics`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Calendar Exported!",
        description: "Import the .ics file into your calendar app.",
      });
    } catch (error) {
      console.error('Error exporting calendar:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export calendar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const generateGoogleCalendarUrl = (block: any, date: Date) => {
    const startTime = block.startTime || '09:00';
    const endTime = block.endTime || '10:00';
    
    const startDate = parse(startTime, 'HH:mm', date);
    const endDate = parse(endTime, 'HH:mm', date);
    
    const formatForGoogle = (d: Date) => format(d, "yyyyMMdd'T'HHmmss");
    
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: block.activity,
      dates: `${formatForGoogle(startDate)}/${formatForGoogle(endDate)}`,
      details: `${block.notes || ''}\n\nCategory: ${block.category || 'General'}\nGoal: ${goal}`,
    });
    
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  const handleAddToGoogleCalendar = () => {
    // Add today's first task to Google Calendar as an example
    const today = new Date();
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
    const template = isWeekend ? dailyPlan?.weekendTemplate : dailyPlan?.weekdayTemplate;
    const firstBlock = template?.timeBlocks?.find((b: any) => b.activity && b.category !== 'Sleep');
    
    if (firstBlock) {
      const url = generateGoogleCalendarUrl(firstBlock, today);
      window.open(url, '_blank');
      
      toast({
        title: "Opening Google Calendar",
        description: "Add more events by downloading the .ics file for bulk import.",
      });
    } else {
      toast({
        title: "No Events Found",
        description: "No scheduled activities to add.",
        variant: "destructive",
      });
    }
  };

  const copySubscriptionUrl = () => {
    // Generate a webcal URL (this would need a server endpoint in production)
    const subscriptionUrl = `webcal://${window.location.host}/api/calendar/${planId}.ics`;
    navigator.clipboard.writeText(subscriptionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    
    toast({
      title: "URL Copied",
      description: "Note: Calendar subscription requires a backend endpoint.",
    });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Calendar Integration
        </CardTitle>
        <CardDescription>
          Sync your time plan with your favorite calendar application
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Google Calendar */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Calendar className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="font-medium">Google Calendar</p>
              <p className="text-sm text-muted-foreground">Add events directly to Google Calendar</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddToGoogleCalendar}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Add Event
          </Button>
        </div>

        {/* Download ICS */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Download Calendar File</p>
              <p className="text-sm text-muted-foreground">Import into any calendar app (4-week plan)</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadICS}
            disabled={isExporting}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Download .ics
          </Button>
        </div>

        {/* Apple Calendar / Outlook */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary/20">
              <Copy className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="font-medium">Apple Calendar / Outlook</p>
              <p className="text-sm text-muted-foreground">Copy subscription URL</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copySubscriptionUrl}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy URL
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Tip: Download the .ics file and import it for the best experience with bulk events.
        </p>
      </CardContent>
    </Card>
  );
};
