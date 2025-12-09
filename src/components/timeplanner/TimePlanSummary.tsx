import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, CheckCircle2, AlertTriangle, Lightbulb, TrendingUp } from "lucide-react";

interface Summary {
  totalWeeklyCommitment: number;
  estimatedCompletionDate: string;
  keySuccessFactors?: string[];
  potentialChallenges?: string[];
  recommendations?: string[];
}

interface TimePlanSummaryProps {
  summary: Summary;
}

export function TimePlanSummary({ summary }: TimePlanSummaryProps) {
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/20">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Weekly Commitment</p>
                <p className="text-3xl font-bold text-primary">{summary.totalWeeklyCommitment} hours</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-accent/20 to-accent/5 border-accent/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-accent/20">
                <Calendar className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estimated Completion</p>
                <p className="text-xl font-bold text-accent">{summary.estimatedCompletionDate}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Success Factors */}
      {summary.keySuccessFactors && summary.keySuccessFactors.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-accent" />
              Key Success Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summary.keySuccessFactors.map((factor, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-foreground">{factor}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Potential Challenges */}
      {summary.potentialChallenges && summary.potentialChallenges.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Potential Challenges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summary.potentialChallenges.map((challenge, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5 bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                    {idx + 1}
                  </Badge>
                  <span className="text-foreground">{challenge}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {summary.recommendations && summary.recommendations.length > 0 && (
        <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5 text-secondary" />
              AI Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {summary.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-3 p-3 bg-secondary/10 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center text-xs font-bold text-secondary flex-shrink-0">
                    {idx + 1}
                  </div>
                  <span className="text-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
