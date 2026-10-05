import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  action_label: string | null;
  action_path: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRows([]);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from("user_notifications")
      .select("id,title,body,action_label,action_path,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);
    setLoading(false);
    setRows((data ?? []) as NotificationRow[]);
  };

  useEffect(() => {
    void load();

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "user_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => void load(),
        )
        .subscribe();
    };

    void subscribe();

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const unread = rows.filter((row) => !row.read_at).length;

  const markAllRead = async () => {
    await supabase.rpc("mark_all_notifications_read");
    setRows((current) =>
      current.map((row) => ({
        ...row,
        read_at: row.read_at ?? new Date().toISOString(),
      })),
    );
  };

  const markOneRead = async (id: string) => {
    await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, read_at: row.read_at ?? new Date().toISOString() }
          : row,
      ),
    );
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && void load()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 min-w-5 px-1 text-[10px]">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,390px)] p-0">
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">
              Program, accountability and referral updates
            </p>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void markAllRead()}>
              <CheckCheck className="mr-1 h-4 w-4" />
              Read all
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading && rows.length === 0 ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            rows.map((row) => (
              <DropdownMenuItem
                key={row.id}
                asChild={Boolean(row.action_path)}
                className={
                  "mb-1 block cursor-pointer rounded-xl p-3 " +
                  (!row.read_at ? "bg-primary/5" : "")
                }
                onSelect={() => void markOneRead(row.id)}
              >
                {row.action_path ? (
                  <Link to={row.action_path}>
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {row.body}
                    </p>
                    {row.action_label && (
                      <p className="mt-2 text-xs font-semibold text-primary">
                        {row.action_label} →
                      </p>
                    )}
                  </Link>
                ) : (
                  <div>
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {row.body}
                    </p>
                  </div>
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
