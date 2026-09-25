import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Calendar as CalendarIcon, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { eventBenefits, formatEventDate, formatNaira, type ProgramEvent } from "@/lib/event";

const dayThemes = [
  {
    theme: "Vision Casting",
    sessions: [
      { time: "8:00 PM", title: "Opening & Welcome", speaker: "DYP Team" },
      { time: "8:15 PM", title: "Creating Your Life Vision", speaker: "Lead Coach" },
      { time: "9:00 PM", title: "Vision to Goals Framework", speaker: "Strategy Coach" },
      { time: "9:20 PM", title: "Q&A & Closing", speaker: "DYP Team" },
    ],
    color: "from-primary to-secondary",
  },
  {
    theme: "Goal Setting & Planning",
    sessions: [
      { time: "8:00 PM", title: "SMART Goals Framework", speaker: "Lead Coach" },
      { time: "8:30 PM", title: "Breaking Vision into Time Logs", speaker: "Time Coach" },
      { time: "9:00 PM", title: "AI Goals Analysis Workshop", speaker: "AI Coach Demo" },
      { time: "9:20 PM", title: "Q&A & Closing", speaker: "DYP Team" },
    ],
    color: "from-secondary to-accent",
  },
  {
    theme: "Time Management & Action",
    sessions: [
      { time: "8:00 PM", title: "Yearly to Hourly Planning", speaker: "Productivity Coach" },
      { time: "8:30 PM", title: "Building Your Action Plan", speaker: "Lead Coach" },
      { time: "9:00 PM", title: "Accountability & Next Steps", speaker: "Community Lead" },
      { time: "9:20 PM", title: "Closing Ceremony", speaker: "DYP Team" },
    ],
    color: "from-accent to-primary",
  },
];

const Schedule = () => {
  const [event, setEvent] = useState<ProgramEvent | null>(null);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    supabase.from("program_events").select("*").eq("slug", "goals-masterclass-2026").maybeSingle()
      .then(({ data }) => setEvent((data ?? null) as ProgramEvent | null));
  }, []);

  useEffect(() => {
    if (!event) return;
    const tick = () => {
      const difference = new Date(event.starts_at).getTime() - Date.now();
      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setTimeLeft({
        days: Math.floor(difference / 86400000),
        hours: Math.floor((difference / 3600000) % 24),
        minutes: Math.floor((difference / 60000) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [event]);

  const dates = useMemo(() => {
    if (!event) return [];
    const start = new Date(event.starts_at);
    return [0, 1, 2].map((offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      return date;
    });
  }, [event]);

  const registrationPath = event ? "/apply/" + event.registration_slug : "/apply/goals-masterclass-2026";

  if (!event) {
    return <main className="min-h-screen pt-28 page-shell"><div className="mx-auto max-w-4xl animate-pulse rounded-2xl bg-muted p-16" /></main>;
  }

  return (
    <div className="min-h-screen pt-20 font-poppins">
      <section className="py-16 container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">DYP GOALS Master Class 2026</p>
          <h1 className="text-5xl font-bold md:text-6xl">Event <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Schedule</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
            Three practical evenings designed to help you move from vision to goals, planning and daily action.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <span className="rounded-full bg-primary/10 px-4 py-2 font-medium text-primary">{formatEventDate(event.starts_at, event.timezone)} – {formatEventDate(event.ends_at, event.timezone)}</span>
            <span className="rounded-full bg-secondary/10 px-4 py-2 font-medium text-secondary">{event.session_start_time} – {event.session_end_time} WAT</span>
          </div>
          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="text-muted-foreground">Original:</span>
            <span className="text-lg text-muted-foreground line-through">{formatNaira(event.original_price)}</span>
            <span className="text-2xl font-bold text-primary">{formatNaira(event.discounted_price)}</span>
          </div>
        </div>

        <Card className="mx-auto mb-16 mt-12 max-w-4xl border-primary/20 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
          <CardContent className="p-8">
            <h2 className="mb-8 text-center text-2xl font-semibold">Event Starts In</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Days", value: timeLeft.days },
                { label: "Hours", value: timeLeft.hours },
                { label: "Minutes", value: timeLeft.minutes },
                { label: "Seconds", value: timeLeft.seconds },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="mb-2 rounded-xl bg-card p-6">
                    <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-4xl font-bold text-transparent md:text-5xl">{item.value}</span>
                  </div>
                  <span className="text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Button asChild size="lg" className="font-semibold">
                <Link to={registrationPath}>Register for {formatNaira(event.discounted_price)} <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="container mx-auto px-4 pb-16">
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-xl font-semibold">What you will gain</h2>
              <div className="space-y-3">
                {eventBenefits(event.benefits).map((benefit) => (
                  <div key={benefit} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><span className="text-muted-foreground">{benefit}</span></div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/15">
            <CardContent className="p-6">
              <p className="text-sm font-semibold uppercase text-primary">Registration</p>
              <h2 className="mt-2 text-2xl font-bold">Join at the current discounted price</h2>
              <p className="mt-3 text-muted-foreground">Original price {formatNaira(event.original_price)}. Current offer {formatNaira(event.discounted_price)}.</p>
              <Button asChild className="mt-6 w-full"><Link to={registrationPath}>Start registration <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-12 container mx-auto px-4">
        <div className="space-y-12">
          {dayThemes.map((day, dayIndex) => (
            <Card key={day.theme} className="overflow-hidden border-border">
              <div className={"bg-gradient-to-r " + day.color + " p-6"}>
                <div className="flex items-center justify-between text-primary-foreground">
                  <div className="flex items-center gap-4">
                    <CalendarIcon className="h-8 w-8" />
                    <div>
                      <h3 className="text-2xl font-bold">Day {dayIndex + 1} - {dates[dayIndex] ? formatEventDate(dates[dayIndex].toISOString(), event.timezone) : ""}</h3>
                      <p className="text-lg opacity-90">{day.theme}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-90">Session Time</p>
                    <p className="font-semibold">{event.session_start_time} – {event.session_end_time} WAT</p>
                  </div>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {day.sessions.map((session) => (
                    <div key={session.title} className="flex items-start gap-4 rounded-lg p-4 transition-colors hover:bg-muted/50">
                      <div className="flex min-w-[100px] items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" /><span className="font-medium">{session.time}</span></div>
                      <div className="flex-1"><h4 className="text-lg font-semibold">{session.title}</h4><div className="mt-1 flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /><span>{session.speaker}</span></div></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-card py-12">
        <div className="container mx-auto px-4">
          <Card className="border-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20">
            <CardContent className="p-8 text-center">
              <h3 className="mb-4 text-2xl font-bold">Important Notes</h3>
              <ul className="mx-auto max-w-2xl space-y-2 text-muted-foreground">
                <li>• All times are shown in West Africa Time (WAT).</li>
                <li>• Sessions will be recorded and available for replay where applicable.</li>
                <li>• AI-assisted goals review is part of the DYP GOALS experience.</li>
                <li>• Q&A sessions follow the core teaching each day.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Schedule;
