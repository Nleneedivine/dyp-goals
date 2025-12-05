import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, Heart, TrendingUp, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Mentorship = () => {
  const [formData, setFormData] = useState({
    goals: "",
    areas: "",
    experience: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasExistingRequest, setHasExistingRequest] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{ name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

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

      // Check for existing request (using any to bypass type check until types are regenerated)
      const { data: request } = await (supabase as any)
        .from('mentorship_requests')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (request) {
        setHasExistingRequest(true);
      }

      // Check if already in a group
      const { data: profile } = await supabase
        .from('profiles')
        .select('group_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.group_id) {
        const { data: group } = await supabase
          .from('accountability_groups')
          .select('name')
          .eq('id', profile.group_id)
          .maybeSingle();

        if (group) {
          setGroupInfo(group);
        }
      }
    } catch (error) {
      console.error('Error checking status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      // Save mentorship request (using any to bypass type check until types are regenerated)
      const { error: requestError } = await (supabase as any)
        .from('mentorship_requests')
        .insert({
          user_id: user.id,
          goals: formData.goals,
          areas: formData.areas,
          experience: formData.experience,
        });

      if (requestError) throw requestError;

      // Assign user to accountability group
      const { data: groupId, error: groupError } = await supabase
        .rpc('assign_user_to_group', { _user_id: user.id });

      if (groupError) throw groupError;

      // Fetch group info
      if (groupId) {
        const { data: group } = await supabase
          .from('accountability_groups')
          .select('name')
          .eq('id', groupId)
          .maybeSingle();

        if (group) {
          setGroupInfo(group);
        }
      }

      setHasExistingRequest(true);
      toast({
        title: "Request Submitted!",
        description: "You've been assigned to an accountability group. A mentor will be matched with you soon.",
      });

      setFormData({
        goals: "",
        areas: "",
        experience: "",
      });
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
      <div className="min-h-screen pt-20 pb-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Mentorship & <span className="bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">Accountability</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Connect with experienced mentors and join accountability groups to stay on track with your goals.
          </p>
        </div>

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
                    <h3 className="text-xl font-semibold mb-2">1-on-1 Mentorship</h3>
                    <p className="text-muted-foreground">
                      Get paired with an experienced mentor who has achieved goals similar to yours. Receive personalized guidance and support.
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
                    <h3 className="text-xl font-semibold mb-2">Accountability Groups</h3>
                    <p className="text-muted-foreground">
                      Join small groups of 3-5 peers working on similar goals. Share progress, challenges, and celebrate wins together.
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
                    <h3 className="text-xl font-semibold mb-2">AI-Recommended Matches</h3>
                    <p className="text-muted-foreground">
                      Our AI Coach analyzes your goals and recommends the best mentor and accountability group fit for your journey.
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
                        <h4 className="font-semibold mb-2">Your Accountability Group</h4>
                        <p className="text-2xl font-bold text-primary">{groupInfo.name}</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          You'll be connected with your group members and mentor soon.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <div className="bg-muted/30 rounded-lg p-4">
                    <h4 className="font-semibold mb-2">What's Next?</h4>
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        A mentor will be assigned to your group
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        You'll receive an introduction email
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        Weekly check-ins will be scheduled
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

                  <Button
                    type="submit"
                    disabled={isSubmitting}
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
                  title: "Submit Your Request",
                  description: "Fill out the form with your goals and areas of interest.",
                },
                {
                  step: "2",
                  title: "Get Matched",
                  description: "Our AI and team match you with the perfect mentor and group.",
                },
                {
                  step: "3",
                  title: "Start Growing",
                  description: "Begin your journey with regular check-ins and support.",
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