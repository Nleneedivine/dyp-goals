import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  Book,
  Target,
  Award,
  Calendar,
} from "lucide-react";

interface TodoItem {
  id: string;
  activity: string;
  time: string;
  completed: boolean;
  category?: string;
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

interface WeeklySummaryProps {
  archives: ArchivedDay[];
  currentTodos: Record<string, TodoItem[]>;
  books: BookItem[];
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--muted))"];

export function WeeklySummary({ archives, currentTodos, books }: WeeklySummaryProps) {
  const weeklyData = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

    // Combine archives and current todos
    const allData: Record<string, TodoItem[]> = { ...currentTodos };
    archives.forEach((archive) => {
      allData[archive.date] = archive.items;
    });

    return daysInWeek.map((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const items = allData[dateKey] || [];
      const completed = items.filter((i) => i.completed).length;
      const total = items.length;

      return {
        day: format(day, "EEE"),
        date: dateKey,
        completed,
        remaining: total - completed,
        total,
        rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    });
  }, [archives, currentTodos]);

  const previousWeekData = useMemo(() => {
    const now = new Date();
    const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const prevWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const daysInWeek = eachDayOfInterval({ start: prevWeekStart, end: prevWeekEnd });

    const allData: Record<string, TodoItem[]> = {};
    archives.forEach((archive) => {
      allData[archive.date] = archive.items;
    });

    let totalCompleted = 0;
    let totalTasks = 0;

    daysInWeek.forEach((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const items = allData[dateKey] || [];
      totalCompleted += items.filter((i) => i.completed).length;
      totalTasks += items.length;
    });

    return {
      completed: totalCompleted,
      total: totalTasks,
      rate: totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0,
    };
  }, [archives]);

  // Current week stats
  const thisWeekCompleted = weeklyData.reduce((sum, d) => sum + d.completed, 0);
  const thisWeekTotal = weeklyData.reduce((sum, d) => sum + d.total, 0);
  const thisWeekRate = thisWeekTotal > 0 ? Math.round((thisWeekCompleted / thisWeekTotal) * 100) : 0;

  // Trend calculation
  const trend = thisWeekRate - previousWeekData.rate;
  const isPositiveTrend = trend >= 0;

  // Top tasks (most frequent)
  const taskFrequency = useMemo(() => {
    const frequency: Record<string, number> = {};
    
    archives.forEach((archive) => {
      archive.items.forEach((item) => {
        const key = item.activity.toLowerCase();
        frequency[key] = (frequency[key] || 0) + 1;
      });
    });

    Object.values(currentTodos).forEach((items) => {
      items.forEach((item) => {
        const key = item.activity.toLowerCase();
        frequency[key] = (frequency[key] || 0) + 1;
      });
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [archives, currentTodos]);

  // Reading progress
  const currentMonth = format(new Date(), "yyyy-MM");
  const booksThisMonth = books.filter((b) => b.month === currentMonth);
  const completedBooksThisMonth = booksThisMonth.filter((b) => b.completed).length;

  // Pie chart data
  const pieData = [
    { name: "Completed", value: thisWeekCompleted },
    { name: "Remaining", value: thisWeekTotal - thisWeekCompleted },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-3xl font-bold">{thisWeekRate}%</p>
              </div>
              <div
                className={`flex items-center gap-1 text-sm ${
                  isPositiveTrend ? "text-green-500" : "text-red-500"
                }`}
              >
                {isPositiveTrend ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {Math.abs(trend)}%
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              vs. last week ({previousWeekData.rate}%)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Tasks Completed</p>
                <p className="text-2xl font-bold">
                  {thisWeekCompleted}/{thisWeekTotal}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-secondary" />
              <div>
                <p className="text-sm text-muted-foreground">Active Days</p>
                <p className="text-2xl font-bold">
                  {weeklyData.filter((d) => d.total > 0).length}/7
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Book className="h-8 w-8 text-accent" />
              <div>
                <p className="text-sm text-muted-foreground">Books This Month</p>
                <p className="text-2xl font-bold">
                  {completedBooksThisMonth}/{booksThisMonth.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daily Progress Chart */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Daily Progress This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="completed" fill="hsl(var(--primary))" name="Completed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="remaining" fill="hsl(var(--muted))" name="Remaining" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Weekly Overview Pie */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-secondary" />
              Weekly Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-sm">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted" />
                <span className="text-sm">Remaining</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Tasks and Reading Progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Frequent Tasks */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Top Frequent Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-3">
                {taskFrequency.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No task data yet
                  </p>
                ) : (
                  taskFrequency.map(([task, count], idx) => (
                    <div key={task} className="flex items-center gap-3">
                      <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center">
                        {idx + 1}
                      </Badge>
                      <div className="flex-1">
                        <p className="text-sm font-medium capitalize truncate">{task}</p>
                        <Progress value={(count / taskFrequency[0][1]) * 100} className="h-1.5 mt-1" />
                      </div>
                      <span className="text-sm text-muted-foreground">{count}x</span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Monthly Reading Progress */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Book className="h-4 w-4 text-accent" />
              Reading Progress - {format(new Date(), "MMMM yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {booksThisMonth.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No books added for this month
                  </p>
                ) : (
                  booksThisMonth.map((book) => (
                    <div
                      key={book.id}
                      className={`flex items-center gap-3 p-2 rounded-lg border ${
                        book.completed
                          ? "bg-primary/10 border-primary/30"
                          : "bg-background border-border"
                      }`}
                    >
                      <Book className={`h-4 w-4 ${book.completed ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`flex-1 text-sm ${book.completed ? "line-through text-muted-foreground" : ""}`}>
                        {book.title}
                      </span>
                      {book.completed && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
