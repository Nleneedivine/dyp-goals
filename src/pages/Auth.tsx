import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { linkAuthenticatedEnrollments, safeNextPath } from "@/lib/authOnboarding";
import { lovable } from "@/integrations/lovable/index";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
      <path fill="currentColor" opacity=".75" d="M12 22c2.7 0 5-.9 6.6-2.4L15.4 17c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z" />
      <path fill="currentColor" opacity=".55" d="M6.5 14A6 6 0 0 1 6.2 12c0-.7.1-1.4.3-2V7.4H3.2A10 10 0 0 0 2 12c0 1.6.4 3.1 1.2 4.6L6.5 14Z" />
      <path fill="currentColor" opacity=".9" d="M12 6c1.6 0 3 .5 4.1 1.6L19 4.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.8 5.4L6.5 10A5.8 5.8 0 0 1 12 6Z" />
    </svg>
  );
}

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const nextPath = useMemo(
    () => safeNextPath(searchParams.get("next")),
    [searchParams],
  );
  const activationMode = searchParams.get("mode") === "activate";

  useEffect(() => {
    let active = true;

    const finishAuthenticatedSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session) return;

      try {
        await linkAuthenticatedEnrollments();
      } catch (error) {
        console.error("Enrollment linking failed:", error);
      }

      if (active) navigate(nextPath, { replace: true });
    };

    void finishAuthenticatedSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session) return;
      window.setTimeout(async () => {
        try {
          await linkAuthenticatedEnrollments();
        } catch (error) {
          console.error("Enrollment linking failed:", error);
        }
        if (active) navigate(nextPath, { replace: true });
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate, nextPath]);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    // Remember the intended destination; the callback reads it after the session exists.
    sessionStorage.setItem("dyp-auth-next", nextPath);

    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });

    if (result.error) {
      setGoogleLoading(false);
      toast({
        title: "Google sign-in could not start",
        description: result.error.message,
        variant: "destructive",
      });
      return;
    }

    if (result.redirected) return;

    // Popup flow (e.g. preview): session is already set; onAuthStateChange links + navigates.
    setGoogleLoading(false);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      loginSchema.parse({ email, password });

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      await linkAuthenticatedEnrollments();

      toast({
        title: "Welcome back!",
        description: "Your DYP account is ready.",
      });

      navigate(nextPath, { replace: true });
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const firstName = String(formData.get("firstName") ?? "");
    const lastName = String(formData.get("lastName") ?? "");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      signupSchema.parse({ firstName, lastName, email, password });

      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", nextPath);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (error) throw error;

      if (data.session) {
        await linkAuthenticatedEnrollments();
        toast({
          title: "Account created",
          description: "Your DYP account has been linked to your GOALS participation.",
        });
        navigate(nextPath, { replace: true });
      } else {
        toast({
          title: "Check your email",
          description: "Use the confirmation link we sent to finish activating your DYP account.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen brand-wash flex items-center justify-center p-4 pt-28 sm:p-8 sm:pt-28">
      <Card className="w-full max-w-md border-primary/15 shadow-2xl">
        <CardHeader>
          <BrandLogo className="mx-auto mb-4" />
          <CardTitle className="text-2xl text-center">
            {activationMode ? "Activate your GOALS account" : "Welcome to DYP GOALS"}
          </CardTitle>
          <CardDescription className="text-center">
            {activationMode
              ? "Sign in or create an account using the same email you registered with. We’ll connect it to your GOALS participation."
              : "Sign in to continue your GOALS journey."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full gap-3"
            disabled={googleLoading || loading}
            onClick={() => void handleGoogle()}
          >
            {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="your@email.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="login-password">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || googleLoading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input id="firstName" name="firstName" autoComplete="given-name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input id="lastName" name="lastName" autoComplete="family-name" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Use the email you registered with"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || googleLoading}>
                  {loading ? "Creating account…" : "Create DYP account"}
                  {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {activationMode && (
            <p className="mt-5 rounded-lg bg-muted/30 p-3 text-center text-xs text-muted-foreground">
              Already participated in DYP before? Sign in with your existing account instead of creating another one.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default Auth;
