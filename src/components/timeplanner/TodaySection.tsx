import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { TimePickerPopover } from "./TimePickerPopover";
import { TodoArchive } from "./TodoArchive";
import { cn } from "@/lib/utils";
import { generateIcs, downloadIcs, parseIcs } from "@/lib/icsUtils";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Plus,
  GripVertical,
  Clock,
  Sun,
  Briefcase,
  Book,
  Dumbbell,
  Utensils,
  Coffee,
  Users,
  Tv,
  Bed,
  CalendarIcon,
  Archive,
  Download,
  Upload,
  Tag,
  X,
} from "lucide-react";

interface TimeBlock {
  startTime: string;
  endTime: string;
  activity: string;
  category: string;
  notes?: string;
}

interface DailyPlan {
  weekdayTemplate: {
    wakeTime: string;
    sleepTime: string;
    timeBlocks: TimeBlock[];
  };
  weekendTemplate: {
    wakeTime: string;
    sleepTime: string;
    timeBlocks: TimeBlock[];
  };
}

interface TodoItem {
  id: string;
  activity: string;
  time: string;
  completed: boolean;
  category?: string;
  tags?: string[];
}

interface ArchivedDay {
  date: string;
  items: TodoItem[];
}

const TAG_COLORS: { name: string; classes: string }[] = [
  { name: "red", classes: "bg-red-500/20 border-red-500/40 text-red-400" },
  { name: "orange", classes: "bg-orange-500/20 border-orange-500/40 text-orange-400" },
  { name: "amber", classes: "bg-amber-500/20 border-amber-500/40 text-amber-400" },
  { name: "green", classes: "bg-green-500/20 border-green-500/40 text-green-400" },
  { name: "teal", classes: "bg-teal-500/20 border-teal-500/40 text-teal-400" },
  { name: "blue", classes: "bg-blue-500/20 border-blue-500/40 text-blue-400" },
  { name: "indigo", classes: "bg-indigo-500/20 border-indigo-500/40 text-indigo-400" },
  { name: "purple", classes: "bg-purple-500/20 border-purple-500/40 text-purple-400" },
  { name: "pink", classes: "bg-pink-500/20 border-pink-500/40 text-pink-400" },
];

function getTagColor(tag: string): string {
  // Stable color based on tag name hash
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length].classes;
}

interface BookItem {
  id: string;
  title: string;
  month: string;
  completed: boolean;
  addedAt: string;
}

