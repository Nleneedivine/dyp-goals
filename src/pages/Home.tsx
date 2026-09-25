import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Target, Calendar, Users, Sparkles, Trophy, Clock, ArrowRight, CheckCircle2 } from "lucide-react";
import heroImage from "@/assets/hero-bg.jpg";
import goalSettingGuide from "@/assets/goal-setting-guide.png";
import timeManagement from "@/assets/time-management.png";
import { supabase } from "@/integrations/supabase/client";
import type { ProgramForm } from "@/lib/formTypes";
import { eventBenefits, formatEventDate, formatNaira, type ProgramEvent } from "@/lib/event";

const Home = () => {
  const [featuredForms, setFeaturedForms] = useState<ProgramForm[]>([]);
  const [event, setEvent] = useState<ProgramEvent | null>(null);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    void supabase.from("program_forms").select("*").eq("status", "published").eq("featured", true).order("updated_at", { ascending: false }).limit(6).then(({ data }) => setFeaturedForms((data ?? []) as ProgramForm[]));
    void supabase.from("program_events").select("*").eq("slug", "goals-masterclass-2026").maybeSingle().then(({ data }) => setEvent((data ?? null) as ProgramEvent | null));
  }, []);
  useEffect(() => {
    if (!event) return;
    const tick = () => {
      const difference = new Date(event.starts_at).getTime() - Date.now();
      setTimeLeft(difference > 0 ? {
        days: Math.floor(difference / 86400000),
        hours: Math.floor((difference / 3600000) % 24),
        minutes: Math.floor((difference / 60000) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      } : { days: 0, hours: 0, minutes: 0, seconds: 0 });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [event]);
  return (
    <div className="min-h-screen font-poppins">
      {/* Hero Section */}
      <section
        className="relative min-h-screen flex items-center justify-center bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background"></div>
        <div className="container mx-auto px-4 relative z-10 text-center">
          <div className="animate-fade-in">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-6 text-foreground leading-tight">
              Transform Your Purpose Into Action
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Join DYP GOALS - A virtual masterclass teaching vision casting, goal setting, and time management for youth and young adults.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link to={event ? "/apply/" + event.registration_slug : "/apply/goals-masterclass-2026"}>
                <Button size="lg" className="font-semibold text-lg px-8 py-6 animate-glow">
                  <ArrowRight className="mr-2 h-5 w-5" />
                  Register Now
                </Button>
              </Link>
              <Link to="/schedule">
                <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 font-semibold text-lg px-8 py-6">
                  <Calendar className="mr-2 h-5 w-5" />
                  View Schedule
                </Button>
              </Link>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <span>Purpose-driven programs</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-secondary" />
                <span>{event ? formatEventDate(event.starts_at) : "Upcoming event"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-accent" />
                <span>Youth & Young Adults</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {featuredForms.length > 0 && <section className="bg-secondary/45 py-16 sm:py-20"><div className="container mx-auto px-4"><div className="mb-10 max-w-2xl"><p className="mb-2 text-sm font-semibold uppercase text-primary">Open opportunities</p><h2 className="text-3xl font-bold sm:text-4xl">Apply to a DYP program</h2><p className="mt-3 text-muted-foreground">Choose a program and submit your application from any device.</p></div><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{featuredForms.map((form) => <Card key={form.id} className="border-primary/10"><CardContent className="p-6"><p className="text-xs font-semibold uppercase text-primary">{form.brand}</p><h3 className="mt-2 text-xl font-semibold">{form.title}</h3><p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{form.description}</p><Button asChild variant="outline" className="mt-5"><Link to={`/apply/${form.slug}`}>Open application<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>)}</div></div></section>}

      {event && (
        <section className="border-y border-primary/10 bg-card py-10">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-primary">Next live experience</p>
                <h2 className="mt-2 text-3xl font-bold">{formatEventDate(event.starts_at)} – {formatEventDate(event.ends_at)}</h2>
                <p className="mt-2 text-muted-foreground">{event.session_start_time} – {event.session_end_time} WAT · Online</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className="text-muted-foreground line-through">{formatNaira(event.original_price)}</span>
                  <span className="text-3xl font-bold text-primary">{formatNaira(event.discounted_price)}</span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">Discounted</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[["Days",timeLeft.days],["Hours",timeLeft.hours],["Min",timeLeft.minutes],["Sec",timeLeft.seconds]].map(([label,value]) => (
                  <div key={String(label)} className="rounded-xl border bg-background p-3">
                    <div className="text-2xl font-bold text-primary">{String(value).padStart(2,"0")}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="py-20 container mx-auto px-4">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
          What You'll <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Gain</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="bg-card hover:shadow-xl transition-shadow animate-fade-in border-border">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                <Target className="h-8 w-8 text-primary-foreground" />
              </div>
              <h3 className="text-2xl font-semibold mb-4">Vision Casting</h3>
              <p className="text-muted-foreground">
                Learn to create a compelling vision for your future with clarity and purpose.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card hover:shadow-xl transition-shadow animate-fade-in border-border" style={{ animationDelay: '0.1s' }}>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-secondary to-accent rounded-full flex items-center justify-center">
                <Trophy className="h-8 w-8 text-secondary-foreground" />
              </div>
              <h3 className="text-2xl font-semibold mb-4">SMART Goals</h3>
              <p className="text-muted-foreground">
                Transform your dreams into actionable, achievable SMART goals with AI assistance.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card hover:shadow-xl transition-shadow animate-fade-in border-border" style={{ animationDelay: '0.2s' }}>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-accent to-primary rounded-full flex items-center justify-center">
                <Clock className="h-8 w-8 text-accent-foreground" />
              </div>
              <h3 className="text-2xl font-semibold mb-4">Time Management</h3>
              <p className="text-muted-foreground">
                Master time management techniques to turn your goals into daily habits.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {event && (
        <section className="bg-secondary/20 py-20">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">Your investment</p>
              <h2 className="text-4xl font-bold md:text-5xl">What You'll <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Gain</span></h2>
              <p className="mt-4 text-lg text-muted-foreground">This is more than three evenings of teaching. You leave with a clearer direction and practical tools to act on it.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {eventBenefits(event.benefits).map((benefit) => (
                <div key={benefit} className="flex gap-3 rounded-xl border bg-card p-5">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link to={"/apply/" + event.registration_slug}><Button size="lg" className="px-8">Register for {formatNaira(event.discounted_price)} <ArrowRight className="ml-2 h-5 w-5" /></Button></Link>
            </div>
          </div>
        </section>
      )}

      {/* Video Section */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12">
            See What <span className="bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">Awaits</span>
          </h2>
          <div className="max-w-4xl mx-auto aspect-video bg-muted rounded-xl flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                <Sparkles className="h-10 w-10 text-primary-foreground" />
              </div>
              <p className="text-muted-foreground">Event Highlight Video Coming Soon</p>
            </div>
          </div>
        </div>
      </section>

      {/* Goal Setting Framework */}
      <section className="py-20 container mx-auto px-4">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-12">
          The <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">DYP Framework</span>
        </h2>
        <p className="text-xl text-center text-muted-foreground mb-16 max-w-3xl mx-auto">
          Transform your visions into actionable time logs through our proven 3-step process: Vision → Goals → Time Management
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
          <Card className="bg-card border-border overflow-hidden hover:shadow-xl transition-shadow">
            <CardContent className="p-0">
              <img 
                src={goalSettingGuide} 
                alt="DYP Goal Setting Framework - Vision to SMART Goals" 
                className="w-full h-auto"
              />
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border overflow-hidden hover:shadow-xl transition-shadow">
            <CardContent className="p-0">
              <img 
                src={timeManagement} 
                alt="DYP Time Management System - Yearly to Hourly Planning" 
                className="w-full h-auto"
              />
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 text-center">
          <h3 className="text-2xl font-semibold mb-6">From Vision to Daily Action</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { step: "1", title: "Vision", desc: "Define your big picture" },
              { step: "2", title: "Goals", desc: "Break into SMART chunks" },
              { step: "3", title: "Planning", desc: "Create time logs" },
              { step: "4", title: "Action", desc: "Execute daily" }
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-2xl font-bold text-primary-foreground">
                  {item.step}
                </div>
                <h4 className="font-semibold text-lg mb-2">{item.title}</h4>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 container mx-auto px-4">
        <div className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 rounded-3xl p-12 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Transform</span> Your Life?
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join young people who want to turn vision into clear goals, realistic plans and consistent action with DYP GOALS.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={event ? "/apply/" + event.registration_slug : "/apply/goals-masterclass-2026"}>
              <Button size="lg" className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold text-lg px-8 py-6">
                Register for GOALS
              </Button>
            </Link>
            <Link to="/mentorship">
              <Button size="lg" variant="outline" className="border-accent text-accent hover:bg-accent/10 font-semibold text-lg px-8 py-6">
                Request Mentorship
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;