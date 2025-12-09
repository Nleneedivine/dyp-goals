import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Target, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WeeklyPlan {
  totalHoursPerWeek: number;
  weekdayHours: number;
  weekendHours: number;
  sampleWeeks: {
    weekNumber: number;
    theme: string;
    tasks: {
      day: string;
      activities: string[];
      hours: number;
    }[];
    weeklyGoal: string;
  }[];
}

interface WeeklyPlanViewProps {
  plan: WeeklyPlan;
}

const dayColors: Record<string, string> = {
  Monday: 'border-l-blue-500',
  Tuesday: 'border-l-green-500',
  Wednesday: 'border-l-yellow-500',
  Thursday: 'border-l-orange-500',
  Friday: 'border-l-red-500',
  Saturday: 'border-l-purple-500',
  Sunday: 'border-l-pink-500',
};

export function WeeklyPlanView({ plan }: WeeklyPlanViewProps) {
  return (
    <div className="space-y-6">
      {/* Weekly Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Total Weekly Hours</p>
              <p className="text-4xl font-bold text-primary">{plan.totalHoursPerWeek}h</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-secondary/20 to-secondary/5 border-secondary/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Weekday Hours</p>
              <p className="text-4xl font-bold text-secondary">{plan.weekdayHours}h</p>
              <p className="text-xs text-muted-foreground">Mon-Fri combined</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-accent/20 to-accent/5 border-accent/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Weekend Hours</p>
              <p className="text-4xl font-bold text-accent">{plan.weekendHours}h</p>
              <p className="text-xs text-muted-foreground">Sat-Sun combined</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sample Weeks */}
      <Tabs defaultValue="week-1" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          {plan.sampleWeeks.slice(0, 4).map((week) => (
            <TabsTrigger key={week.weekNumber} value={`week-${week.weekNumber}`}>
              Week {week.weekNumber}
            </TabsTrigger>
          ))}
        </TabsList>

        {plan.sampleWeeks.slice(0, 4).map((week) => (
          <TabsContent key={week.weekNumber} value={`week-${week.weekNumber}`} className="mt-6">
            {/* Week Header */}
            <Card className="bg-card border-border mb-4">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <Badge className="mb-2 bg-primary/20 text-primary border-primary/30">
                      Week {week.weekNumber}
                    </Badge>
                    <h3 className="text-xl font-bold text-foreground">{week.theme}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="h-4 w-4 text-secondary" />
                    <span className="font-medium">{week.weeklyGoal}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Daily Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {week.tasks.map((task, idx) => (
                <Card
                  key={idx}
                  className={`bg-card border-border border-l-4 ${dayColors[task.day] || 'border-l-muted'}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{task.day}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {task.hours}h
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {task.activities.map((activity, aIdx) => (
                        <li key={aIdx} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-accent mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{activity}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
