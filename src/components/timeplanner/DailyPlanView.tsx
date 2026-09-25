import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun, Moon, Clock, Briefcase, Book, Coffee, Dumbbell, Users, Utensils, Tv, Bed } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TimeBlock {
  startTime: string;
  endTime: string;
  activity: string;
  category: string;
  notes?: string;
  isGoalWork?: boolean;
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

interface DailyPlanViewProps {
  plan: DailyPlan;
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
  default: 'bg-muted border-border text-muted-foreground',
};

function TimeBlockCard({ block }: { block: TimeBlock }) {
  const category = block.category?.toLowerCase() || 'default';
  const Icon = categoryIcons[category] || Clock;
  const colorClass = categoryColors[category] || categoryColors.default;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${colorClass}`}>
      <div className="flex flex-col items-center min-w-[60px]">
        <span className="text-xs font-mono font-medium">{block.startTime}</span>
        <div className="w-px h-4 bg-current opacity-30" />
        <span className="text-xs font-mono font-medium">{block.endTime}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4" />
          <span className="font-medium text-sm">{block.activity}</span>
        </div>
        {block.notes && (
          <p className="text-xs opacity-75">{block.notes}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {block.isGoalWork && <Badge className="text-[10px]">Goal work</Badge>}
        <Badge variant="outline" className="text-xs capitalize">
          {block.category}
        </Badge>
      </div>
    </div>
  );
}

function DaySchedule({ template, type }: { template: DailyPlan['weekdayTemplate']; type: 'weekday' | 'weekend' }) {
  return (
    <div className="space-y-4">
      {/* Wake/Sleep Summary */}
      <div className="flex items-center justify-center gap-8 p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-primary" />
          <span className="text-sm text-muted-foreground">Wake:</span>
          <span className="font-bold text-lg">{template.wakeTime}</span>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex items-center gap-2">
          <Moon className="h-5 w-5 text-secondary" />
          <span className="text-sm text-muted-foreground">Sleep:</span>
          <span className="font-bold text-lg">{template.sleepTime}</span>
        </div>
      </div>

      {/* Time Blocks */}
      <div className="space-y-2">
        {template.timeBlocks.map((block, idx) => (
          <TimeBlockCard key={idx} block={block} />
        ))}
      </div>
    </div>
  );
}

export function DailyPlanView({ plan }: DailyPlanViewProps) {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="weekday" className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
          <TabsTrigger value="weekday" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Weekday Schedule
          </TabsTrigger>
          <TabsTrigger value="weekend" className="gap-2">
            <Sun className="h-4 w-4" />
            Weekend Schedule
          </TabsTrigger>
        </TabsList>

        <TabsContent value="weekday" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Weekday Template (Mon-Fri)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Your hour-by-hour schedule for regular weekdays
              </p>
            </CardHeader>
            <CardContent>
              <DaySchedule template={plan.weekdayTemplate} type="weekday" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekend" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-secondary" />
                Weekend Template (Sat-Sun)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Your hour-by-hour schedule for weekends
              </p>
            </CardHeader>
            <CardContent>
              <DaySchedule template={plan.weekendTemplate} type="weekend" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Legend */}
      <Card className="bg-muted/30 border-border">
        <CardContent className="pt-6">
          <h4 className="text-sm font-semibold mb-3">Activity Categories</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryColors).filter(([key]) => key !== 'default').map(([category, colorClass]) => {
              const Icon = categoryIcons[category] || Clock;
              return (
                <Badge
                  key={category}
                  variant="outline"
                  className={`${colorClass} capitalize gap-1`}
                >
                  <Icon className="h-3 w-3" />
                  {category}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
