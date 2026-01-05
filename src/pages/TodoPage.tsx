import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { TimePickerPopover } from "@/components/timeplanner/TimePickerPopover";
import { TodoArchive } from "@/components/timeplanner/TodoArchive";
import { RecurringTasks, RecurringTask } from "@/components/timeplanner/RecurringTasks";
import { WeeklySummary } from "@/components/timeplanner/WeeklySummary";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  GripVertical,
  Clock,
  CalendarIcon,
  Archive,
  RefreshCw,
  BarChart3,
  Bell,
  BellOff,
  Briefcase,
  Book,
  Dumbbell,
  Utensils,
  Coffee,
  Users,
  Tv,
  Bed,
} from "lucide-react";

interface TodoItem {
  id: string;
  activity: string;
  time: string;
  completed: boolean;
  category?: string;
  reminderEnabled?: boolean;
}

interface ArchivedDay {
  date: string;
  items: TodoItem[];
}

interface BookItem {
  id: string;
  title: string;
  month: string;
  completed: boolean;
  addedAt: string;
}

const categoryIcons: Record<string, any> = {
  work: Briefcase,
  study: Book,
  exercise: Dumbbell,
  meal: Utensils,
  break: Coffee,
  social: Users,
  leisure: Tv,
  sleep: Bed,
  routine: Clock,
};

const STORAGE_KEY = "standalone-todo";

