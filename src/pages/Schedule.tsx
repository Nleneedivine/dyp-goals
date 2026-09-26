import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Video,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  eventBenefits,
  formatEventDate,
  formatNaira,
  type ProgramEvent,
} from "@/lib/event";

const dayThemes = [
  {
    theme: "Vision Casting",
    description:
      "Build a clearer picture of the direction you want your year and major life areas to move toward.",
    focus: ["Vision before goals", "Clarity and direction", "Turning ideas into a usable picture of the future"],
  },
  {
    theme: "Practical Goal Setting",
    description:
      "Turn vision into goals that are specific enough to plan, review, and act on.",
    focus: ["Goal clarity", "Breaking goals into meaningful milestones", "Defining what achievement looks like"],
  },
  {
    theme: "Practical Time Management",
    description:
      "Connect goals to realistic weekly and daily action instead of leaving them as intentions.",
    focus: ["Planning around real commitments", "Weekly and daily execution", "Review and accountability"],
  },
];

const Schedule = () => {
  const [event, setEvent] = useState<ProgramEvent | null>(null);
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    void supabase
      .from("program_events")
      .select("*")
      .eq("slug", "goals-masterclass-2026")
      .maybeSingle()
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
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
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

  const registrationPath = event
    ? "/apply/" + event.registration_slug
    : "/apply/goals-masterclass-2026";

  if (!event) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-28">
        <div className="container mx-auto max-w-5xl animate-pulse space-y-5">
          <div className="mx-auto h-14 max-w-2xl rounded bg-muted" />
          <div className="h-56 rounded-2xl bg-muted" />
          <div className="h-96 rounded-2xl bg-muted" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-16 pt-28">
      <section className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            DYP GOALS Master Class 2026
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-6xl">
            Three evenings. One practical progression.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Vision Casting → Practical Goal Setting → Practical Time Management
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <span className="rounded-full border bg-card px-4 py-2 text-sm font-medium">
              {formatEventDate(event.starts_at)} – {formatEventDate(event.ends_at)}
            </span>
            <span className="rounded-full border bg-card px-4 py-2 text-sm font-medium">
              {event.session_start_time} – {event.session_end_time} WAT
            </span>
            <span className="rounded-full border bg-card px-4 py-2 text-sm font-medium">
              Virtual
            </span>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="text-muted-foreground line-through">
              {formatNaira(event.original_price)}
            </span>
            <span className="text-3xl font-bold text-primary">
              {formatNaira(event.discounted_price)}
            </span>
          </div>
        </div>

        <Card className="mx-auto mt-10 max-w-4xl border-primary/20 bg-primary/5">
          <CardContent className="p-6 sm:p-8">
            <p className="text-center text-sm font-semibold uppercase tracking-wide text-primary">
              Event starts in
            </p>
            <div className="mt-5 grid grid-cols-4 gap-2 sm:gap-4">
              {[
                ["Days", timeLeft.days],
                ["Hours", timeLeft.hours],
                ["Min", timeLeft.minutes],
                ["Sec", timeLeft.seconds],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border bg-background p-3 text-center sm:p-5">
                  <p className="text-2xl font-bold sm:text-4xl">
                    {String(value).padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 text-center">
              <Button asChild size="lg" className="gap-2">
                <Link to={registrationPath}>
                  Register for {formatNaira(event.discounted_price)}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="container mx-auto mt-14 max-w-5xl px-4">
        <div className="space-y-5">
          {dayThemes.map((day, index) => (
            <Card key={day.theme} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
                  <div className="flex flex-col justify-between bg-primary/8 p-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
                        Day {index + 1}
                      </p>
                      <p className="mt-2 text-xl font-bold">
                        {dates[index] ? formatEventDate(dates[index].toISOString()) : ""}
                      </p>
                    </div>
                    <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {event.session_start_time} – {event.session_end_time} WAT
                    </div>
                  </div>

                  <div className="p-6 sm:p-8">
                    <h2 className="text-2xl font-bold">{day.theme}</h2>
                    <p className="mt-3 max-w-2xl text-muted-foreground">
                      {day.description}
                    </p>
                    <div className="mt-5 grid gap-2 sm:grid-cols-3">
                      {day.focus.map((item) => (
                        <div key={item} className="flex gap-2 rounded-lg border bg-muted/15 p-3 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="container mx-auto mt-14 max-w-5xl px-4">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold">What you will gain</h2>
              <div className="mt-4 space-y-3">
                {eventBenefits(event.benefits).map((benefit) => (
                  <div key={benefit} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/15">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-primary">
                <Video className="h-5 w-5" />
                <p className="text-sm font-semibold uppercase tracking-wide">Virtual event</p>
              </div>
              <h2 className="mt-3 text-2xl font-bold">Ready to join?</h2>
              <p className="mt-3 text-muted-foreground">
                Registration is open at the current discounted price of {formatNaira(event.discounted_price)}.
                The original listed price is {formatNaira(event.original_price)}.
              </p>
              <Button asChild className="mt-6 w-full gap-2">
                <Link to={registrationPath}>
                  Start registration
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Schedule;
