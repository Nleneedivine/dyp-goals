import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Calendar as CalendarIcon, Users } from "lucide-react";

const Schedule = () => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const eventDate = new Date("2025-12-06T00:00:00");

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
      day: "Day 1 - Dec 6, 2025",
      theme: "Vision Casting",
      sessions: [
        { time: "9:00 AM", title: "Opening & Welcome", speaker: "DYP Team" },
        { time: "10:00 AM", title: "Creating Your Life Vision", speaker: "Lead Coach" },
        { time: "12:00 PM", title: "Break & Networking" },
        { time: "1:00 PM", title: "Vision Board Workshop", speaker: "Creative Director" },
        { time: "3:00 PM", title: "AI Coach Introduction", speaker: "Tech Team" },
      ],
      color: "from-primary to-secondary",
    },
    {
      day: "Day 2 - Dec 7, 2025",
      theme: "Goal Setting",
      sessions: [
        { time: "9:00 AM", title: "SMART Goals Framework", speaker: "Lead Coach" },
        { time: "10:30 AM", title: "Breaking Down Big Dreams", speaker: "Strategy Coach" },
        { time: "12:00 PM", title: "Break & Reflection" },
        { time: "1:00 PM", title: "AI Goals Analysis Workshop", speaker: "AI Coach Demo" },
        { time: "3:00 PM", title: "Peer Accountability Groups", speaker: "Community Lead" },
      ],
      color: "from-secondary to-accent",
    },
    {
      day: "Day 3 - Dec 8, 2025",
      theme: "Time Management",
      sessions: [
        { time: "9:00 AM", title: "Time Blocking Mastery", speaker: "Productivity Coach" },
        { time: "10:30 AM", title: "Building Daily Habits", speaker: "Habits Expert" },
        { time: "12:00 PM", title: "Break & Q&A" },
        { time: "1:00 PM", title: "Creating Your Action Plan", speaker: "Lead Coach" },
        { time: "3:00 PM", title: "Closing & Next Steps", speaker: "DYP Team" },
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
                <div className="flex items-center gap-4 text-primary-foreground">
                  <CalendarIcon className="h-8 w-8" />
                  <div>
                    <h3 className="text-2xl font-bold">{day.day}</h3>
                    <p className="text-lg opacity-90">{day.theme}</p>
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
                <li>• All times are in your local timezone</li>
                <li>• Sessions will be recorded and available for replay</li>
                <li>• Live Q&A sessions with coaches after each day</li>
                <li>• Interactive AI Goals Review available throughout the event</li>
                <li>• Networking breaks in virtual rooms</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Schedule;