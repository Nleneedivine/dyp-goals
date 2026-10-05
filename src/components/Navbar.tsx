import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, User, History, Users, ChevronDown, Wrench, Settings, ClipboardList, ArrowRight, Target, ListTodo, Compass, BarChart3, Palette, SlidersHorizontal, MessageSquare, UserCog, Gift } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { NotificationBell } from "@/components/NotificationBell";
import { Ui2MobileBottomNav } from "@/components/Ui2MobileBottomNav";
import { useUiMode } from "@/components/UiModeProvider";
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
  const [isAccountabilityCoach, setIsAccountabilityCoach] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isUi2, clearPreview } = useUiMode();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const { data: adminData } = await supabase.rpc('has_role', { 
          _user_id: session.user.id, 
          _role: 'admin' 
        });
        setIsAdmin(adminData === true);

        const { data: coachData } = await supabase.rpc('has_role', {
          _user_id: session.user.id,
          _role: 'accountability_coach'
        });
        setIsAccountabilityCoach(coachData === true);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer Supabase calls to prevent auth deadlock
          setTimeout(async () => {
            const { data: adminData } = await supabase.rpc('has_role', { 
              _user_id: session.user.id, 
              _role: 'admin' 
            });
            setIsAdmin(adminData === true);

            const { data: coachData } = await supabase.rpc('has_role', {
              _user_id: session.user.id,
              _role: 'accountability_coach'
            });
            setIsAccountabilityCoach(coachData === true);
          }, 0);
        } else {
          setIsAdmin(false);
          setIsAccountabilityCoach(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        console.error('Logout error:', error);
        toast({
          title: "Error",
          description: "Failed to log out. Please try again.",
          variant: "destructive",
        });
        return;
      }
      setUser(null);
      setIsAdmin(false);
      setIsAccountabilityCoach(false);
      // UI 2.0 is an admin-only browser preview for now; do not leak it into the logged-out/public experience.
      clearPreview();
      toast({
        title: "Logged out",
        description: "You've been successfully logged out.",
      });
      navigate("/auth");
    } catch (err) {
      console.error('Logout exception:', err);
    }
  };

  const mainNavItems = [
    { name: "Home", path: "/" },
    { name: "Schedule", path: "/schedule" },
    { name: "Testimonials", path: "/testimonials" },
    { name: "Contact", path: "/contact" },
  ];

  const toolsNavItems = [
    { name: "Journey", path: "/journey", icon: Compass },
    { name: "My GOALS", path: "/my-goals", icon: Target },
    { name: "Plan & Today", path: "/plan", icon: ListTodo },
    { name: "Progress", path: "/progress", icon: BarChart3 },
    { name: "Group Chat", path: "/accountability/chat", icon: MessageSquare },
    { name: "Mentorship", path: "/mentorship", icon: Users },
  ];

  const isActive = (path: string) => location.pathname === path;
  const isToolsActive = toolsNavItems.some(item => location.pathname === item.path);
  const ui2MobileAppRoutes = ["/journey", "/vision", "/my-goals", "/plan", "/todo", "/progress", "/profile"];
  const showUi2MobileBottomNav = isUi2 && Boolean(user) && ui2MobileAppRoutes.includes(location.pathname);

  // Don't show navigation items on auth page
  if (location.pathname === "/auth") {
    return (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center h-20">
            <Link to="/" className="flex items-center gap-2 group">
              <BrandLogo compact />
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <>
      <nav
        data-ui2-shell="top-nav"
        className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg"
      >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 group">
              <BrandLogo compact />
            </Link>
            {isUi2 && isAdmin && (
              <span className="ui2-preview-badge hidden sm:inline-flex">UI 2.0 preview</span>
            )}
          </div>

          {/* Desktop Navigation */}
          <div className="hidden xl:flex items-center gap-5">
            {isUi2 && user ? (
              <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-muted/25 p-1">
                {toolsNavItems.map((item) => {
                  const active = isActive(item.path) || (item.path === "/plan" && location.pathname === "/todo");
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={
                        "flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors " +
                        (active
                          ? "bg-background text-primary shadow-sm"
                          : "text-muted-foreground hover:bg-background/70 hover:text-foreground")
                      }
                    >
                      <item.icon className="h-4 w-4" strokeWidth={1.9} />
                      <span>{item.name === "Plan & Today" ? "Plan" : item.name}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <>
                {mainNavItems.map((item) => (
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

                {!user && (
                  <Button asChild size="sm" variant="outline" className="font-semibold">
                    <Link to="/auth?next=%2Fjourney">
                      Sign in
                    </Link>
                  </Button>
                )}

                <Button asChild size="sm" className="font-semibold">
                  <Link to="/apply/goals-masterclass-2026">
                    Register
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className={`font-medium transition-colors hover:text-primary flex items-center gap-1 ${
                        isToolsActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <Wrench className="h-4 w-4" />
                      Tools
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="bg-card border-border min-w-[180px]">
                    {toolsNavItems.map((item) => (
                      <DropdownMenuItem key={item.path} asChild>
                        <Link 
                          to={item.path} 
                          className={`cursor-pointer flex items-center gap-2 ${
                            isActive(item.path) ? "text-primary" : ""
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.name}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            {user && (
              <div className="flex items-center gap-3">
                <NotificationBell />
                {isAccountabilityCoach && (
                  <Link
                    to="/coach-dashboard"
                    className={`font-medium transition-colors hover:text-primary flex items-center gap-2 ${
                      isActive("/coach-dashboard") ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Coach Dashboard
                  </Link>
                )}
                
                {/* User Account Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="max-w-[15rem] gap-2">
                      <User className="h-4 w-4" />
                      <span className="truncate">{user.email}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border min-w-[200px]">
                    <DropdownMenuItem asChild>
                      <Link to="/profile" className="cursor-pointer flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/goal-history" className="cursor-pointer flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Goal History
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link to="/admin" className="cursor-pointer flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Admin
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/people" className="cursor-pointer flex items-center gap-2">
                            <UserCog className="h-4 w-4" />
                            People & Roles
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/communications" className="cursor-pointer flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Communications
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/sponsorships" className="cursor-pointer flex items-center gap-2">
                            <Gift className="h-4 w-4" />
                            Sponsorships & Seats
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/settings" className="cursor-pointer flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4" />
                            Program settings
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/appearance" className="cursor-pointer flex items-center gap-2">
                            <Palette className="h-4 w-4" />
                            Interface preview
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin/forms" className="cursor-pointer flex items-center gap-2">
                          <ClipboardList className="h-4 w-4" />
                          Program Forms
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Mobile account entry + menu */}
          <div className="flex items-center gap-2 xl:hidden">
            {!user && (
              <Button asChild size="sm" variant="outline" className="h-9 px-3 font-semibold">
                <Link to="/auth?next=%2Fjourney">Sign in</Link>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              className="text-foreground"
              aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className={"xl:hidden max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain py-4 animate-fade-in " + (isUi2 && user ? "pb-24" : "")}>
            {mainNavItems.map((item) => (
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
            
            {!user && (
              <Link to="/auth?next=%2Fjourney" onClick={() => setIsOpen(false)}>
                <Button variant="outline" className="w-full mb-3">
                  Sign in / Participant Login
                </Button>
              </Link>
            )}

            <Link to="/apply/goals-masterclass-2026" onClick={() => setIsOpen(false)}>
              <Button className="w-full mb-3">
                Register for GOALS
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>

            {/* Tools Section in Mobile */}
            <div className="py-3 border-t border-border mt-2">
              <p className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Tools
              </p>
              {toolsNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={`block py-2 pl-6 font-medium transition-colors hover:text-primary flex items-center gap-2 ${
                    isActive(item.path) ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              ))}
            </div>

            {user && (
              <div className="mt-4 pt-4 border-t border-border space-y-3">
                {isAccountabilityCoach && (
                  <Link
                    to="/coach-dashboard"
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-2 py-2 font-medium transition-colors hover:text-primary ${
                      isActive("/coach-dashboard") ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Coach Dashboard
                  </Link>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2 py-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <NotificationBell />
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
                <Link
                  to="/goal-history"
                  onClick={() => setIsOpen(false)}
                >
                  <Button variant="outline" className="w-full gap-2 mb-2">
                    <History className="h-4 w-4" />
                    Goal History
                  </Button>
                </Link>
                {isAdmin && (
                  <Link to="/admin/forms" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full gap-2 mb-2">
                      <ClipboardList className="h-4 w-4" />
                      Program Forms
                    </Button>
                  </Link>
                )}
                {isAdmin && (
                  <>
                    <Link
                      to="/admin"
                      onClick={() => setIsOpen(false)}
                    >
                      <Button variant="outline" className="w-full gap-2 mb-2">
                        <Settings className="h-4 w-4" />
                        Admin
                      </Button>
                    </Link>
                    <Link
                      to="/admin/people"
                      onClick={() => setIsOpen(false)}
                    >
                      <Button variant="outline" className="w-full gap-2 mb-2">
                        <UserCog className="h-4 w-4" />
                        People & Roles
                      </Button>
                    </Link>
                    <Link to="/admin/communications" onClick={() => setIsOpen(false)}>
                      <Button variant="outline" className="w-full gap-2 mb-2">
                        <MessageSquare className="h-4 w-4" />
                        Communications
                      </Button>
                    </Link>
                    <Link to="/admin/sponsorships" onClick={() => setIsOpen(false)}>
                      <Button variant="outline" className="w-full gap-2 mb-2">
                        <Gift className="h-4 w-4" />
                        Sponsorships & Seats
                      </Button>
                    </Link>
                    <Link
                      to="/admin/settings"
                      onClick={() => setIsOpen(false)}
                    >
                      <Button variant="outline" className="w-full gap-2 mb-2">
                        <SlidersHorizontal className="h-4 w-4" />
                        Program settings
                      </Button>
                    </Link>
                    <Link
                      to="/admin/appearance"
                      onClick={() => setIsOpen(false)}
                    >
                      <Button variant="outline" className="w-full gap-2 mb-2">
                        <Palette className="h-4 w-4" />
                        Interface preview
                      </Button>
                    </Link>
                  </>
                )}
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
      {showUi2MobileBottomNav && <Ui2MobileBottomNav />}
    </>
  );
};

export default Navbar;
