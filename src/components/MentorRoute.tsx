import { useEffect, useState, ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface MentorRouteProps {
  children: ReactNode;
}

const MentorRoute = ({ children }: MentorRouteProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isMentor, setIsMentor] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkMentorStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        setIsAuthenticated(true);

        const { data } = await supabase.rpc('has_role', {
          _user_id: session.user.id,
          _role: 'mentor'
        });

        setIsMentor(data === true);
      } catch (error) {
        console.error('Error checking mentor status:', error);
        setIsMentor(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkMentorStatus();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!isMentor) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default MentorRoute;