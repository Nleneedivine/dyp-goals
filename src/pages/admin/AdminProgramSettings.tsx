import { useEffect, useState } from "react";
import { CalendarDays, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatProgramDate } from "@/hooks/use-platform-configuration";

export default function AdminProgramSettings() {
  const [startDate, setStartDate] = useState("2027-01-08");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    void supabase
      .from("platform_configuration")
      .select("accountability_lab_start_date")
      .eq("id", "global")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.accountability_lab_start_date) setStartDate(data.accountability_lab_start_date);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("platform_configuration")
      .update({ accountability_lab_start_date: startDate })
      .eq("id", "global");
    setSaving(false);

    if (error) {
      toast({ title: "Program settings could not be saved", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Accountability Lab date updated",
      description: "The shared program start date is now " + formatProgramDate(startDate) + ".",
    });
  };

  return (
    <main className="page-shell max-w-4xl">
      <div className="mb-8">
        <Button asChild variant="ghost" className="mb-3"><Link to="/admin">← Back to admin</Link></Button>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Program operations</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Program settings</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">Configure shared dates used across the GOALS participant experience.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Accountability Lab</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="accountability-lab-start">Start date</Label>
            <Input id="accountability-lab-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <p className="text-sm text-muted-foreground">Default: 8 January 2027. This date is shared with participant-facing program pages.</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4 text-sm">Current display date: <strong>{formatProgramDate(startDate)}</strong></div>
          <Button onClick={() => void save()} disabled={saving || !startDate}>
            <Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save program settings"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}