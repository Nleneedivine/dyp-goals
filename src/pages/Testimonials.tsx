import { Link } from "react-router-dom";
import { ArrowRight, Quote, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { FeaturedTestimonials } from "@/components/testimonials/FeaturedTestimonials";

const Testimonials = () => {
  return (
    <main className="min-h-screen px-4 pb-16 pt-28">
      <div className="container mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Quote className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Participant stories
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-6xl">
            Real stories, published responsibly
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            We only want to publish participant testimonials and outcome claims that we can
            attribute accurately. Verified stories from DYP GOALS participants will appear
            here as they are approved for public use.
          </p>
        </div>

        <div className="mt-8 text-center"><Button asChild><Link to="/testimonials/submit">Share your GOALS story</Link></Button></div>
        <div className="mt-10"><FeaturedTestimonials placement="testimonials" limit={120} showEmpty /></div>

        <Card className="mx-auto mt-12 max-w-3xl border-primary/15">
          <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Real voices. Clear permission.</h2>
              <p className="mt-2 leading-7 text-muted-foreground">
                We do not use invented names, ratings, participant counts, achievement rates,
                or transformation claims as social proof. When a story is shown here, it should
                reflect a real participant and a claim DYP has permission to share.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-3 rounded-2xl border bg-muted/20 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Interested in the 2026 GOALS Master Class?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the three-day schedule or begin registration.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/schedule">View schedule</Link>
            </Button>
            <Button asChild className="gap-2">
              <Link to="/apply/goals-masterclass-2026">
                Register
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Testimonials;
