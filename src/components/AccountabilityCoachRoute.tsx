import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function AccountabilityCoachRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setAuthenticated(false);
        setLoading(false);
        return;
      }

      setAuthenticated(true);
      const [{ data: coach }, { data: admin }] = await Promise.all([
        supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "accountability_coach",
        }),
        supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "admin",
        }),
      ]);

      setAllowed(coach === true || admin === true);
      setLoading(false);
    };

    void check();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?next=${encodeURIComponent(next)}`} replace />;
  }

  if (!allowed) return <Navigate to="/journey" replace />;

  return <>{children}</>;
}
