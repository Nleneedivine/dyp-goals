import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Target, CheckCircle2, MessageCircle, Lightbulb, Download, Printer } from "lucide-react";
import aiCoachImage from "@/assets/ai-coach.jpg";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pdf } from "@react-pdf/renderer";
import { GoalsPDFDocument } from "@/components/GoalsPDFDocument";
import { PrintableGoals } from "@/components/PrintableGoals";

interface GoalAnalysis {
  originalGoal: string;
  score: number;
  feedback: string;
  questions: string[];
  improvedVersion: string;
}

interface AnalysisResult {
  overallScore: number;
  goals: GoalAnalysis[];
  generalAdvice: string;
}

interface RefinedGoal {
  title: string;
  description: string;
  actionSteps: string[];
  timeline: string;
  successMetrics: string[];
}

const AIGoalsReview = () => {
  const [goals, setGoals] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [refinedGoals, setRefinedGoals] = useState<RefinedGoal[] | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!goals.trim()) {
      toast({
        title: "Please enter your goals",
        description: "Write down at least one goal to get AI analysis.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);
    setRefinedGoals(null);
    setResponses({});

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("You must be logged in to analyze goals");
      }

      const { data, error } = await supabase.functions.invoke('analyze-goals', {
        body: { goals }
      });

      if (error) throw error;

      if (data?.analysis) {
        setAnalysis(data.analysis);
        
        // Store analysis for learning
        const { data: savedAnalysis } = await supabase
          .from('goal_analyses')
          .insert({
            user_id: user.id,
            original_goals: goals,
            ai_analysis: data.analysis
          })
          .select()
          .single();
        
        if (savedAnalysis) {
          setAnalysisId(savedAnalysis.id);
        }

        toast({
          title: "Analysis Complete!",
          description: "Your DYP AI Coach has reviewed your goals.",
        });
      }
    } catch (error: any) {
      console.error('Error analyzing goals:', error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Unable to analyze goals. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRefine = async () => {
    if (!analysis) return;

    // Check if all questions are answered
    const totalQuestions = analysis.goals.reduce((sum, goal) => sum + goal.questions.length, 0);
    const answeredQuestions = Object.keys(responses).length;

    if (answeredQuestions < totalQuestions) {
      toast({
        title: "Please answer all questions",
        description: "Answer all clarifying questions to get comprehensive refined goals.",
        variant: "destructive",
      });
      return;
    }

    setIsRefining(true);

    try {
      const allQuestions = analysis.goals.flatMap(g => g.questions);
      const allResponses = Object.values(responses);

      const { data, error } = await supabase.functions.invoke('refine-goals', {
        body: {
          originalGoals: goals,
          questions: allQuestions,
          responses: allResponses
        }
      });

      if (error) throw error;

      if (data?.refined?.refinedGoals) {
        setRefinedGoals(data.refined.refinedGoals);
        
        // Update stored analysis with responses and refined goals
        if (analysisId) {
          await supabase
            .from('goal_analyses')
            .update({
              user_responses: responses,
              refined_goals: JSON.stringify(data.refined.refinedGoals)
            })
            .eq('id', analysisId);
        }

        toast({
          title: "Goals Refined!",
          description: "Your comprehensive action plan is ready.",
        });
      }
    } catch (error: any) {
      console.error('Error refining goals:', error);
      toast({
        title: "Refinement Failed",
        description: error.message || "Unable to refine goals. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefining(false);
    }
  };

  const handleExportPDF = async () => {
    if (!refinedGoals) return;

    setIsExporting(true);
    try {
      const doc = <GoalsPDFDocument goals={refinedGoals} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DYP-Goals-2025-${new Date().toLocaleDateString()}.pdf`;
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
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Meet Your <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">AI Coach</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Submit your 2025 goals and get instant AI-powered analysis, scoring, and personalized recommendations to make them SMART and achievable.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
          {/* Input Section */}
          <Card className="bg-card border-border animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Target className="h-6 w-6 text-primary" />
                Your 2025 Goals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="Write your goals here... For example:&#10;&#10;1. Get fit and healthy&#10;2. Learn a new skill&#10;3. Build better relationships&#10;4. Advance my career&#10;&#10;Be as specific or general as you'd like - the AI Coach will help refine them!"
                className="min-h-[300px] text-base bg-background border-border"
              />
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold text-lg py-6"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Analyzing Your Goals...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Get AI Analysis
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* AI Coach Display */}
          <div className="space-y-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <Card className="bg-card border-border overflow-hidden">
              <div
                className="h-48 bg-cover bg-center relative"
                style={{ backgroundImage: `url(${aiCoachImage})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent"></div>
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Sparkles className="h-6 w-6 text-secondary animate-glow" />
                  DYP AI Coach
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!analysis && !isAnalyzing && (
                  <div className="text-muted-foreground space-y-4">
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <span>Analyzes your goals for SMART criteria</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5 flex-shrink-0" />
                      <span>Provides accuracy scoring (0-100%)</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                      <span>Asks clarifying questions</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <span>Rewrites goals to be more actionable</span>
                    </p>
                  </div>
                )}

                {isAnalyzing && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground">Your AI Coach is analyzing...</p>
                  </div>
                )}

                {analysis && !isAnalyzing && (
                  <div className="space-y-4">
                    {/* Overall Score */}
                    <div className="bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg p-4 border border-primary/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Overall SMART Score</span>
                        <span className="text-2xl font-bold text-primary">{analysis.overallScore}%</span>
                      </div>
                    </div>

                    {/* General Advice */}
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-sm text-foreground">{analysis.generalAdvice}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Goal Analysis Section */}
        {analysis && !isAnalyzing && (
          <div className="mt-8 max-w-7xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-center mb-8">
              Goal-by-Goal <span className="text-primary">Analysis</span>
            </h2>
            
            {analysis.goals.map((goal, index) => (
              <Card key={index} className="bg-card border-border overflow-hidden animate-fade-in" style={{ animationDelay: `${0.1 * (index + 1)}s` }}>
                <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-xl flex-1">
                      Goal {index + 1}: {goal.originalGoal}
                    </CardTitle>
                    <div className="flex items-center gap-2 bg-background px-3 py-1 rounded-full">
                      <span className="text-sm font-medium">Score:</span>
                      <span className="text-lg font-bold text-primary">{goal.score}%</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {/* Feedback */}
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground mb-2 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      Feedback
                    </h4>
                    <p className="text-foreground">{goal.feedback}</p>
                  </div>

                  {/* Improved Version */}
                  <div className="bg-accent/10 rounded-lg p-4 border border-accent/30">
                    <h4 className="font-semibold text-sm text-accent mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      SMART Version
                    </h4>
                    <p className="text-foreground font-medium">{goal.improvedVersion}</p>
                  </div>

                  {/* Questions */}
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground mb-3 flex items-center gap-2">
                      <MessageCircle className="h-4 w-4" />
                      Clarifying Questions
                    </h4>
                    <div className="space-y-4">
                      {goal.questions.map((question, qIndex) => {
                        const questionId = index * 10 + qIndex;
                        return (
                          <div key={qIndex} className="space-y-2">
                            <Label htmlFor={`q-${questionId}`} className="text-foreground">
                              • {question}
                            </Label>
                            <Input
                              id={`q-${questionId}`}
                              placeholder="Your answer..."
                              value={responses[questionId] || ""}
                              onChange={(e) => setResponses(prev => ({ ...prev, [questionId]: e.target.value }))}
                              className="bg-background"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Refine Button */}
            <div className="flex justify-center pt-4">
              <Button
                onClick={handleRefine}
                disabled={isRefining}
                size="lg"
                className="bg-gradient-to-r from-accent to-primary hover:opacity-90 font-semibold text-lg px-12 py-6"
              >
                {isRefining ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating Your Action Plan...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Generate Comprehensive Goals
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Refined Goals Section */}
        {refinedGoals && !isRefining && (
          <div className="mt-12 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-4xl font-bold">
                Your <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Comprehensive Action Plan</span>
              </h2>
              <div className="flex gap-3 print:hidden">
                <Button
                  onClick={handlePrint}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 flex items-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Export PDF
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-6 print:hidden">
              {refinedGoals.map((goal, index) => (
                <Card key={index} className="bg-card border-border overflow-hidden animate-fade-in" style={{ animationDelay: `${0.1 * (index + 1)}s` }}>
                  <CardHeader className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20">
                    <CardTitle className="text-2xl">{goal.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    <div>
                      <h4 className="font-semibold text-primary mb-2">Description</h4>
                      <p className="text-foreground">{goal.description}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-secondary mb-2">Action Steps</h4>
                      <ul className="space-y-2">
                        {goal.actionSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <span className="text-foreground">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-muted/30 rounded-lg p-4">
                        <h4 className="font-semibold text-accent mb-2">Timeline</h4>
                        <p className="text-foreground">{goal.timeline}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4">
                        <h4 className="font-semibold text-accent mb-2">Success Metrics</h4>
                        <ul className="space-y-1">
                          {goal.successMetrics.map((metric, i) => (
                            <li key={i} className="text-foreground text-sm">• {metric}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Printable Version */}
            <PrintableGoals goals={refinedGoals} />
          </div>
        )}

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-5xl mx-auto">
          {[
            {
              title: "SMART Framework",
              description: "Goals are analyzed for being Specific, Measurable, Achievable, Relevant, and Time-bound.",
              color: "from-primary to-secondary",
            },
            {
              title: "Personalized Feedback",
              description: "Get tailored suggestions and questions to refine each goal for maximum impact.",
              color: "from-secondary to-accent",
            },
            {
              title: "Action Plans",
              description: "Receive comprehensive action plans with clear steps you can start implementing today.",
              color: "from-accent to-primary",
            },
          ].map((item, index) => (
            <Card
              key={index}
              className="bg-card border-border hover:shadow-xl transition-shadow animate-fade-in"
              style={{ animationDelay: `${0.2 + index * 0.1}s` }}
            >
              <CardContent className="p-6">
                <div className={`h-1 w-12 bg-gradient-to-r ${item.color} rounded-full mb-4`}></div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AIGoalsReview;