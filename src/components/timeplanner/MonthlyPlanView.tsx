import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Target, CheckCircle2 } from "lucide-react";

interface MonthlyPlan {
  months: {
    month: string;
    focus: string;
    goals: string[];
    weeklyHours: number;
    keyTasks: string[];
  }[];
}

interface MonthlyPlanViewProps {
  plan: MonthlyPlan;
}

const monthColors: Record<string, string> = {
  January: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  February: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  March: 'bg-green-500/20 text-green-400 border-green-500/30',
  April: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  May: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  June: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  July: 'bg-red-500/20 text-red-400 border-red-500/30',
  August: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  September: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  October: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  November: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  December: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

export function MonthlyPlanView({ plan }: MonthlyPlanViewProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plan.months.map((month, idx) => (
          <Card key={idx} className="bg-card border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-primary" />
                  {month.month}
                </CardTitle>
                <Badge className={`${monthColors[month.month] || 'bg-muted'} border`}>
                  <Clock className="h-3 w-3 mr-1" />
                  {month.weeklyHours}h/week
                </Badge>
              </div>
              <p className="text-sm font-medium text-secondary">{month.focus}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Goals */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  MONTHLY GOALS
                </h4>
                <ul className="space-y-1.5">
                  {month.goals.slice(0, 3).map((goal, gIdx) => (
                    <li key={gIdx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{goal}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Key Tasks */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">KEY TASKS</h4>
                <div className="flex flex-wrap gap-1.5">
                  {month.keyTasks.slice(0, 4).map((task, tIdx) => (
                    <Badge key={tIdx} variant="outline" className="text-xs truncate max-w-[150px]">
                      {task}
                    </Badge>
                  ))}
                  {month.keyTasks.length > 4 && (
                    <Badge variant="outline" className="text-xs">
                      +{month.keyTasks.length - 4} more
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
