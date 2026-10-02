import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Calendar, Target, Trash2, Eye, Download } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GoalsPDFDocument } from "@/components/GoalsPDFDocument";
import { pdf } from "@react-pdf/renderer";
import { Ui2PageHeader } from "@/components/Ui2PageHeader";
import { useUiMode } from "@/components/UiModeProvider";

interface GoalAnalysisRecord {
  id: string;
  enrollment_id: string | null;
  created_at: string;
  updated_at: string;
  original_goals: string;
  ai_analysis: any;
  refined_goals: string | null;
  user_responses: any;
}

interface HistoryCohort {
  id: string;
  name: string;
  cohort_year: number;
  is_current: boolean;
}

interface HistoryEnrollment {
  id: string;
  cohort_id: string;
}

interface RefinedGoal {
  title: string;
  description: string;
  actionSteps: string[];
  timeline: string;
  successMetrics: string[];
}

const GoalHistory = () => {
  const [loading, setLoading] = useState(true);
  const [analyses, setAnalyses] = useState<GoalAnalysisRecord[]>([]);
  const [filteredAnalyses, setFilteredAnalyses] = useState<GoalAnalysisRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cohorts, setCohorts] = useState<HistoryCohort[]>([]);
  const [enrollments, setEnrollments] = useState<HistoryEnrollment[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState("all");
  const [selectedAnalysis, setSelectedAnalysis] = useState<GoalAnalysisRecord | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { isUi2 } = useUiMode();

  useEffect(() => {
    loadAnalyses();
  }, []);

  useEffect(() => {
    filterAnalyses();
  }, [searchQuery, analyses, selectedCohortId, enrollments]);

  const loadAnalyses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const [analysisResult, cohortResult, enrollmentResult] = await Promise.all([
        supabase
          .from("goal_analyses")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("program_cohorts")
          .select("id,name,cohort_year,is_current")
          .eq("program_key", "goals")
          .order("cohort_year", { ascending: false }),
        supabase
          .from("program_enrollments")
          .select("id,cohort_id")
          .eq("user_id", user.id),
      ]);

      if (analysisResult.error) throw analysisResult.error;
      if (cohortResult.error) throw cohortResult.error;
      if (enrollmentResult.error) throw enrollmentResult.error;

      setAnalyses(analysisResult.data || []);
      setCohorts(cohortResult.data || []);
      setEnrollments(enrollmentResult.data || []);
    } catch (error: any) {
      toast({
        title: "Error loading history",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const enrollmentToCohort = useMemo(
    () => new Map(enrollments.map((enrollment) => [enrollment.id, enrollment.cohort_id] as const)),
    [enrollments],
  );

  const cohortById = useMemo(
    () => new Map(cohorts.map((cohort) => [cohort.id, cohort] as const)),
    [cohorts],
  );

  const filterAnalyses = () => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = analyses.filter((analysis) => {
      if (selectedCohortId !== "all") {
        if (!analysis.enrollment_id) return false;
        if (enrollmentToCohort.get(analysis.enrollment_id) !== selectedCohortId) {
          return false;
        }
      }

      if (!query) return true;

      const originalGoals = analysis.original_goals.toLowerCase();
      const refinedGoals = analysis.refined_goals?.toLowerCase() || "";
      return originalGoals.includes(query) || refinedGoals.includes(query);
    });

    setFilteredAnalyses(filtered);
  };

  const cohortForAnalysis = (analysis: GoalAnalysisRecord) => {
    if (!analysis.enrollment_id) return null;
    const cohortId = enrollmentToCohort.get(analysis.enrollment_id);
    return cohortId ? cohortById.get(cohortId) ?? null : null;
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("goal_analyses")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setAnalyses(analyses.filter((a) => a.id !== id));
      toast({
        title: "Deleted",
        description: "Goal analysis has been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getRefinedGoals = (analysis: GoalAnalysisRecord): RefinedGoal[] | null => {
    if (!analysis.refined_goals) return null;
    try {
      return JSON.parse(analysis.refined_goals);
    } catch {
      return null;
    }
  };

  const getOverallScore = (analysis: GoalAnalysisRecord): number => {
    try {
      return analysis.ai_analysis?.overallScore || 0;
    } catch {
      return 0;
    }
  };

  const handleDownloadPDF = async (analysis: GoalAnalysisRecord) => {
    const refinedGoals = getRefinedGoals(analysis);
    if (!refinedGoals) {
      toast({
        title: "No refined goals",
        description: "This analysis doesn't have refined goals to export.",
        variant: "destructive",
      });
      return;
    }

    setExportingId(analysis.id);
    try {
      const targetYear = new Date(analysis.created_at).getFullYear() + 1;
      const doc = <GoalsPDFDocument goals={refinedGoals} targetYear={targetYear} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DYP-Goals-${format(new Date(analysis.created_at), "yyyy-MM-dd")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "PDF Downloaded!",
        description: "Your goals have been exported as a PDF.",
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExportingId(null);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${isUi2 ? "pt-28 pb-16" : "pt-20 pb-12"} flex items-center justify-center`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isUi2 ? "pt-28 pb-16" : "pt-20 pb-12"} font-poppins`}>
      <div className="container mx-auto px-4 max-w-7xl">
        {isUi2 ? (
          <Ui2PageHeader eyebrow="Goals archive" title="Goal History" description="Review previous goal analyses, refined plans and exported records." icon={Target} />
        ) : (
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Your <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Goal History</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Review all your past goal analyses and refined action plans
          </p>
        </div>
        )}

        {/* Search and cohort filter */}
        <Card className="bg-card border-border mb-8 animate-fade-in">
          <CardContent className="grid gap-3 pt-6 md:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search your goals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background"
              />
            </div>
            <Select value={selectedCohortId} onValueChange={setSelectedCohortId}>
              <SelectTrigger>
                <SelectValue placeholder="All GOALS years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All GOALS years</SelectItem>
                {cohorts.map((cohort) => (
                  <SelectItem key={cohort.id} value={cohort.id}>
                    {cohort.name}{cohort.is_current ? " · Current" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Results */}
        {filteredAnalyses.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? "No goals found matching your search." : "No goal analyses yet. Start by submitting your goals to the AI Coach!"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {filteredAnalyses.map((analysis, index) => (
              <Card key={analysis.id} className="bg-card border-border hover:border-primary/50 transition-colors animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
                <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">
                        {analysis.original_goals.slice(0, 100)}
                        {analysis.original_goals.length > 100 && "..."}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(analysis.created_at), "MMM d, yyyy")}
                        </div>
                        <Badge variant="outline" className="bg-background">
                          {cohortForAnalysis(analysis)?.name ?? "Pre-cohort history"}
                        </Badge>
                        <Badge variant="outline" className="bg-background">
                          Score: {getOverallScore(analysis)}%
                        </Badge>
                        {analysis.refined_goals && (
                          <Badge className="bg-accent text-accent-foreground">
                            Refined
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedAnalysis(analysis)}
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {analysis.refined_goals && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPDF(analysis)}
                          disabled={exportingId === analysis.id}
                          title="Download PDF"
                        >
                          {exportingId === analysis.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground">
                              This action cannot be undone. This will permanently delete your goal analysis and refined goals.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(analysis.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                {analysis.refined_goals && (
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm text-primary">Refined Goals:</h4>
                      {getRefinedGoals(analysis)?.map((goal, i) => (
                        <div key={i} className="text-sm text-muted-foreground">
                          • {goal.title}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!selectedAnalysis} onOpenChange={() => setSelectedAnalysis(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-2xl">Goal Analysis Details</DialogTitle>
            </DialogHeader>
            {selectedAnalysis && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-primary mb-2">Original Goals</h3>
                  <p className="text-foreground whitespace-pre-wrap">{selectedAnalysis.original_goals}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-secondary mb-2">AI Analysis</h3>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Overall Score: <span className="text-primary font-bold">{getOverallScore(selectedAnalysis)}%</span>
                    </p>
                    <p className="text-foreground">{selectedAnalysis.ai_analysis?.generalAdvice}</p>
                  </div>
                </div>

                {selectedAnalysis.refined_goals && (
                  <div>
                    <h3 className="font-semibold text-accent mb-3">Refined Goals</h3>
                    <div className="space-y-4">
                      {getRefinedGoals(selectedAnalysis)?.map((goal, i) => (
                        <div key={i} className="bg-accent/10 rounded-lg p-4 border border-accent/30">
                          <h4 className="font-semibold text-lg mb-2">{goal.title}</h4>
                          <p className="text-foreground mb-3">{goal.description}</p>
                          <div className="text-sm text-muted-foreground">
                            <strong>Timeline:</strong> {goal.timeline}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default GoalHistory;