interface TodaySectionProps {
  dailyPlan: DailyPlan | null;
  planId: string | null;
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

const categoryColors: Record<string, string> = {
  work: 'bg-blue-500/20 border-blue-500/40 text-blue-400',
  study: 'bg-green-500/20 border-green-500/40 text-green-400',
  exercise: 'bg-orange-500/20 border-orange-500/40 text-orange-400',
  meal: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400',
  break: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400',
  social: 'bg-pink-500/20 border-pink-500/40 text-pink-400',
  leisure: 'bg-purple-500/20 border-purple-500/40 text-purple-400',
  sleep: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400',
  routine: 'bg-gray-500/20 border-gray-500/40 text-gray-400',
};

export function TodaySection({ dailyPlan, planId }: TodaySectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [todoItemsByDate, setTodoItemsByDate] = useState<Record<string, TodoItem[]>>({});
  const [archives, setArchives] = useState<ArchivedDay[]>([]);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("todo");

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const isToday = format(new Date(), "yyyy-MM-dd") === dateKey;

  // Get today's activities based on whether it's a weekday or weekend
  const isWeekend = [0, 6].includes(selectedDate.getDay());
  const todayTemplate = dailyPlan
    ? isWeekend
      ? dailyPlan.weekendTemplate
      : dailyPlan.weekdayTemplate
    : null;

  // Current date's todo items
  const todoItems = todoItemsByDate[dateKey] || [];

  // Load saved data from localStorage
  useEffect(() => {
    if (planId) {
      // Load todos by date
      const savedTodos = localStorage.getItem(`todo-by-date-${planId}`);
      if (savedTodos) {
        try {
          setTodoItemsByDate(JSON.parse(savedTodos));
        } catch {
          setTodoItemsByDate({});
        }
      }

      // Load archives
      const savedArchives = localStorage.getItem(`todo-archives-${planId}`);
      if (savedArchives) {
        try {
          setArchives(JSON.parse(savedArchives));
        } catch {
          setArchives([]);
        }
      }

      // Load books
      const savedBooks = localStorage.getItem(`reading-list-${planId}`);
      if (savedBooks) {
        try {
          setBooks(JSON.parse(savedBooks));
        } catch {
          setBooks([]);
        }
      }
    }
  }, [planId]);

  // Save todos to localStorage
  useEffect(() => {
    if (planId && Object.keys(todoItemsByDate).length > 0) {
      localStorage.setItem(`todo-by-date-${planId}`, JSON.stringify(todoItemsByDate));
    }
  }, [todoItemsByDate, planId]);

  // Save archives to localStorage
  useEffect(() => {
    if (planId) {
      localStorage.setItem(`todo-archives-${planId}`, JSON.stringify(archives));
    }
  }, [archives, planId]);

  // Save books to localStorage
  useEffect(() => {
    if (planId) {
      localStorage.setItem(`reading-list-${planId}`, JSON.stringify(books));
    }
  }, [books, planId]);

  // Auto-archive past incomplete todos
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

  const filteredActivities = todayTemplate?.timeBlocks.filter((block) =>
    block.activity.toLowerCase().includes(searchQuery.toLowerCase()) ||
    block.category.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleDragStart = (e: React.DragEvent, activity: TimeBlock) => {
    e.dataTransfer.setData("activity", JSON.stringify(activity));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragOver = (e: React.DragEvent, index?: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (typeof index === 'number') {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex?: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    
    const activityData = e.dataTransfer.getData("activity");
    if (activityData) {
      const activity: TimeBlock = JSON.parse(activityData);
      const newItem: TodoItem = {
        id: `${Date.now()}-${Math.random()}`,
        activity: activity.activity,
        time: activity.startTime,
        completed: false,
        category: activity.category,
      };
      
      setTodoItemsByDate((prev) => {
        const currentItems = prev[dateKey] || [];
        const newItems = [...currentItems];
        if (typeof dropIndex === 'number') {
          newItems.splice(dropIndex, 0, newItem);
        } else {
          newItems.push(newItem);
        }
        return { ...prev, [dateKey]: newItems };
      });
    }
  };

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

  // Drag reordering for todo list
  const handleTodoDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id);
    e.dataTransfer.effectAllowed = "move";
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

  // Progress stats
  const completedCount = todoItems.filter((item) => item.completed).length;
  const totalCount = todoItems.length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Top navigation tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="todo" className="gap-2">
            <Clock className="h-4 w-4" />
            To-Do List
          </TabsTrigger>
          <TabsTrigger value="archive" className="gap-2">
            <Archive className="h-4 w-4" />
            Archives & Books
          </TabsTrigger>
        </TabsList>

        <TabsContent value="todo" className="mt-4">
          <div className="flex gap-4 h-full">
            {/* Activities List - 25% width */}
            <Card className="w-1/4 min-w-[280px] bg-card border-border flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sun className="h-5 w-5 text-primary" />
                  {isWeekend ? "Weekend" : "Weekday"} Activities
                </CardTitle>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search activities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full px-4 pb-4">
                  <div className="space-y-2">
                    {filteredActivities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No activities found
                      </p>
                    ) : (
                      filteredActivities.map((block, idx) => {
                        const category = block.category?.toLowerCase() || 'routine';
                        const Icon = categoryIcons[category] || Clock;
                        const colorClass = categoryColors[category] || categoryColors.routine;
                        
                        return (
                          <div
                            key={idx}
                            draggable
                            onDragStart={(e) => handleDragStart(e, block)}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all hover:border-primary/50 ${colorClass}`}
                          >
                            <GripVertical className="h-4 w-4 opacity-50" />
                            <Icon className="h-4 w-4 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{block.activity}</p>
                              <p className="text-xs opacity-70">{block.startTime} - {block.endTime}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* To-Do Section - 75% width */}
            <Card 
              className="flex-1 bg-card border-border flex flex-col"
              onDragOver={(e) => handleDragOver(e)}
              onDrop={(e) => handleDrop(e)}
            >
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
                  
                  {/* Date Picker */}
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
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full px-4 pb-4">
                  {todoItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-lg mx-4">
                      <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-2">No tasks yet</p>
                      <p className="text-sm text-muted-foreground">
                        Drag activities from the left or add custom tasks
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {todoItems.map((item, idx) => {
                        const category = item.category?.toLowerCase() || 'routine';
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
                              <p className={`font-medium ${item.completed ? "line-through text-muted-foreground" : ""}`}>
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
          </div>
        </TabsContent>

        <TabsContent value="archive" className="mt-4">
          <TodoArchive
            archives={archives}
            books={books}
            onSelectDate={setSelectedDate}
            onUpdateBook={handleUpdateBook}
            onAddBook={handleAddBook}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
