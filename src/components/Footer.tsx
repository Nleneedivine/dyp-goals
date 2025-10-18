import { Link } from "react-router-dom";
import { Sparkles, Facebook, Twitter, Instagram, Linkedin, Youtube } from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-card border-t border-border mt-20">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                DYP GOALS 2025
              </span>
            </Link>
            <p className="text-muted-foreground mb-4 max-w-md">
              Discover Your Purpose - Transforming vision into action through AI-powered goal setting and mentorship.
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-secondary transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-accent transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-secondary transition-colors">
                <Youtube className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-4 text-foreground">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/schedule" className="text-muted-foreground hover:text-primary transition-colors">
                  Schedule
                </Link>
              </li>
              <li>
                <Link to="/ai-goals" className="text-muted-foreground hover:text-primary transition-colors">
                  AI Coach
                </Link>
              </li>
              <li>
                <Link to="/mentorship" className="text-muted-foreground hover:text-primary transition-colors">
                  Mentorship
                </Link>
              </li>
              <li>
                <Link to="/testimonials" className="text-muted-foreground hover:text-primary transition-colors">
                  Testimonials
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-4 text-foreground">Event Info</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>Dec 6-8, 2025</li>
              <li>Virtual Masterclass</li>
              <li>Youth & Young Adults</li>
              <li>
                <Link to="/contact" className="hover:text-primary transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 text-center text-muted-foreground">
          <p>© {currentYear} Discover Your Purpose. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;