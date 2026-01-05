import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { TimePickerPopover } from "./TimePickerPopover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, RefreshCw, Calendar } from "lucide-react";

export interface RecurringTask {
  id: string;
  activity: string;
  time: string;
  frequency: "daily" | "weekly";
  daysOfWeek?: number[]; // 0 = Sunday, 6 = Saturday
  isActive: boolean;
  category?: string;
  createdAt: string;
}

interface RecurringTasksProps {
  tasks: RecurringTask[];
  onAddTask: (task: Omit<RecurringTask, "id" | "createdAt">) => void;
  onUpdateTask: (taskId: string, updates: Partial<RecurringTask>) => void;
  onDeleteTask: (taskId: string) => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function RecurringTasks({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}: RecurringTasksProps) {
  const [newActivity, setNewActivity] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [newFrequency, setNewFrequency] = useState<"daily" | "weekly">("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const handleAddTask = () => {
    if (!newActivity.trim()) return;

    onAddTask({
      activity: newActivity.trim(),
      time: newTime,
      frequency: newFrequency,
      daysOfWeek: newFrequency === "weekly" ? selectedDays : undefined,
      isActive: true,
    });

    setNewActivity("");
    setNewTime("09:00");
    setNewFrequency("daily");
    setSelectedDays([1, 2, 3, 4, 5]);
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <RefreshCw className="h-5 w-5 text-primary" />
          Recurring Tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new recurring task */}
        <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="flex gap-2">
            <Input
              placeholder="Task name..."
              value={newActivity}
              onChange={(e) => setNewActivity(e.target.value)}
              className="flex-1"
            />
            <TimePickerPopover value={newTime} onChange={setNewTime} />
          </div>

          <div className="flex gap-4 items-center">
            <Select
              value={newFrequency}
              onValueChange={(v: "daily" | "weekly") => setNewFrequency(v)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>

            {newFrequency === "weekly" && (
              <div className="flex gap-1">
                {DAYS_OF_WEEK.map((day) => (
                  <Button
                    key={day.value}
                    variant={selectedDays.includes(day.value) ? "default" : "outline"}
                    size="sm"
                    className="w-9 h-9 p-0"
                    onClick={() => toggleDay(day.value)}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <Button onClick={handleAddTask} disabled={!newActivity.trim()} className="w-full gap-2">
            <Plus className="h-4 w-4" />
            Add Recurring Task
          </Button>
        </div>

        {/* List of recurring tasks */}
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recurring tasks yet. Add one above!
              </p>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    task.isActive
                      ? "bg-background border-border"
                      : "bg-muted/30 border-muted opacity-60"
                  }`}
                >
                  <Switch
                    checked={task.isActive}
                    onCheckedChange={(checked) =>
                      onUpdateTask(task.id, { isActive: checked })
                    }
                  />

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{task.activity}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{task.time}</span>
                      <Badge variant="outline" className="text-xs">
                        {task.frequency === "daily" ? (
                          "Every day"
                        ) : (
                          <>
                            {task.daysOfWeek
                              ?.map((d) => DAYS_OF_WEEK.find((day) => day.value === d)?.label)
                              .join(", ")}
                          </>
                        )}
                      </Badge>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteTask(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
