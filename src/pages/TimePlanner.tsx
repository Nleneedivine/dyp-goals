import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Target, Calendar, Clock, Download, Printer, ArrowRight, CheckCircle2, Sparkles, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QuestionnaireStep } from "@/components/timeplanner/QuestionnaireStep";
import { YearlyPlanView } from "@/components/timeplanner/YearlyPlanView";
import { MonthlyPlanView } from "@/components/timeplanner/MonthlyPlanView";
import { WeeklyPlanView } from "@/components/timeplanner/WeeklyPlanView";
import { DailyPlanView } from "@/components/timeplanner/DailyPlanView";
import { TimePlanSummary } from "@/components/timeplanner/TimePlanSummary";
import { TimePlanPDFDocument } from "@/components/timeplanner/TimePlanPDFDocument";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pdf } from "@react-pdf/renderer";
import { Tables } from "@/integrations/supabase/types";

interface QuestionnaireData {
  specificOutcomes: string;
  deadline: string;
  milestones: string;
  hoursPerWeek: number;
  dailyWeeklyActivities: string;
  constraints: string;
  wakeTime: string;
  sleepTime: string;
  weekendPreference: 'light' | 'same' | 'intense';
}

interface TimePlan {
  yearlyPlan: any;
  monthlyPlan: any;
  weeklyPlan: any;
  dailyPlan: any;
  summary: any;
}

type Phase = 'goal-input' | 'questionnaire' | 'generating' | 'result';

type SavedTimePlan = Tables<'time_plans'>;

