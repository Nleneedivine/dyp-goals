import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Bed
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
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Get today's activities based on whether it's a weekday or weekend
  const isWeekend = [0, 6].includes(new Date().getDay());
  const todayTemplate = dailyPlan
    ? isWeekend
      ? dailyPlan.weekendTemplate
      : dailyPlan.weekdayTemplate
    : null;

  // Load saved todo items from localStorage
  useEffect(() => {
    if (planId) {
      const saved = localStorage.getItem(`today-tasks-${planId}`);
      if (saved) {
        try {
          setTodoItems(JSON.parse(saved));
        } catch {
          setTodoItems([]);
        }
      }
    }
  }, [planId]);

  // Save todo items to localStorage
  useEffect(() => {
    if (planId && todoItems.length > 0) {
      localStorage.setItem(`today-tasks-${planId}`, JSON.stringify(todoItems));
    }
  }, [todoItems, planId]);

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
        time: `${activity.startTime} - ${activity.endTime}`,
        completed: false,
        category: activity.category,
      };
      
      setTodoItems((prev) => {
        const newItems = [...prev];
        if (typeof dropIndex === 'number') {
          newItems.splice(dropIndex, 0, newItem);
        } else {
          newItems.push(newItem);
        }
        return newItems;
      });
    }
  };

  const handleAddCustomActivity = () => {
    if (!newActivity.trim()) return;
    
    const newItem: TodoItem = {
      id: `${Date.now()}-${Math.random()}`,
      activity: newActivity.trim(),
      time: "Custom",
      completed: false,
    };
    
    setTodoItems((prev) => [...prev, newItem]);
    setNewActivity("");
  };

  const handleToggleComplete = (id: string) => {
    setTodoItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const handleRemoveItem = (id: string) => {
    setTodoItems((prev) => prev.filter((item) => item.id !== id));
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
      setTodoItems((prev) => {
        const newItems = [...prev];
        const draggedIndex = newItems.findIndex((item) => item.id === draggedItem);
        if (draggedIndex > -1) {
          const [removed] = newItems.splice(draggedIndex, 1);
          newItems.splice(targetIndex, 0, removed);
        }
        return newItems;
      });
      setDraggedItem(null);
    }
  };

  return (
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
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-secondary" />
            Today's To-Do
          </CardTitle>
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
                      <Badge variant="outline" className="shrink-0">
                        {item.time}
                      </Badge>
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
  );
}
