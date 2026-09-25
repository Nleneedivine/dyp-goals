import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { 
  TrendingUp, CheckCircle2, Circle, Calendar, Clock, 
  ChevronLeft, ChevronRight, Target
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, differenceInCalendarWeeks } from "date-fns";

interface WeeklyProgressChartProps {
  planId: string;
  weeklyPlan: any;
  dailyPlan: any;
}

interface DayProgress {
  day: string;
  completed: number;
  total: number;
  tasks: { id: string; name: string; completed: boolean }[];
}

export const WeeklyProgressChart = ({ planId, weeklyPlan, dailyPlan }: WeeklyProgressChartProps) => {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [progressData, setProgressData] = useState<DayProgress[]>([]);

  const storageKey = `progress_${planId}`;

  useEffect(() => {
    loadProgressData();
  }, [planId, currentWeekStart, weeklyPlan]);

  const loadProgressData = () => {
    const saved = localStorage.getItem(storageKey);
    const allProgress = saved ? JSON.parse(saved) : {};
    
    const weekDays = eachDayOfInterval({
      start: currentWeekStart,
      end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
    });

    const sampleWeeks = weeklyPlan?.sampleWeeks ?? [];
    const currentBaseWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    const offset = differenceInCalendarWeeks(currentWeekStart, currentBaseWeek, { weekStartsOn: 1 });
    const sampleIndex = sampleWeeks.length ? ((offset % sampleWeeks.length) + sampleWeeks.length) % sampleWeeks.length : 0;
    const sampleWeek = sampleWeeks[sampleIndex];

    const weekData: DayProgress[] = weekDays.map((date) => {
      const dayName = format(date, 'EEEE');
      const dateKey = format(date, 'yyyy-MM-dd');

      // Track only the goal tasks from the weekly plan. The old implementation
      // counted meals, classes, leisure, and routines as goal progress.
      const dayPlan = sampleWeek?.tasks?.find((task: any) => task.day === dayName);
      const activities: string[] = dayPlan?.activities ?? [];
      const tasks = activities.map((activity: string, idx: number) => ({
        id: `${dateKey}-${idx}`,
        name: activity,
        completed: allProgress[dateKey]?.[idx] || false,
      }));

      const completed = tasks.filter((task) => task.completed).length;

      return {
        day: format(date, 'EEE'),
        completed,
        total: tasks.length,
        tasks,
      };
    });

    setProgressData(weekData);
  };

  const toggleTask = (dayIndex: number, taskIndex: number) => {
    const saved = localStorage.getItem(storageKey);
    const allProgress = saved ? JSON.parse(saved) : {};
    
    const weekDays = eachDayOfInterval({
      start: currentWeekStart,
      end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
    });
    
    const dateKey = format(weekDays[dayIndex], 'yyyy-MM-dd');
    
    if (!allProgress[dateKey]) {
      allProgress[dateKey] = {};
    }
    
    allProgress[dateKey][taskIndex] = !allProgress[dateKey][taskIndex];
    
    localStorage.setItem(storageKey, JSON.stringify(allProgress));
    loadProgressData();
  };

  const previousWeek = () => {
    setCurrentWeekStart(prev => subWeeks(prev, 1));
  };

  const nextWeek = () => {
    setCurrentWeekStart(prev => addWeeks(prev, 1));
  };

  const totalCompleted = progressData.reduce((sum, d) => sum + d.completed, 0);
  const totalTasks = progressData.reduce((sum, d) => sum + d.total, 0);
  const completionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  const barChartData = progressData.map(d => ({
    name: d.day,
    completed: d.completed,
    remaining: Math.max(0, d.total - d.completed),
  }));

  const pieData = [
    { name: 'Completed', value: totalCompleted },
    { name: 'Remaining', value: Math.max(0, totalTasks - totalCompleted) },
  ];

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--muted))'];

  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={previousWeek}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <h3 className="font-semibold text-lg">
            {format(currentWeekStart, 'MMM d')} - {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}
          </h3>
          <p className="text-sm text-muted-foreground">Weekly Progress</p>
        </div>
        <Button variant="outline" size="icon" onClick={nextWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-3xl font-bold text-primary">{completionRate}%</p>
              </div>
              <div className="p-3 rounded-full bg-primary/20">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
            </div>
            <Progress value={completionRate} className="mt-3" />
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tasks Completed</p>
                <p className="text-3xl font-bold text-foreground">{totalCompleted}/{totalTasks}</p>
              </div>
              <div className="p-3 rounded-full bg-secondary/20">
                <CheckCircle2 className="h-6 w-6 text-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Days Active</p>
                <p className="text-3xl font-bold text-foreground">
                  {progressData.filter(d => d.completed > 0).length}/7
                </p>
              </div>
              <div className="p-3 rounded-full bg-accent/20">
                <Calendar className="h-6 w-6 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Daily Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="completed" stackId="a" fill="hsl(var(--primary))" name="Completed" />
                  <Bar dataKey="remaining" stackId="a" fill="hsl(var(--muted))" name="Remaining" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Weekly Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Checklist by Day */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Daily Task Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {progressData.map((day, dayIndex) => (
              <div key={day.day} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">{day.day}</h4>
                  <Badge variant={day.completed === day.total && day.total > 0 ? "default" : "outline"}>
                    {day.completed}/{day.total}
                  </Badge>
                </div>
                {day.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks scheduled</p>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {day.tasks.map((task, taskIndex) => (
                      <div key={task.id} className="flex items-start gap-2">
                        <Checkbox
                          id={task.id}
                          checked={task.completed}
                          onCheckedChange={() => toggleTask(dayIndex, taskIndex)}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor={task.id}
                          className={`text-sm cursor-pointer ${
                            task.completed ? 'line-through text-muted-foreground' : ''
                          }`}
                        >
                          {task.name}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