const TimePlanner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('goal-input');
  const [goal, setGoal] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [questionnaireData, setQuestionnaireData] = useState<QuestionnaireData>({
    specificOutcomes: '',
    deadline: '',
    milestones: '',
    hoursPerWeek: 0,
    dailyWeeklyActivities: '',
    constraints: '',
    wakeTime: '06:00',
    sleepTime: '22:00',
    weekendPreference: 'same',
  });
  const [timePlan, setTimePlan] = useState<TimePlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isViewingExisting, setIsViewingExisting] = useState(false);
  const { toast } = useToast();

  // Handle viewing existing plan from navigation state
  useEffect(() => {
    const state = location.state as { viewPlan?: SavedTimePlan } | null;
    if (state?.viewPlan) {
      const plan = state.viewPlan;
      setGoal(plan.goal);
      setTimePlan({
        yearlyPlan: plan.yearly_plan,
        monthlyPlan: plan.monthly_plan,
        weeklyPlan: plan.weekly_plan,
        dailyPlan: plan.daily_plan,
        summary: null,
      });
      setPhase('result');
      setIsViewingExisting(true);
      
      // Clear the state so refreshing doesn't reload the same plan
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleGoalSubmit = () => {
    if (!goal.trim()) {
      toast({
        title: "Please enter your goal",
        description: "Write down the goal you want to plan for.",
        variant: "destructive",
      });
      return;
    }
    setPhase('questionnaire');
  };

  const handleQuestionnaireDataChange = (data: Partial<QuestionnaireData>) => {
    setQuestionnaireData(prev => ({ ...prev, ...data }));
  };

  const handleNext = () => {
    setCurrentStep(prev => Math.min(prev + 1, 8));
  };

  const handleBack = () => {
    if (currentStep === 1) {
      setPhase('goal-input');
    } else {
      setCurrentStep(prev => Math.max(prev - 1, 1));
    }
  };

  const handleGeneratePlan = async () => {
    setPhase('generating');
    setIsGenerating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("You must be logged in to generate a time plan");
      }

      const { data, error } = await supabase.functions.invoke('generate-time-plan', {
        body: {
          questionnaireData: {
            goal,
            ...questionnaireData,
          }
        }
      });

      if (error) throw error;

      if (data?.timePlan) {
        setTimePlan(data.timePlan);
        
        // Save to database
        await supabase.from('time_plans').insert([{
          user_id: user.id,
          goal,
          questionnaire_data: questionnaireData as any,
          yearly_plan: data.timePlan.yearlyPlan,
          monthly_plan: data.timePlan.monthlyPlan,
          weekly_plan: data.timePlan.weeklyPlan,
          daily_plan: data.timePlan.dailyPlan,
          status: 'completed',
        }]);

        setPhase('result');
        toast({
          title: "Time Plan Generated!",
          description: "Your comprehensive time plan is ready.",
        });
      }
    } catch (error: any) {
      console.error('Error generating time plan:', error);
      setPhase('questionnaire');
      toast({
        title: "Generation Failed",
        description: error.message || "Unable to generate time plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!timePlan) return;

    setIsExporting(true);
    try {
      const doc = <TimePlanPDFDocument plan={timePlan} goal={goal} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DYP-Time-Plan-${new Date().toLocaleDateString()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "PDF Downloaded!",
        description: "Your time plan has been exported as a PDF.",
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

  const handleStartOver = () => {
    setPhase('goal-input');
    setGoal('');
    setCurrentStep(1);
    setQuestionnaireData({
      specificOutcomes: '',
      deadline: '',
      milestones: '',
      hoursPerWeek: 0,
      dailyWeeklyActivities: '',
      constraints: '',
      wakeTime: '06:00',
      sleepTime: '22:00',
      weekendPreference: 'same',
    });
    setTimePlan(null);
    setIsViewingExisting(false);
  };

  const handleBackToDashboard = () => {
    navigate('/time-plans');
  };

  return (
    <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4">
        {/* Hero Section */}
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              AI Time Planner
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transform your goals into actionable daily, weekly, monthly, and yearly schedules with AI-powered planning.
          </p>
        </div>

        {/* Goal Input Phase */}
        {phase === 'goal-input' && (
          <div className="max-w-2xl mx-auto animate-fade-in">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Target className="h-6 w-6 text-primary" />
                  </div>
                  What Goal Do You Want to Achieve?
                </CardTitle>
                <p className="text-muted-foreground">
                  Enter your main goal. Our AI will guide you through a questionnaire to create a comprehensive time plan.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <Textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g., I want to learn web development and land a junior developer job within 6 months..."
                  className="min-h-[150px] bg-background border-border text-base"
                />
                
                <Button
                  onClick={handleGoalSubmit}
                  className="w-full gap-2 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold text-lg py-6"
                >
                  Start Planning
                  <ArrowRight className="h-5 w-5" />
                </Button>

                {/* Features */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-border">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Yearly Milestones</p>
                      <p className="text-xs text-muted-foreground">Quarter-by-quarter planning</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Monthly Targets</p>
                      <p className="text-xs text-muted-foreground">Break down into monthly goals</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-accent mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Weekly Schedule</p>
                      <p className="text-xs text-muted-foreground">Task allocation by day</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Daily Time Blocks</p>
                      <p className="text-xs text-muted-foreground">Hour-by-hour schedule</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Questionnaire Phase */}
        {phase === 'questionnaire' && (
          <QuestionnaireStep
            goal={goal}
            currentStep={currentStep}
            data={questionnaireData}
            onDataChange={handleQuestionnaireDataChange}
            onNext={handleNext}
            onBack={handleBack}
            onSubmit={handleGeneratePlan}
            isSubmitting={isGenerating}
          />
        )}

        {/* Generating Phase */}
        {phase === 'generating' && (
          <div className="max-w-md mx-auto text-center animate-fade-in">
            <Card className="bg-card border-border">
              <CardContent className="pt-12 pb-12">
                <div className="relative mx-auto w-24 h-24 mb-6">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary via-secondary to-accent animate-spin opacity-20" />
                  <div className="absolute inset-2 rounded-full bg-card flex items-center justify-center">
                    <Sparkles className="h-10 w-10 text-primary animate-pulse" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2">Generating Your Time Plan</h2>
                <p className="text-muted-foreground mb-4">
                  Our AI is analyzing your goal and creating a comprehensive schedule...
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  This may take a moment
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Result Phase */}
        {phase === 'result' && timePlan && (
          <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                {isViewingExisting && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleBackToDashboard}
                    className="shrink-0"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                )}
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Your Time Plan</h2>
                  <p className="text-muted-foreground">{goal}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {isViewingExisting && (
                  <Button variant="outline" onClick={handleBackToDashboard} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Dashboard
                  </Button>
                )}
                <Button variant="outline" onClick={handlePrint} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="gap-2 bg-gradient-to-r from-primary to-secondary"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export PDF
                </Button>
                <Button variant="outline" onClick={handleStartOver}>
                  Start New Plan
                </Button>
              </div>
            </div>

            {/* Plan Tabs */}
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
                <TabsTrigger value="summary" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Summary
                </TabsTrigger>
                <TabsTrigger value="yearly" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Yearly
                </TabsTrigger>
                <TabsTrigger value="monthly" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Monthly
                </TabsTrigger>
                <TabsTrigger value="weekly" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Weekly
                </TabsTrigger>
                <TabsTrigger value="daily" className="gap-2">
                  <Clock className="h-4 w-4" />
                  Daily
                </TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="mt-6">
                {timePlan.summary && <TimePlanSummary summary={timePlan.summary} />}
              </TabsContent>

              <TabsContent value="yearly" className="mt-6">
                {timePlan.yearlyPlan && <YearlyPlanView plan={timePlan.yearlyPlan} />}
              </TabsContent>

              <TabsContent value="monthly" className="mt-6">
                {timePlan.monthlyPlan && <MonthlyPlanView plan={timePlan.monthlyPlan} />}
              </TabsContent>

              <TabsContent value="weekly" className="mt-6">
                {timePlan.weeklyPlan && <WeeklyPlanView plan={timePlan.weeklyPlan} />}
              </TabsContent>

              <TabsContent value="daily" className="mt-6">
                {timePlan.dailyPlan && <DailyPlanView plan={timePlan.dailyPlan} />}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimePlanner;
