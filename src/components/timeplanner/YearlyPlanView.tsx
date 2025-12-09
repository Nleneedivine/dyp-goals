import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Target, Flag, CheckCircle2 } from "lucide-react";

interface YearlyPlan {
  mainGoal: string;
  quarters: {
    quarter: number;
    focus: string;
    milestones: string[];
    keyDeadlines: string[];
  }[];
  annualTargets: string[];
}

interface YearlyPlanViewProps {
  plan: YearlyPlan;
}

const quarterColors = [
  'from-primary to-primary/60',
  'from-secondary to-secondary/60',
  'from-accent to-accent/60',
  'from-primary to-secondary'
];

export function YearlyPlanView({ plan }: YearlyPlanViewProps) {
  return (
    <div className="space-y-6">
      {/* Main Goal Card */}
      <Card className="bg-gradient-to-r from-primary/20 to-secondary/20 border-primary/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-primary/20">
              <Target className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Annual Goal</h3>
              <p className="text-xl font-bold text-foreground">{plan.mainGoal}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quarterly Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plan.quarters.map((quarter) => (
          <Card key={quarter.quarter} className="bg-card border-border overflow-hidden">
            <div className={`h-2 bg-gradient-to-r ${quarterColors[quarter.quarter - 1] || quarterColors[0]}`} />
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Q{quarter.quarter}
                </span>
                <Badge variant="outline" className="text-xs">
                  {quarter.quarter === 1 ? 'Jan-Mar' : quarter.quarter === 2 ? 'Apr-Jun' : quarter.quarter === 3 ? 'Jul-Sep' : 'Oct-Dec'}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">{quarter.focus}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Milestones */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Flag className="h-3 w-3" />
                  MILESTONES
                </h4>
                <ul className="space-y-1.5">
                  {quarter.milestones.map((milestone, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>{milestone}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Key Deadlines */}
              {quarter.keyDeadlines.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">KEY DEADLINES</h4>
                  <div className="flex flex-wrap gap-2">
                    {quarter.keyDeadlines.map((deadline, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {deadline}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Annual Targets */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-secondary" />
            Annual Targets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plan.annualTargets.map((target, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                  {idx + 1}
                </div>
                <span className="text-sm">{target}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
