import { Check, MonitorCog, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUiMode, type UiMode } from "@/components/UiModeProvider";

const choices: Array<{
  value: UiMode;
  title: string;
  description: string;
  icon: typeof MonitorCog;
}> = [
  {
    value: "classic",
    title: "Current UI",
    description: "The existing interface remains unchanged and is the safe fallback while UI 2.0 is being built.",
    icon: MonitorCog,
  },
  {
    value: "ui2",
    title: "UI 2.0 Preview",
    description: "Preview the new premium component system as it is progressively introduced across the application.",
    icon: Sparkles,
  },
];

export default function AdminAppearance() {
  const { mode, setMode } = useUiMode();

  return (
    <main className="page-shell max-w-5xl">
      <div className="mb-8">
        <Button asChild variant="ghost" className="mb-3">
          <Link to="/admin">← Back to admin</Link>
        </Button>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Design system</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Interface preview</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Switch between the production interface and the new UI 2.0 design while the redesign is developed.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {choices.map((choice) => {
          const selected = mode === choice.value;
          const Icon = choice.icon;
          return (
            <button
              key={choice.value}
              type="button"
              onClick={() => setMode(choice.value)}
              className={
                "group relative rounded-2xl border p-6 text-left transition-all " +
                (selected
                  ? "border-primary bg-primary/5 shadow-[0_16px_50px_-35px_hsl(var(--primary))]"
                  : "border-border bg-card hover:border-primary/30 hover:bg-muted/30")
              }
              aria-pressed={selected}
            >
              <div className="flex items-start justify-between gap-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground">
                  <Icon className="h-6 w-6" />
                </div>
                <div
                  className={
                    "flex h-7 w-7 items-center justify-center rounded-full border " +
                    (selected ? "border-primary bg-primary text-primary-foreground" : "border-border")
                  }
                >
                  {selected && <Check className="h-4 w-4" />}
                </div>
              </div>
              <h2 className="mt-6 text-xl font-semibold">{choice.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{choice.description}</p>
            </button>
          );
        })}
      </div>

      <Card className="mt-7">
        <CardHeader>
          <CardTitle className="text-lg">Preview status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Your current preview is <strong className="text-foreground">{mode === "ui2" ? "UI 2.0" : "Current UI"}</strong>.
          </p>
          <p>
            During development this preference is stored only in this browser, so testing UI 2.0 cannot change the interface for participants.
          </p>
          <p>
            Once UI 2.0 is complete, this control can be connected to a platform-wide rollout setting for staff, selected cohorts, or everyone.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
