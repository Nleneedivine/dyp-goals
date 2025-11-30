import { Card, CardContent } from "@/components/ui/card";
import { Star, Quote } from "lucide-react";

const Testimonials = () => {
  const testimonials = [
    {
      name: "Sarah Johnson",
      age: 22,
      achievement: "Career Advancement",
      quote: "DYP GOALS helped me land my dream job! The SMART goal framework and AI coaching made all the difference. I went from confused to confident in just 3 days.",
      rating: 5,
      year: "2024 Participant",
    },
    {
      name: "Marcus Williams",
      age: 19,
      achievement: "Fitness Transformation",
      quote: "I lost 30 pounds and gained so much confidence. The accountability groups kept me motivated, and the AI Coach helped me break down my big goal into daily habits.",
      rating: 5,
      year: "2024 Participant",
    },
    {
      name: "Priya Patel",
      age: 24,
      achievement: "Business Launch",
      quote: "Started my own business after the masterclass! The vision casting session was life-changing. I finally had clarity on what I wanted to achieve and how to get there.",
      rating: 5,
      year: "2024 Participant",
    },
    {
      name: "James Chen",
      age: 21,
      achievement: "Academic Excellence",
      quote: "Graduated with honors thanks to the time management techniques I learned. The AI analysis showed me exactly where I was wasting time and how to fix it.",
      rating: 5,
      year: "2024 Participant",
    },
    {
      name: "Aisha Mohammed",
      age: 20,
      achievement: "Personal Growth",
      quote: "Found my purpose and built meaningful relationships. The mentorship program connected me with amazing people who genuinely cared about my success.",
      rating: 5,
      year: "2024 Participant",
    },
    {
      name: "Tyler Rodriguez",
      age: 23,
      achievement: "Creative Career",
      quote: "Turned my passion into a career as a content creator. The goal-setting framework made it feel achievable instead of just a dream. Now I'm living it!",
      rating: 5,
      year: "2024 Participant",
    },
  ];

  const stats = [
    { number: "2,500+", label: "Participants", color: "from-primary to-secondary" },
    { number: "94%", label: "Goal Achievement Rate", color: "from-secondary to-accent" },
    { number: "4.9/5", label: "Average Rating", color: "from-accent to-primary" },
    { number: "85%", label: "Continue with Mentorship", color: "from-primary to-accent" },
  ];

  return (
    <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Success <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Stories</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Real transformations from real people who turned their dreams into reality with DYP GOALS.
          </p>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16 max-w-6xl mx-auto">
          {stats.map((stat, index) => (
            <Card
              key={index}
              className="bg-card border-border text-center hover:shadow-xl transition-shadow animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardContent className="p-6">
                <div className={`text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                  {stat.number}
                </div>
                <div className="text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="bg-card border-border hover:shadow-xl transition-all hover:-translate-y-2 animate-fade-in"
              style={{ animationDelay: `${0.1 + index * 0.05}s` }}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                  ))}
                </div>
                <Quote className="h-8 w-8 text-primary/30 mb-2" />
                <p className="text-muted-foreground mb-6 italic">"{testimonial.quote}"</p>
                <div className="border-t border-border pt-4">
                  <div className="font-semibold text-lg">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">Age {testimonial.age}</div>
                  <div className="text-sm font-medium text-primary mt-2">{testimonial.achievement}</div>
                  <div className="text-xs text-muted-foreground mt-1">{testimonial.year}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA Section */}
        <Card className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 border-0 max-w-4xl mx-auto mt-16">
          <CardContent className="p-12 text-center">
            <h2 className="text-4xl font-bold mb-4">
              Ready to Write Your <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Success Story</span>?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Join DYP GOALS 2025 and become our next success story. Transform your vision into reality.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/ai-goals">
                <button className="px-8 py-4 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold text-lg rounded-lg">
                  Get Started Today
                </button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Testimonials;