import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Target, CheckCircle2 } from "lucide-react";
import aiCoachImage from "@/assets/ai-coach.jpg";
import { supabase } from "@/integrations/supabase/client";

const AIGoalsReview = () => {
  const [goals, setGoals] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
    setAnalysis("");

    try {
      const { data, error } = await supabase.functions.invoke('analyze-goals', {
        body: { goals }
      });

      if (error) {
        throw error;
      }

      if (data?.analysis) {
        setAnalysis(data.analysis);
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
                  <div className="prose prose-invert max-w-none">
                    <div className="bg-muted/30 rounded-lg p-6 whitespace-pre-wrap text-foreground">
                      {analysis}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

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
              description: "Receive rewritten goals with clear action steps you can start implementing today.",
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