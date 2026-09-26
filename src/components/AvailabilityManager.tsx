import { useState } from "react";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type FixedBlock = Tables<"planner_fixed_blocks">;

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

const CATEGORIES = ["Sleep", "Work", "Class", "Commute", "Family", "Ministry", "Health", "Meal", "Other"];

export function AvailabilityManager({
  userId,
  blocks,
  onChange,
}: {
  userId: string;
  blocks: FixedBlock[];
  onChange: (blocks: FixedBlock[]) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    category: "Work",
    recurrence: "weekly" as "weekly" | "date",
    daysOfWeek: [1, 2, 3, 4, 5] as number[],
    specificDate: "",
    activeStartDate: "",
    activeEndDate: "",
    startTime: "09:00",
    endTime: "17:00",
    notes: "",
  });

  const resetDraft = () =>
    setDraft({
      title: "",
      category: "Work",
      recurrence: "weekly",
      daysOfWeek: [1, 2, 3, 4, 5],
      specificDate: "",
      activeStartDate: "",
      activeEndDate: "",
      startTime: "09:00",
      endTime: "17:00",
      notes: "",
    });

  const toggleDay = (day: number) => {
    setDraft((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((value) => value !== day)
        : [...current.daysOfWeek, day].sort((a, b) => a - b),
    }));
  };

  const addBlock = async () => {
    if (!draft.title.trim()) {
      toast({ title: "Add a commitment name", variant: "destructive" });
      return;
    }
    if (draft.startTime === draft.endTime) {
      toast({ title: "Start and end time cannot be the same", variant: "destructive" });
      return;
    }
    if (draft.recurrence === "weekly" && draft.daysOfWeek.length === 0) {
      toast({ title: "Choose at least one weekday", variant: "destructive" });
      return;
    }
    if (draft.recurrence === "date" && !draft.specificDate) {
      toast({ title: "Choose a date", variant: "destructive" });
      return;
    }
    if (draft.activeStartDate && draft.activeEndDate && draft.activeEndDate < draft.activeStartDate) {
      toast({ title: "Active end date cannot be before the start date", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("planner_fixed_blocks")
      .insert({
        user_id: userId,
        title: draft.title.trim(),
        category: draft.category,
        recurrence: draft.recurrence,
        days_of_week: draft.recurrence === "weekly" ? draft.daysOfWeek : [],
        specific_date: draft.recurrence === "date" ? draft.specificDate : null,
        active_start_date: draft.recurrence === "weekly" && draft.activeStartDate ? draft.activeStartDate : null,
        active_end_date: draft.recurrence === "weekly" && draft.activeEndDate ? draft.activeEndDate : null,
        start_time: draft.startTime,
        end_time: draft.endTime,
        notes: draft.notes.trim(),
      })
      .select("*")
      .single();
    setSaving(false);

    if (error) {
      toast({
        title: "Fixed commitment could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    onChange([...blocks, data]);
    resetDraft();
  };

  const deleteBlock = async (blockId: string) => {
    const { error } = await supabase.from("planner_fixed_blocks").delete().eq("id", blockId);
    if (error) {
      toast({
        title: "Fixed commitment could not be deleted",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    onChange(blocks.filter((block) => block.id !== blockId));
  };

  const daysLabel = (days: number[]) =>
    WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.label).join(", ");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CalendarClock className="h-4 w-4" />
          Fixed commitments
          {blocks.length > 0 && <Badge variant="secondary">{blocks.length}</Badge>}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Protect your unavailable time</DialogTitle>
          <DialogDescription>
            Add sleep, work, classes, commuting and other fixed commitments. Goal tasks should fit around these blocks rather than compete with them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {blocks.length > 0 && (
            <div className="space-y-2">
              <Label>Saved commitments</Label>
              {blocks
                .slice()
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .map((block) => (
                  <div key={block.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{block.category}</Badge>
                        <Badge variant="outline">
                          {block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)}
                          {block.crosses_midnight ? " +1 day" : ""}
                        </Badge>
                      </div>
                      <p className="mt-2 font-medium">{block.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {block.recurrence === "weekly"
                          ? `Every ${daysLabel(block.days_of_week)}`
                          : block.specific_date}
                        {block.active_start_date || block.active_end_date
                          ? ` · active ${block.active_start_date ?? "open"} → ${block.active_end_date ?? "open"}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteBlock(block.id)}
                      aria-label="Delete fixed commitment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          )}

          <div className="rounded-xl border bg-muted/15 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Commitment</Label>
                <Input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. Lectures, work shift, sleep"
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(category) => setDraft((current) => ({ ...current, category }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Occurs</Label>
                <Select
                  value={draft.recurrence}
                  onValueChange={(recurrence: "weekly" | "date") =>
                    setDraft((current) => ({ ...current, recurrence }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Every week</SelectItem>
                    <SelectItem value="date">One date</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.recurrence === "weekly" ? (
                <>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => (
                        <label
                          key={day.value}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                        >
                          <Checkbox
                            checked={draft.daysOfWeek.includes(day.value)}
                            onCheckedChange={() => toggleDay(day.value)}
                          />
                          {day.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Active from <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input
                      type="date"
                      value={draft.activeStartDate}
                      onChange={(event) => setDraft((current) => ({ ...current, activeStartDate: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Active until <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input
                      type="date"
                      min={draft.activeStartDate || undefined}
                      value={draft.activeEndDate}
                      onChange={(event) => setDraft((current) => ({ ...current, activeEndDate: event.target.value }))}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2 md:col-span-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={draft.specificDate}
                    onChange={(event) => setDraft((current) => ({ ...current, specificDate: event.target.value }))}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Start</Label>
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>End</Label>
                <Input
                  type="time"
                  value={draft.endTime}
                  onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))}
                />
                {draft.endTime < draft.startTime && (
                  <p className="text-xs text-muted-foreground">This block continues past midnight.</p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Anything the planner should know about this block"
                  className="min-h-[72px]"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={addBlock} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? "Saving..." : "Add commitment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
