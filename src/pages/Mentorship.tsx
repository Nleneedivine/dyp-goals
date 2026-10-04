import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, Heart, TrendingUp, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Ui2PageHeader } from "@/components/Ui2PageHeader";
import { useUiMode } from "@/components/UiModeProvider";
import { formatProgramDate, usePlatformConfiguration } from "@/hooks/use-platform-configuration";
import { getCurrentGoalEnrollment } from "@/lib/cohortScope";

const Mentorship = () => {
  const [formData, setFormData] = useState({
    goals: "",
    areas: "",
    experience: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [hasExistingRequest, setHasExistingRequest] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{ name: string } | null>(null);
  const [currentEnrollmentId, setCurrentEnrollmentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isUi2 } = useUiMode();
  const { configuration } = usePlatformConfiguration();

  useEffect(() => {
    checkExistingStatus();
  }, []);

  const checkExistingStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const currentEnrollment = await getCurrentGoalEnrollment(user.id);
      setCurrentEnrollmentId(currentEnrollment?.id ?? null);

      if (!currentEnrollment) {
        setHasExistingRequest(false);
        setGroupInfo(null);
        return;
      }

      const [{ data: request }, { data: membership }] = await Promise.all([
        supabase
          .from("mentorship_requests")
          .select("id")
          .eq("enrollment_id", currentEnrollment.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("program_accountability_memberships")
          .select("group_id")
          .eq("enrollment_id", currentEnrollment.id)
          .eq("status", "active")
          .maybeSingle(),
      ]);

      setHasExistingRequest(Boolean(request));

      if (membership?.group_id) {
        const { data: group } = await supabase
          .from("accountability_groups")
          .select("name")
          .eq("id", membership.group_id)
          .maybeSingle();

        setGroupInfo(group ?? null);
      } else {
        setGroupInfo(null);
      }
    } catch (error) {
      console.error("Error checking status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!acceptedRules) {
      toast({
        title: "Confirm the mentorship request",
        description: "Please confirm that you understand mentorship is optional support and that you will respect mentor/group privacy.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to request mentorship.",
          variant: "destructive",
        });
        navigate('/auth');
        return;
      }

      const currentEnrollment =
        currentEnrollmentId
          ? { id: currentEnrollmentId }
          : await getCurrentGoalEnrollment(user.id);

      if (!currentEnrollment) {
        throw new Error("An active current GOALS enrollment is required before requesting mentorship.");
      }

      // Save this request against the current cohort enrollment.
      const { error: requestError } = await supabase
        .from("mentorship_requests")
        .insert({
          user_id: user.id,
          enrollment_id: currentEnrollment.id,
          goals: formData.goals,
          areas: formData.areas,
          experience: formData.experience,
          accountability_rules_accepted: true,
          accountability_rules_accepted_at: new Date().toISOString(),
        });

      if (requestError) throw requestError;

      setHasExistingRequest(true);
      toast({
        title: "Mentorship request submitted",
        description: "Your request is now separate from Accountability Lab placement. The DYP team can review it for optional mentor support.",
      });

      setFormData({
        goals: "",
        areas: "",
        experience: "",
      });
      setAcceptedRules(false);
    } catch (error: any) {
      console.error('Error submitting request:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen ${isUi2 ? "pt-28 pb-16" : "pt-20 pb-12"} flex items-center justify-center`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isUi2 ? "pt-28 pb-16" : "pt-20 pb-12"} font-poppins`}>
      <div className="container mx-auto px-4">
        {isUi2 ? (
          <Ui2PageHeader eyebrow="Optional deeper support" title="Mentorship" description={`Accountability Lab is built into your GOALS journey. Use this page only when you want additional mentor support. Accountability Lab begins ${formatProgramDate(configuration.accountability_lab_start_date)}.`} icon={Users} />
        ) : (
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Optional <span className="bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">Mentorship</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Accountability Lab is now part of your GOALS journey. Use this page only when you want additional mentor support beyond your accountability group. The Accountability Lab begins {formatProgramDate(configuration.accountability_lab_start_date)}.
          </p>
        </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto mb-16">
          {/* Benefits Cards */}
          <div className="space-y-6">
            <Card className="bg-card border-border hover:shadow-xl transition-shadow animate-fade-in">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center flex-shrink-0">
                    <Users className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Optional mentor guidance</h3>
                    <p className="text-muted-foreground">
                      Request additional guidance from a mentor when you need perspective beyond normal accountability check-ins.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border hover:shadow-xl transition-shadow animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-secondary to-accent rounded-full flex items-center justify-center flex-shrink-0">
                    <Heart className="h-6 w-6 text-secondary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Your accountability group stays in GOALS</h3>
                    <p className="text-muted-foreground">
                      Group matching now happens directly from your saved GOALS portfolio, availability and commitment — no second accountability application is required.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border hover:shadow-xl transition-shadow animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-accent to-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="h-6 w-6 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Track Progress</h3>
                    <p className="text-muted-foreground">
                      Regular check-ins and progress tracking to keep you motivated and on track toward achieving your goals.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border hover:shadow-xl transition-shadow animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Mentorship is separate</h3>
                    <p className="text-muted-foreground">
                      Submitting this mentorship form does not create or change your accountability-group placement. It is an optional support request.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Request Form or Status */}
          <Card className="bg-card border-border animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <CardHeader>
              <CardTitle className="text-2xl">
                {hasExistingRequest ? "Your Mentorship Status" : "Request Mentorship"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasExistingRequest ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 text-primary">
                    <CheckCircle2 className="h-6 w-6" />
                    <span className="font-semibold">Request Submitted</span>
                  </div>
                  
                  {groupInfo && (
                    <Card className="bg-gradient-to-r from-primary/20 to-secondary/20 border-0">
                      <CardContent className="p-6">
                        <h4 className="font-semibold mb-2">Current Accountability Group</h4>
                        <p className="text-2xl font-bold text-primary">{groupInfo.name}</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Your accountability placement is managed from My GOALS / Journey. This mentorship request is separate.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <div className="bg-muted/30 rounded-lg p-4">
                    <h4 className="font-semibold mb-2">What's Next?</h4>
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        The DYP team will review your mentorship request
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        If matched, you'll receive mentor introduction details
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        Your Accountability Lab group continues independently of this request
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="goals">Your Top 3 Goals</Label>
                    <Textarea
                      id="goals"
                      name="goals"
                      value={formData.goals}
                      onChange={handleChange}
                      placeholder="1. Goal one&#10;2. Goal two&#10;3. Goal three"
                      required
                      className="min-h-[100px] bg-background border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="areas">Areas You Want Mentorship In</Label>
                    <Textarea
                      id="areas"
                      name="areas"
                      value={formData.areas}
                      onChange={handleChange}
                      placeholder="e.g., Career growth, Health & fitness, Relationships, Financial planning"
                      required
                      className="min-h-[80px] bg-background border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="experience">Current Experience Level</Label>
                    <Textarea
                      id="experience"
                      name="experience"
                      value={formData.experience}
                      onChange={handleChange}
                      placeholder="Tell us about your current situation and what you hope to achieve..."
                      required
                      className="min-h-[100px] bg-background border-border"
                    />
                  </div>

                  <div className="rounded-xl border bg-muted/15 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        checked={acceptedRules}
                        disabled={isSubmitting}
                        onCheckedChange={(checked) => setAcceptedRules(checked === true)}
                      />
                      <span className="text-sm leading-6 text-muted-foreground">
                        I understand that mentorship is optional support, separate from Accountability Lab placement. I will respect mentor and participant privacy and use the mentorship relationship responsibly.
                      </span>
                    </label>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting || !acceptedRules}
                    className="w-full bg-gradient-to-r from-secondary to-accent hover:opacity-90 font-semibold text-lg py-6"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Request"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* How It Works */}
        <Card className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 border-0 max-w-5xl mx-auto">
          <CardContent className="p-8">
            <h2 className="text-3xl font-bold text-center mb-8">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  step: "1",
                  title: "Request Extra Support",
                  description: "Tell us where you would value mentor perspective beyond your normal accountability group.",
                },
                {
                  step: "2",
                  title: "DYP Reviews the Request",
                  description: "Your accountability group is already managed inside GOALS; this request is reviewed only for optional mentor support.",
                },
                {
                  step: "3",
                  title: "Connect if Matched",
                  description: "If mentor capacity and fit are available, DYP will connect you without changing your accountability placement.",
                },
              ].map((item, index) => (
                <div key={index} className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-2xl font-bold text-primary-foreground">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Mentorship;