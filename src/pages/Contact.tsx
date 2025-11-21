import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, MapPin, Phone, Send, Facebook, Twitter, Instagram, Linkedin, Youtube } from "lucide-react";
const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const {
    toast
  } = useToast();
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Message Sent!",
      description: "We'll get back to you within 24 hours."
    });
    setFormData({
      name: "",
      email: "",
      subject: "",
      message: ""
    });
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };
  const handleNewsletterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const emailInput = form.elements.namedItem('newsletter-email') as HTMLInputElement;
    toast({
      title: "Subscribed!",
      description: "Welcome to the DYP community. Check your email for confirmation."
    });
    emailInput.value = "";
  };
  return <div className="min-h-screen pt-20 pb-12 font-poppins">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Get In <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Touch</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Have questions? Want to learn more? We'd love to hear from you and help you on your journey to discovering your purpose.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto mb-16">
          {/* Contact Info Cards */}
          <div className="space-y-6">
            <Card className="bg-card border-border hover:shadow-xl transition-shadow animate-fade-in">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center flex-shrink-0">
                    <Mail className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Email Us</h3>
                    <p className="text-muted-foreground">​discoverpurpose1@gmail.com</p>
                    <p className="text-muted-foreground">
                  </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border hover:shadow-xl transition-shadow animate-fade-in" style={{
            animationDelay: '0.1s'
          }}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-secondary to-accent rounded-full flex items-center justify-center flex-shrink-0">
                    <Phone className="h-6 w-6 text-secondary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Call Us</h3>
                    <p className="text-muted-foreground">+234 907 622 8335                               






   </p>
                    <p className="text-sm text-muted-foreground mt-1">Mon-Fri, 9AM-6PM EST</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border hover:shadow-xl transition-shadow animate-fade-in" style={{
            animationDelay: '0.2s'
          }}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-accent to-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-6 w-6 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Visit Us</h3>
                    <p className="text-muted-foreground">Akure, Nigeria </p>
                    <p className="text-muted-foreground">​</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Contact Form */}
          <Card className="lg:col-span-2 bg-card border-border animate-fade-in" style={{
          animationDelay: '0.1s'
        }}>
            <CardHeader>
              <CardTitle className="text-2xl">Send Us a Message</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="Your name" required className="bg-background border-border" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="your.email@example.com" required className="bg-background border-border" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" name="subject" value={formData.subject} onChange={handleChange} placeholder="What's this about?" required className="bg-background border-border" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" name="message" value={formData.message} onChange={handleChange} placeholder="Tell us what's on your mind..." required className="min-h-[150px] bg-background border-border" />
                </div>

                <Button type="submit" className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold text-lg py-6">
                  <Send className="mr-2 h-5 w-5" />
                  Send Message
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Newsletter Section */}
        <Card className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 border-0 max-w-4xl mx-auto mb-12">
          <CardContent className="p-8 md:p-12">
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Join Our <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Community</span>
              </h2>
              <p className="text-muted-foreground text-lg">
                Subscribe to our newsletter for goal-setting tips, success stories, and exclusive updates.
              </p>
            </div>
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto">
              <Input type="email" name="newsletter-email" placeholder="Enter your email" required className="flex-1 bg-background border-border text-lg py-6" />
              <Button type="submit" className="bg-gradient-to-r from-secondary to-accent hover:opacity-90 font-semibold text-lg px-8 py-6">
                Subscribe
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Social Links */}
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-6">Connect With Us</h3>
          <div className="flex justify-center gap-6">
            <a href="#" className="w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center hover:opacity-80 transition-opacity">
              <Facebook className="h-6 w-6 text-primary-foreground" />
            </a>
            <a href="#" className="w-14 h-14 bg-gradient-to-br from-secondary to-accent rounded-full flex items-center justify-center hover:opacity-80 transition-opacity">
              <Twitter className="h-6 w-6 text-secondary-foreground" />
            </a>
            <a href="#" className="w-14 h-14 bg-gradient-to-br from-accent to-primary rounded-full flex items-center justify-center hover:opacity-80 transition-opacity">
              <Instagram className="h-6 w-6 text-accent-foreground" />
            </a>
            <a href="#" className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center hover:opacity-80 transition-opacity">
              <Linkedin className="h-6 w-6 text-primary-foreground" />
            </a>
            <a href="#" className="w-14 h-14 bg-gradient-to-br from-secondary to-primary rounded-full flex items-center justify-center hover:opacity-80 transition-opacity">
              <Youtube className="h-6 w-6 text-secondary-foreground" />
            </a>
          </div>
        </div>
      </div>
    </div>;
};
export default Contact;