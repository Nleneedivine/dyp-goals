import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MessageSquare, Users, UserCog, ArrowLeft } from "lucide-react";
import ChatWindow from "@/components/chat/ChatWindow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type ChatState = {
  available?: boolean;
  reason?: string;
  groupId?: string;
  groupName?: string;
  chatId?: string;
  coachId?: string | null;
  coachName?: string | null;
};

export default function AccountabilityChat() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [state, setState] = useState<ChatState | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);
      const { data, error } = await supabase.rpc("current_user_accountability_chat");
      if (!error) setState((data ?? null) as ChatState | null);
      setLoading(false);
    };

    void load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen pt-28 grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 pb-10 pt-24 sm:px-4 sm:pt-28">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Accountability Lab
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Group Chat</h1>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/journey">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Journey
            </Link>
          </Button>
        </div>

        {!state?.available || !state.chatId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-xl font-semibold">Your group chat is not available yet</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                {state?.reason === "no-group"
                  ? "Join Accountability Lab first. Once you are placed in a group, its chat will appear here automatically."
                  : "A current GOALS enrollment and accountability-group placement are required for group chat."}
              </p>
              <Button asChild className="mt-5">
                <Link to="/journey">Open Accountability Lab</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{state.groupName ?? "My Accountability Group"}</p>
                  <p className="text-xs text-muted-foreground">Current GOALS cohort group chat</p>
                </div>
              </div>
              {state.coachName ? (
                <Badge variant="secondary" className="gap-1">
                  <UserCog className="h-3 w-3" />
                  Coach: {state.coachName}
                </Badge>
              ) : (
                <Badge variant="outline">Coach not assigned yet</Badge>
              )}
            </div>
            <div className="h-[calc(100svh-14rem)] min-h-[480px]">
              <ChatWindow
                currentUserId={userId}
                chatId={state.chatId}
                chatType="group"
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
