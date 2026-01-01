import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, Target, Calendar, Clock, Download, Trash2, Eye, Plus, 
  Bell, BellOff, ArrowRight, Sparkles, MoreVertical
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TimePlanPDFDocument } from "@/components/timeplanner/TimePlanPDFDocument";
import { pdf } from "@react-pdf/renderer";
import { Tables } from "@/integrations/supabase/types";

type TimePlan = Tables<'time_plans'>;

const TimePlansDashboard = () => {
  const [plans, setPlans] = useState<TimePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchPlans();
    loadReminderSettings();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('time_plans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPlans(data || []);
    } catch (error: any) {
      console.error('Error fetching plans:', error);
      toast({
        title: "Error",
        description: "Failed to load time plans.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadReminderSettings = () => {
    const saved = localStorage.getItem('timePlanReminders');
    if (saved) {
      setRemindersEnabled(JSON.parse(saved));
    }
  };

  const handleDelete = async (planId: string) => {
    setDeletingId(planId);
    try {
      const { error } = await supabase
        .from('time_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;

      setPlans(prev => prev.filter(p => p.id !== planId));
      
      // Remove from reminders
      const newReminders = { ...remindersEnabled };
      delete newReminders[planId];
      setRemindersEnabled(newReminders);
      localStorage.setItem('timePlanReminders', JSON.stringify(newReminders));

      toast({
        title: "Plan Deleted",
        description: "Time plan has been removed.",
      });
    } catch (error: any) {
      console.error('Error deleting plan:', error);
      toast({
        title: "Error",
        description: "Failed to delete time plan.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportPDF = async (plan: TimePlan) => {
    setExportingId(plan.id);
    try {
      const timePlan = {
        yearlyPlan: plan.yearly_plan,
        monthlyPlan: plan.monthly_plan,
        weeklyPlan: plan.weekly_plan,
        dailyPlan: plan.daily_plan,
        summary: null,
      };
      
      const doc = <TimePlanPDFDocument plan={timePlan} goal={plan.goal} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DYP-Time-Plan-${format(new Date(plan.created_at), 'yyyy-MM-dd')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "PDF Downloaded!",
        description: "Your time plan has been exported.",
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export PDF.",
        variant: "destructive",
      });
    } finally {
      setExportingId(null);
    }
  };

  const toggleReminder = (planId: string) => {
    const newState = !remindersEnabled[planId];
    const newReminders = { ...remindersEnabled, [planId]: newState };
    setRemindersEnabled(newReminders);
    localStorage.setItem('timePlanReminders', JSON.stringify(newReminders));

    if (newState) {
      // Request notification permission and schedule reminders
      requestNotificationPermission(planId);
    } else {
      toast({
        title: "Reminders Disabled",
        description: "You won't receive notifications for this plan.",
      });
    }
  };

  const requestNotificationPermission = async (planId: string) => {
    if (!("Notification" in window)) {
      toast({
        title: "Not Supported",
        description: "Your browser doesn't support notifications.",
        variant: "destructive",
      });
      return;
    }

    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      toast({
        title: "Reminders Enabled",
        description: "You'll receive daily notifications for this plan.",
      });
      
      // Schedule a test notification
      scheduleReminderNotification(planId);
    } else {
      toast({
        title: "Permission Denied",
        description: "Please enable notifications in your browser settings.",
        variant: "destructive",
      });
      
      // Revert the toggle
      const newReminders = { ...remindersEnabled, [planId]: false };
      setRemindersEnabled(newReminders);
      localStorage.setItem('timePlanReminders', JSON.stringify(newReminders));
    }
  };

  const scheduleReminderNotification = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    // Show immediate confirmation notification
    new Notification("DYP Goals - Reminder Set!", {
      body: `Daily reminders enabled for: ${plan.goal.substring(0, 50)}...`,
      icon: "/favicon.ico",
    });
  };

  const viewPlan = (plan: TimePlan) => {
    // Navigate to time planner with the plan loaded
    navigate('/time-planner', { state: { viewPlan: plan } });
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 pb-12 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading your time plans...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 animate-fade-in">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                My Time Plans
              </span>
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage and track all your generated time plans
            </p>
          </div>
          <Button
            onClick={() => navigate('/time-planner')}
            className="gap-2 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create New Plan
          </Button>
        </div>

        {/* Plans Grid */}
        {plans.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="pt-12 pb-12 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                <Target className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Time Plans Yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create your first AI-powered time plan to start organizing your goals into actionable schedules.
              </p>
              <Button
                onClick={() => navigate('/time-planner')}
                className="gap-2 bg-gradient-to-r from-primary to-secondary"
              >
                <Sparkles className="h-4 w-4" />
                Create Your First Plan
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card 
                key={plan.id} 
                className="bg-card border-border hover:border-primary/50 transition-all duration-200 group"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
                        {plan.goal}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          <Calendar className="h-3 w-3 mr-1" />
                          {format(new Date(plan.created_at), 'MMM d, yyyy')}
                        </Badge>
                        <Badge 
                          variant={plan.status === 'completed' ? 'default' : 'secondary'}
                          className="text-xs capitalize"
                        >
                          {plan.status}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border">
                        <DropdownMenuItem onClick={() => viewPlan(plan)} className="gap-2 cursor-pointer">
                          <Eye className="h-4 w-4" />
                          View Plan
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleExportPDF(plan)}
                          disabled={exportingId === plan.id}
                          className="gap-2 cursor-pointer"
                        >
                          {exportingId === plan.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Export PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => toggleReminder(plan.id)}
                          className="gap-2 cursor-pointer"
                        >
                          {remindersEnabled[plan.id] ? (
                            <>
                              <BellOff className="h-4 w-4" />
                              Disable Reminders
                            </>
                          ) : (
                            <>
                              <Bell className="h-4 w-4" />
                              Enable Reminders
                            </>
                          )}
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem 
                              onSelect={(e) => e.preventDefault()}
                              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card border-border">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Time Plan?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete your time plan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(plan.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deletingId === plan.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Delete"
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>
                        {(plan.questionnaire_data as any)?.hoursPerWeek || 0}h/week
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {remindersEnabled[plan.id] ? (
                        <>
                          <Bell className="h-4 w-4 text-primary" />
                          <span className="text-primary">Active</span>
                        </>
                      ) : (
                        <>
                          <BellOff className="h-4 w-4" />
                          <span>No reminders</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <Button
                    variant="outline"
                    className="w-full gap-2 hover:bg-primary/10 hover:text-primary hover:border-primary"
                    onClick={() => viewPlan(plan)}
                  >
                    <Eye className="h-4 w-4" />
                    View Full Plan
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimePlansDashboard;
