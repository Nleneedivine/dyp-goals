import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, Heart, TrendingUp, MessageSquare } from "lucide-react";

const Mentorship = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    goals: "",
    areas: "",
    experience: "",
  });
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    toast({
      title: "Request Submitted!",
      description: "We'll match you with a mentor within 48 hours.",
    });
    
    setFormData({
      name: "",
      email: "",
      goals: "",
      areas: "",
      experience: "",
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Mentorship & <span className="bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">Accountability</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Connect with experienced mentors and join accountability groups to stay on track with your goals throughout 2026.
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
                      Regular check-ins and progress tracking to keep you motivated and on track toward achieving your 2026 goals.
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

          {/* Request Form */}
          <Card className="bg-card border-border animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <CardHeader>
              <CardTitle className="text-2xl">Request Mentorship</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your name"
                    required
                    className="bg-background border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your.email@example.com"
                    required
                    className="bg-background border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="goals">Your Top 3 Goals for 2026</Label>
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
                  <Input
                    id="areas"
                    name="areas"
                    value={formData.areas}
                    onChange={handleChange}
                    placeholder="e.g., Career, Fitness, Relationships"
                    required
                    className="bg-background border-border"
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
                  className="w-full bg-gradient-to-r from-secondary to-accent hover:opacity-90 font-semibold text-lg py-6"
                >
                  Submit Request
                </Button>
              </form>
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