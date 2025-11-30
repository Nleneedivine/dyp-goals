import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Calendar as CalendarIcon, Users } from "lucide-react";
import { getEventTimeDisplay } from "@/lib/utils";

const Schedule = () => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const eventDate = new Date("2026-11-28T20:00:00+01:00"); // Nov 28, 8PM WAT

    const timer = setInterval(() => {
      const now = new Date();
      const difference = eventDate.getTime() - now.getTime();

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const schedule = [
    {
      day: "Day 1 - Nov 28, 2026",
      theme: "Vision Casting",
      time: getEventTimeDisplay(),
      sessions: [
        { time: "8:00 PM", title: "Opening & Welcome", speaker: "DYP Team" },
        { time: "8:15 PM", title: "Creating Your Life Vision", speaker: "Lead Coach" },
        { time: "9:00 PM", title: "Vision to Goals Framework", speaker: "Strategy Coach" },
        { time: "9:20 PM", title: "Q&A & Closing", speaker: "DYP Team" },
      ],
      color: "from-primary to-secondary",
    },
    {
      day: "Day 2 - Nov 29, 2026",
      theme: "Goal Setting & Planning",
      time: getEventTimeDisplay(),
      sessions: [
        { time: "8:00 PM", title: "SMART Goals Framework", speaker: "Lead Coach" },
        { time: "8:30 PM", title: "Breaking Vision into Time Logs", speaker: "Time Coach" },
        { time: "9:00 PM", title: "AI Goals Analysis Workshop", speaker: "AI Coach Demo" },
        { time: "9:20 PM", title: "Q&A & Closing", speaker: "DYP Team" },
      ],
      color: "from-secondary to-accent",
    },
    {
      day: "Day 3 - Nov 30, 2026",
      theme: "Time Management & Action",
      time: getEventTimeDisplay(),
      sessions: [
        { time: "8:00 PM", title: "Yearly to Hourly Planning", speaker: "Productivity Coach" },
        { time: "8:30 PM", title: "Building Your Action Plan", speaker: "Lead Coach" },
        { time: "9:00 PM", title: "Accountability & Next Steps", speaker: "Community Lead" },
        { time: "9:20 PM", title: "Closing Ceremony", speaker: "DYP Team" },
      ],
      color: "from-accent to-primary",
    },
  ];

  return (
    <div className="min-h-screen pt-20 font-poppins">
      {/* Countdown Timer */}
      <section className="py-20 container mx-auto px-4">
        <h1 className="text-5xl md:text-6xl font-bold text-center mb-8 animate-fade-in">
          Event <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Schedule</span>
        </h1>
        <p className="text-xl text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
          Mark your calendar for three transformative days
        </p>

        <Card className="bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 border-primary/20 max-w-4xl mx-auto mb-16">
          <CardContent className="p-8">
            <h2 className="text-2xl font-semibold text-center mb-8">Event Starts In</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Days", value: timeLeft.days },
                { label: "Hours", value: timeLeft.hours },
                { label: "Minutes", value: timeLeft.minutes },
                { label: "Seconds", value: timeLeft.seconds },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="bg-card rounded-xl p-6 mb-2">
                    <span className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                      {item.value}
                    </span>
                  </div>
                  <span className="text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Schedule Details */}
      <section className="py-12 container mx-auto px-4">
        <div className="space-y-12">
          {schedule.map((day, dayIndex) => (
            <Card
              key={dayIndex}
              className="bg-card border-border overflow-hidden animate-fade-in"
              style={{ animationDelay: `${dayIndex * 0.1}s` }}
            >
              <div className={`bg-gradient-to-r ${day.color} p-6`}>
                <div className="flex items-center justify-between text-primary-foreground">
                  <div className="flex items-center gap-4">
                    <CalendarIcon className="h-8 w-8" />
                    <div>
                      <h3 className="text-2xl font-bold">{day.day}</h3>
                      <p className="text-lg opacity-90">{day.theme}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-90">Session Time</p>
                    <p className="font-semibold">{day.time}</p>
                  </div>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {day.sessions.map((session, sessionIndex) => (
                    <div
                      key={sessionIndex}
                      className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-[100px] text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span className="font-medium">{session.time}</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg">{session.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{session.speaker}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Additional Info */}
      <section className="py-12 bg-card">
        <div className="container mx-auto px-4">
          <Card className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 border-0">
            <CardContent className="p-8 text-center">
              <h3 className="text-2xl font-bold mb-4">Important Notes</h3>
              <ul className="text-muted-foreground space-y-2 max-w-2xl mx-auto">
                <li>• All times shown are automatically converted to your local timezone</li>
                <li>• Event times: 8:00 PM - 9:30 PM WAT (West Africa Time)</li>
                <li>• Sessions will be recorded and available for replay</li>
                <li>• Interactive AI Goals Review available before, during, and after the event</li>
                <li>• Q&A sessions after each day's content</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Schedule;