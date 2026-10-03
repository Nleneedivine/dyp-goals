import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { linkAuthenticatedEnrollments, safeNextPath } from "@/lib/authOnboarding";

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const complete = async () => {
      try {
        const params = new URLSearchParams(location.search);
        const next = safeNextPath(params.get("next") ?? sessionStorage.getItem("dyp-auth-next"));
        sessionStorage.removeItem("dyp-auth-next");

        let { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          const code = params.get("code");
          if (code) {
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
            session = data.session;
          }
        }

        if (!session) {
          throw new Error("We could not complete sign-in. Please try again.");
        }

        await linkAuthenticatedEnrollments();

        if (active) navigate(next, { replace: true });
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Authentication could not be completed.");
      }
    };

    void complete();

    return () => {
      active = false;
    };
  }, [location.search, navigate]);

  return (
    <main className="min-h-screen brand-wash grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl">
        <BrandLogo className="mx-auto mb-5" />
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Sign-in could not be completed</h1>
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Connecting your DYP account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We are linking your authenticated account to any matching GOALS enrollment.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
