import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Target, Upload, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface RefinedGoal {
  title: string;
  description: string;
  actionSteps: string[];
  timeline: string;
  successMetrics: string[];
}

interface GoalAnalysisRecord {
  id: string;
  created_at: string;
  original_goals: string;
  refined_goals: string | null;
  ai_analysis: any;
}

interface GoalImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (goal: string) => void;
}

export function GoalImportDialog({ isOpen, onClose, onImport }: GoalImportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [analyses, setAnalyses] = useState<GoalAnalysisRecord[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadReviewedGoals();
    }
  }, [isOpen]);

  const loadReviewedGoals = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("goal_analyses")
        .select("*")
        .eq("user_id", user.id)
        .not("refined_goals", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAnalyses(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading goals",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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

  const handleSelectGoal = (goal: string) => {
    setSelectedGoal(goal);
  };

  const handleImport = () => {
    if (selectedGoal) {
      onImport(selectedGoal);
      onClose();
      toast({
        title: "Goal Imported",
        description: "Your goal has been imported to the time planner.",
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      
      // Try to parse as JSON first (for exported goals)
      try {
        const parsed = JSON.parse(text);
        if (parsed.goals && Array.isArray(parsed.goals)) {
          const goalText = parsed.goals.map((g: RefinedGoal) => g.title).join(", ");
          setSelectedGoal(goalText);
        } else if (parsed.title) {
          setSelectedGoal(parsed.title);
        } else {
          setSelectedGoal(text.slice(0, 500));
        }
      } catch {
        // Plain text file
        setSelectedGoal(text.slice(0, 500));
      }

      toast({
        title: "File Loaded",
        description: "Goal content has been extracted from the file.",
      });
    } catch (error) {
      toast({
        title: "Error reading file",
        description: "Unable to read the uploaded file.",
        variant: "destructive",
      });
    }

    // Reset file input
    e.target.value = '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Target className="h-5 w-5 text-primary" />
            Import Goal
          </DialogTitle>
          <DialogDescription>
            Import a goal from your AI-reviewed goals or upload a goals document
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="reviewed" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="reviewed" className="gap-2">
              <Target className="h-4 w-4" />
              Reviewed Goals
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload File
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reviewed" className="flex-1 overflow-y-auto mt-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : analyses.length === 0 ? (
              <div className="text-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No reviewed goals found. Complete an AI Goals Review first!
                </p>
              </div>
            ) : (
              analyses.map((analysis) => {
                const refinedGoals = getRefinedGoals(analysis);
                return (
                  <div key={analysis.id} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(analysis.created_at), "MMM d, yyyy")}
                    </div>
                    {refinedGoals?.map((goal, idx) => (
                      <Card
                        key={idx}
                        className={`cursor-pointer transition-all ${
                          selectedGoal === goal.title
                            ? "border-primary bg-primary/5"
                            : "hover:border-primary/50"
                        }`}
                        onClick={() => handleSelectGoal(goal.title)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h4 className="font-medium">{goal.title}</h4>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {goal.description}
                              </p>
                            </div>
                            {selectedGoal === goal.title && (
                              <Badge className="bg-primary shrink-0">Selected</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-4 space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Upload a text file (.txt, .json) containing your goals
              </p>
              <Input
                type="file"
                accept=".txt,.json,.md"
                onChange={handleFileUpload}
                className="max-w-xs mx-auto"
              />
            </div>

            {selectedGoal && (
              <Card className="border-primary bg-primary/5">
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">Selected Goal:</h4>
                  <p className="text-sm text-muted-foreground">{selectedGoal}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!selectedGoal}
            className="gap-2 bg-gradient-to-r from-primary to-secondary"
          >
            <Target className="h-4 w-4" />
            Import Goal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
