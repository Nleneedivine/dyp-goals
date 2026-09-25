import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const checkRole = async (nextUser: User | null) => {
      if (!active) return;

      setUser(nextUser);

      if (!nextUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const cacheKey = `dyp-admin:${nextUser.id}`;
      const cached = sessionStorage.getItem(cacheKey) === "true";

      // The cache only speeds up the UI. Supabase RLS still protects every
      // admin query, so this never grants database access by itself.
      if (cached) {
        setIsAdmin(true);
        setLoading(false);
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", nextUser.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!active) return;

      const confirmed = !error && data?.role === "admin";
      setIsAdmin(confirmed);
      setLoading(false);

      if (confirmed) sessionStorage.setItem(cacheKey, "true");
      else sessionStorage.removeItem(cacheKey);
    };

    const initialize = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await checkRole(session?.user ?? null);
    };

    void initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void checkRole(session?.user ?? null);
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