export default function TodoPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [todoItemsByDate, setTodoItemsByDate] = useState<Record<string, TodoItem[]>>({});
  const [archives, setArchives] = useState<ArchivedDay[]>([]);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [newActivity, setNewActivity] = useState("");
  const [activeTab, setActiveTab] = useState<string>("todo");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const isToday = format(new Date(), "yyyy-MM-dd") === dateKey;
  const todoItems = todoItemsByDate[dateKey] || [];

  // Get user email for email reminders
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }
    };
    getUser();
  }, []);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
    }
  }, []);

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === "granted");
      if (permission === "granted") {
        toast({
          title: "Notifications enabled",
          description: "You'll receive reminders for your scheduled tasks.",
        });
      }
    }
  };

  // Load saved data
  useEffect(() => {
    const savedTodos = localStorage.getItem(`${STORAGE_KEY}-todos`);
    const savedArchives = localStorage.getItem(`${STORAGE_KEY}-archives`);
    const savedBooks = localStorage.getItem(`${STORAGE_KEY}-books`);
    const savedRecurring = localStorage.getItem(`${STORAGE_KEY}-recurring`);

    if (savedTodos) {
      try { setTodoItemsByDate(JSON.parse(savedTodos)); } catch { }
    }
    if (savedArchives) {
      try { setArchives(JSON.parse(savedArchives)); } catch { }
    }
    if (savedBooks) {
      try { setBooks(JSON.parse(savedBooks)); } catch { }
    }
    if (savedRecurring) {
      try { setRecurringTasks(JSON.parse(savedRecurring)); } catch { }
    }
  }, []);

  // Save data
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}-todos`, JSON.stringify(todoItemsByDate));
  }, [todoItemsByDate]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}-archives`, JSON.stringify(archives));
  }, [archives]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}-books`, JSON.stringify(books));
  }, [books]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}-recurring`, JSON.stringify(recurringTasks));
  }, [recurringTasks]);

  // Auto-archive and apply recurring tasks
  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const toArchive: string[] = [];

    Object.entries(todoItemsByDate).forEach(([date, items]) => {
      if (date < today && items.length > 0) {
        toArchive.push(date);
      }
    });

    if (toArchive.length > 0) {
      const newArchives = [...archives];
      const newTodosByDate = { ...todoItemsByDate };

      toArchive.forEach((date) => {
        const existingArchive = newArchives.find((a) => a.date === date);
        if (!existingArchive) {
          newArchives.push({ date, items: newTodosByDate[date] });
        }
        delete newTodosByDate[date];
      });

      setArchives(newArchives);
      setTodoItemsByDate(newTodosByDate);
    }
  }, [todoItemsByDate]);

  // Apply recurring tasks for selected date
  useEffect(() => {
    const dayOfWeek = selectedDate.getDay();
    const existingIds = new Set((todoItemsByDate[dateKey] || []).map(item => 
      `recurring-${item.activity}-${item.time}`
    ));

    const tasksToAdd: TodoItem[] = [];

    recurringTasks.forEach((task) => {
      if (!task.isActive) return;

      const shouldAdd =
        task.frequency === "daily" ||
        (task.frequency === "weekly" && task.daysOfWeek?.includes(dayOfWeek));

      if (shouldAdd) {
        const recurringId = `recurring-${task.activity}-${task.time}`;
        if (!existingIds.has(recurringId)) {
          tasksToAdd.push({
            id: `${Date.now()}-${Math.random()}`,
            activity: task.activity,
            time: task.time,
            completed: false,
            category: task.category,
          });
        }
      }
    });

    if (tasksToAdd.length > 0) {
      setTodoItemsByDate((prev) => ({
        ...prev,
        [dateKey]: [...(prev[dateKey] || []), ...tasksToAdd],
      }));
    }
  }, [dateKey, recurringTasks]);

  // Task reminder checker
  useEffect(() => {
    if (!notificationsEnabled) return;

    const checkReminders = () => {
      const now = new Date();
      const currentTime = format(now, "HH:mm");
      const todayKey = format(now, "yyyy-MM-dd");
      const todayItems = todoItemsByDate[todayKey] || [];

      todayItems.forEach((item) => {
        if (item.completed) return;
        
        // Check if task starts in 5 minutes
        const [taskHour, taskMin] = item.time.split(":").map(Number);
        const taskDate = new Date(now);
        taskDate.setHours(taskHour, taskMin, 0, 0);
        
        const diffMs = taskDate.getTime() - now.getTime();
        const diffMinutes = diffMs / (1000 * 60);

        if (diffMinutes > 0 && diffMinutes <= 5) {
          const notifKey = `todo-notif-${item.id}-${item.time}`;
          if (!localStorage.getItem(notifKey)) {
            localStorage.setItem(notifKey, "shown");
            setTimeout(() => localStorage.removeItem(notifKey), 10 * 60 * 1000);

            new Notification(`⏰ Upcoming: ${item.activity}`, {
              body: `Starting at ${item.time}`,
              icon: "/favicon.ico",
            });
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 60 * 1000);
    checkReminders();

    return () => clearInterval(interval);
  }, [notificationsEnabled, todoItemsByDate]);

  const handleAddCustomActivity = () => {
    if (!newActivity.trim()) return;

    const newItem: TodoItem = {
      id: `${Date.now()}-${Math.random()}`,
      activity: newActivity.trim(),
      time: "09:00",
      completed: false,
    };

    setTodoItemsByDate((prev) => ({
      ...prev,
      [dateKey]: [...(prev[dateKey] || []), newItem],
    }));
    setNewActivity("");
  };

  const handleToggleComplete = (id: string) => {
    setTodoItemsByDate((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      ),
    }));
  };

  const handleRemoveItem = (id: string) => {
    setTodoItemsByDate((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).filter((item) => item.id !== id),
    }));
  };

  const handleTimeChange = (id: string, newTime: string) => {
    setTodoItemsByDate((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map((item) =>
        item.id === id ? { ...item, time: newTime } : item
      ),
    }));
  };

  // Recurring task handlers
  const handleAddRecurringTask = (task: Omit<RecurringTask, "id" | "createdAt">) => {
    const newTask: RecurringTask = {
      ...task,
      id: `${Date.now()}-${Math.random()}`,
      createdAt: new Date().toISOString(),
    };
    setRecurringTasks((prev) => [...prev, newTask]);
    toast({
      title: "Recurring task added",
      description: `"${task.activity}" will appear ${task.frequency === "daily" ? "every day" : "on selected days"}.`,
    });
  };

  const handleUpdateRecurringTask = (taskId: string, updates: Partial<RecurringTask>) => {
    setRecurringTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, ...updates } : task))
    );
  };

  const handleDeleteRecurringTask = (taskId: string) => {
    setRecurringTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  // Book handlers
  const handleAddBook = (title: string, month: string) => {
    const newBook: BookItem = {
      id: `${Date.now()}-${Math.random()}`,
      title,
      month,
      completed: false,
      addedAt: new Date().toISOString(),
    };
    setBooks((prev) => [...prev, newBook]);
  };

  const handleUpdateBook = (bookId: string, completed: boolean) => {
    setBooks((prev) =>
      prev.map((book) => (book.id === bookId ? { ...book, completed } : book))
    );
  };

  // Drag and drop
  const handleTodoDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index?: number) => {
    e.preventDefault();
    if (typeof index === "number") {
      setDragOverIndex(index);
    }
  };

  const handleTodoDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (draggedItem) {
      setTodoItemsByDate((prev) => {
        const currentItems = [...(prev[dateKey] || [])];
        const draggedIndex = currentItems.findIndex((item) => item.id === draggedItem);
        if (draggedIndex > -1) {
          const [removed] = currentItems.splice(draggedIndex, 1);
          currentItems.splice(targetIndex, 0, removed);
        }
        return { ...prev, [dateKey]: currentItems };
      });
      setDraggedItem(null);
    }
  };

  const completedCount = todoItems.filter((item) => item.completed).length;
  const totalCount = todoItems.length;

  return (
    <main className="min-h-screen pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Today's To-Do</h1>
            <p className="text-muted-foreground">Manage your tasks and track your progress</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {notificationsEnabled ? (
                <Bell className="h-4 w-4 text-primary" />
              ) : (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              )}
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={() => {
                  if (!notificationsEnabled) {
                    requestNotificationPermission();
                  }
                }}
              />
              <Label className="text-sm">Reminders</Label>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-lg mb-6">
            <TabsTrigger value="todo" className="gap-2">
              <Clock className="h-4 w-4" />
              To-Do
            </TabsTrigger>
            <TabsTrigger value="recurring" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Recurring
            </TabsTrigger>
            <TabsTrigger value="archive" className="gap-2">
              <Archive className="h-4 w-4" />
              Archive
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Summary
            </TabsTrigger>
          </TabsList>

          <TabsContent value="todo">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="h-5 w-5 text-secondary" />
                    {isToday ? "Today's" : format(selectedDate, "MMM d")} To-Do
                    {totalCount > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {completedCount}/{totalCount}
                      </Badge>
                    )}
                  </CardTitle>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {format(selectedDate, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Add custom activity..."
                    value={newActivity}
                    onChange={(e) => setNewActivity(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCustomActivity()}
                    className="h-9"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddCustomActivity}
                    disabled={!newActivity.trim()}
                    className="gap-1 shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {todoItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-lg">
                      <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-2">No tasks yet</p>
                      <p className="text-sm text-muted-foreground">
                        Add tasks above or set up recurring tasks
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {todoItems.map((item, idx) => {
                        const category = item.category?.toLowerCase() || "routine";
                        const Icon = categoryIcons[category] || Clock;

                        return (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleTodoDragStart(e, item.id)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDrop={(e) => handleTodoDrop(e, idx)}
                            className={`flex items-center gap-3 p-3 rounded-lg border bg-background transition-all ${
                              dragOverIndex === idx ? "border-primary" : "border-border"
                            } ${item.completed ? "opacity-60" : ""}`}
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                            <Checkbox
                              checked={item.completed}
                              onCheckedChange={() => handleToggleComplete(item.id)}
                            />
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p
                                className={`font-medium ${
                                  item.completed ? "line-through text-muted-foreground" : ""
                                }`}
                              >
                                {item.activity}
                              </p>
                            </div>
                            <TimePickerPopover
                              value={item.time}
                              onChange={(time) => handleTimeChange(item.id, time)}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveItem(item.id)}
                            >
                              ×
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recurring">
            <RecurringTasks
              tasks={recurringTasks}
              onAddTask={handleAddRecurringTask}
              onUpdateTask={handleUpdateRecurringTask}
              onDeleteTask={handleDeleteRecurringTask}
            />
          </TabsContent>

          <TabsContent value="archive">
            <TodoArchive
              archives={archives}
              books={books}
              onSelectDate={setSelectedDate}
              onUpdateBook={handleUpdateBook}
              onAddBook={handleAddBook}
            />
          </TabsContent>

          <TabsContent value="summary">
            <WeeklySummary
              archives={archives}
              currentTodos={todoItemsByDate}
              books={books}
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
