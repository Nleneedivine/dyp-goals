import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { linkAuthenticatedEnrollments } from "@/lib/authOnboarding";

const schema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;

      if (session) {
        setReady(true);
        return;
      }

      const timeout = window.setTimeout(() => {
        if (active) setInvalid(true);
      }, 1200);

      return () => window.clearTimeout(timeout);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setInvalid(false);
      }
    });

    void check();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    const parsed = schema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the password fields.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    try {
      await linkAuthenticatedEnrollments();
    } catch {
      // Password reset succeeded; enrollment linking can retry on the next sign-in.
    }

    setLoading(false);
    setComplete(true);
  };

  return (
    <main className="min-h-screen brand-wash flex items-center justify-center p-4 pt-28 sm:p-8 sm:pt-28">
      <Card className="w-full max-w-md border-primary/15 shadow-2xl">
        <CardHeader>
          <BrandLogo className="mx-auto mb-4" />
          <CardTitle className="text-center text-2xl">Choose a new password</CardTitle>
          <CardDescription className="text-center">
            Secure your DYP account with a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!ready && !invalid && (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Validating your recovery link…</p>
            </div>
          )}

          {invalid && (
            <div className="space-y-4 text-center">
              <p className="font-medium">This recovery link is invalid or has expired.</p>
              <Button onClick={() => navigate("/forgot-password")} className="w-full">
                Request another reset link
              </Button>
            </div>
          )}

          {ready && !complete && (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}

          {complete && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <p className="font-medium">Password updated successfully.</p>
              <Button className="w-full" onClick={() => navigate("/journey", { replace: true })}>
                Continue to My GOALS Journey
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
