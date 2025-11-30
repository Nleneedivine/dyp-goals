import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Sparkles, LogOut, User, History, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const { data } = await supabase.rpc('has_role', { 
          _user_id: session.user.id, 
          _role: 'admin' 
        });
        setIsAdmin(data === true);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        
        if (session?.user) {
          const { data } = await supabase.rpc('has_role', { 
            _user_id: session.user.id, 
            _role: 'admin' 
          });
          setIsAdmin(data === true);
        } else {
          setIsAdmin(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged out",
      description: "You've been successfully logged out.",
    });
    navigate("/auth");
  };

  const navItems = [
    { name: "Home", path: "/" },
    { name: "Schedule", path: "/schedule" },
    { name: "AI Coach", path: "/ai-goals" },
    { name: "Mentorship", path: "/mentorship" },
    { name: "Testimonials", path: "/testimonials" },
    { name: "Contact", path: "/contact" },
  ];

  const isActive = (path: string) => location.pathname === path;

  // Don't show navigation items on auth page
  if (location.pathname === "/auth") {
    return (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center h-20">
            <Link to="/" className="flex items-center gap-2 group">
              <Sparkles className="h-8 w-8 text-primary animate-glow" />
              <span className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                DYP GOALS 2026
              </span>
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center gap-2 group">
            <Sparkles className="h-8 w-8 text-primary animate-glow" />
            <span className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              DYP GOALS 2026
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`font-medium transition-colors hover:text-primary ${
                  isActive(item.path) ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.name}
              </Link>
            ))}
            {user && (
              <div className="flex items-center gap-4">
                <Link
                  to="/goal-history"
                  className={`font-medium transition-colors hover:text-primary flex items-center gap-2 ${
                    isActive("/goal-history") ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <History className="h-4 w-4" />
                  Goal History
                </Link>
                {isAdmin && (
                  <>
                    <Link
                      to="/admin"
                      className={`font-medium transition-colors hover:text-primary flex items-center gap-2 ${
                        isActive("/admin") ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <Sparkles className="h-4 w-4" />
                      Admin
                    </Link>
                    <Link
                      to="/groups"
                      className={`font-medium transition-colors hover:text-primary flex items-center gap-2 ${
                        isActive("/groups") ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <Users className="h-4 w-4" />
                      Groups
                    </Link>
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <User className="h-4 w-4" />
                      {user.email}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border">
                    <DropdownMenuItem asChild>
                      <Link to="/profile" className="cursor-pointer flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-foreground"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 animate-fade-in">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`block py-3 font-medium transition-colors hover:text-primary ${
                  isActive(item.path) ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.name}
              </Link>
            ))}
            {user && (
              <div className="mt-4 pt-4 border-t border-border space-y-3">
                <Link
                  to="/goal-history"
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-2 py-2 font-medium transition-colors hover:text-primary ${
                    isActive("/goal-history") ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <History className="h-4 w-4" />
                  Goal History
                </Link>
                {isAdmin && (
                  <>
                    <Link
                      to="/admin"
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-2 py-2 font-medium transition-colors hover:text-primary ${
                        isActive("/admin") ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <Sparkles className="h-4 w-4" />
                      Admin
                    </Link>
                    <Link
                      to="/groups"
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-2 py-2 font-medium transition-colors hover:text-primary ${
                        isActive("/groups") ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <Users className="h-4 w-4" />
                      Groups
                    </Link>
                  </>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <User className="h-4 w-4" />
                  <span>{user.email}</span>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setIsOpen(false)}
                >
                  <Button variant="outline" className="w-full gap-2 mb-2">
                    <User className="h-4 w-4" />
                    Profile
                  </Button>
                </Link>
                <Button
                  onClick={() => {
                    handleLogout();
                    setIsOpen(false);
                  }}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;