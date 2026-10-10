import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const emailDb: SupabaseClient = supabase;
type Overview = { counts: Record<string, number>; oldest_pending_at: string | null; accepted_last_24h: number; runtime: { worker_version?: string; last_checked_at?: string; blocked_reason?: string } | null; jobs: { jobname: string; schedule: string; active: boolean; runs: { status: string; start_time: string }[] }[] };
type QueueItem = { id: string; subject: string; notification_type: string; status: string; last_error: string; attempt_count: number; created_at: string };
export default function AdminEmail() {
  const [status, setStatus] = useState("failed");
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ["admin-email-overview"], refetchInterval: 60_000, queryFn: async () => {
    const { data, error } = await emailDb.rpc("admin_email_system_overview");
    if (error) throw error;
    return data as Overview;
  } });
  const queue = useQuery({ queryKey: ["admin-email-queue", status], queryFn: async () => {
    let request = emailDb.from("email_notification_queue").select("id,subject,notification_type,status,last_error,attempt_count,created_at").order("created_at", { ascending: false }).limit(50);
    if (status !== "all") request = request.eq("status", status);
    const { data, error } = await request;
    if (error) throw error;
    return data as QueueItem[];
  } });
  const sender = useQuery({ queryKey: ["admin-email-sender"], retry: false, queryFn: async () => {
    const { data, error } = await supabase.functions.invoke("email-admin", { body: { action: "status" } });
    if (error) throw error;
    return data as { sender_configured: boolean; provider_configured: boolean; sender: string | null };
  } });
  const workerReady = overview.data?.runtime?.worker_version === "email-system-v2" && !!overview.data.runtime.last_checked_at && Date.now() - Date.parse(overview.data.runtime.last_checked_at) < 60 * 60_000;
  const configured = workerReady && sender.data?.sender_configured && sender.data?.provider_configured;
  const act = async (id: string) => {
    setBusy(id);
    try {
      if (id === "test") {
        const { data, error } = await supabase.functions.invoke("email-admin", { body: { action: "test" } });
        if (error || !data?.accepted) throw error ?? new Error(data?.error || "Test was not accepted");
        toast({ title: "Test accepted by provider", description: "Check your own admin inbox. Inbox delivery is not yet confirmed." });
      } else {
        const { error } = await emailDb.rpc("admin_retry_email", { p_id: id });
        if (error) throw error;
        toast({ title: "Message queued for retry", description: "The automatic worker will process it. This does not confirm delivery." });
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-email-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-email-overview"] });
    } catch (error) {
      toast({ title: "Email action failed", description: error instanceof Error ? error.message : "Try again later", variant: "destructive" });
    } finally { setBusy(null); }
  };
  return <main className="mx-auto max-w-6xl px-4 pb-16 pt-28">
    <Link to="/admin" className="text-sm text-muted-foreground">← Back to admin</Link>
    <h1 className="mt-6 text-3xl font-semibold">Email system</h1>
    <p className="mt-2 text-muted-foreground">Automatic account, program and participant story updates. Review failures and sending setup here.</p>
    <Card className="my-6"><CardHeader><CardTitle>Sending setup</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="font-medium">{configured ? "Sender configured — verify domain status in your provider dashboard" : "Setup required before participant emails can send"}</p>
      <p className="text-sm text-muted-foreground">The previous test sender could only reach the provider account owner. Sending to participants requires a domain you own and verified sending records.</p>
      <p className="text-sm">Lovable managed emails: open <a className="underline" href="https://lovable.dev/projects/a7598638-632b-403e-a0b9-44157833693f" target="_blank" rel="noreferrer">your Lovable project</a> → More → Cloud → Emails. This supports automatic app emails and branded sign-up/password-reset emails after domain verification. Managed delivery must then be connected to this queue; it is not enabled by this page.</p>
      <p className="text-sm">App email transport: Resend. Add a dedicated sending-only key to backend secrets as RESEND_DIRECT_API_KEY, verify your sending domain and configure EMAIL_FROM. The existing Lovable gateway connection remains a fallback. Confirmation and password-reset messages continue through Cloud Auth's separate sender.</p>
      <p className="text-sm">Backend worker: {workerReady ? "updated worker checked in" : "updated deployment not confirmed"}. Sender: {sender.data?.sender || (sender.isError ? "backend status unavailable — deploy email-admin" : "not configured")}.</p>
      <Button disabled={!configured || busy !== null} onClick={() => void act("test")}>Send test to my admin email</Button>
      <p className="text-xs text-muted-foreground">Tests only go to the signed-in admin. No historical messages are automatically retried.</p>
    </CardContent></Card>
    {overview.isError && <p role="alert" className="mb-4 text-destructive">Email overview could not load. <Button variant="link" onClick={() => void overview.refetch()}>Retry</Button></p>}
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{["pending", "processing", "sent", "failed"].map(key => <Card key={key}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{key === "sent" ? "Provider accepted" : key.charAt(0).toUpperCase() + key.slice(1)}</p><p className="mt-1 text-3xl font-semibold">{overview.data ? overview.data.counts[key] ?? 0 : "—"}</p></CardContent></Card>)}</div>
    <p className="mt-3 text-xs text-muted-foreground">Provider accepted means queued by the email service. It does not prove inbox delivery. No delivery webhook is connected yet.</p>
    <Card className="my-6"><CardHeader><CardTitle>Automatic schedule</CardTitle></CardHeader><CardContent className="space-y-3">
      {overview.data?.jobs.map(job => <div key={job.jobname}><p className="font-medium break-words">{job.jobname}</p><p className="text-sm text-muted-foreground">{job.active ? "Enabled" : "Paused"} · {job.schedule} · Last scheduler run: {job.runs[0]?.status ?? "none recorded"}</p></div>)}
      <p className="text-xs text-muted-foreground">A successful scheduler run confirms that the job started. Check queue errors and worker status for sending results.</p>
    </CardContent></Card>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Recent emails</h2><label className="text-sm">Queue <select className="ml-2 rounded border bg-background p-2" value={status} onChange={e => setStatus(e.target.value)}>{["failed", "pending", "processing", "sent", "cancelled", "all"].map(value => <option key={value} value={value}>{value === "sent" ? "Provider accepted" : value}</option>)}</select></label></div>
    {queue.isLoading ? <p>Loading emails…</p> : queue.isError ? <p role="alert">Queue could not load. <Button variant="link" onClick={() => void queue.refetch()}>Retry</Button></p> : queue.data?.length === 0 ? <p className="text-muted-foreground">No emails in this queue.</p> : <div className="space-y-3">{queue.data?.map(item => <Card key={item.id}><CardContent className="space-y-2 pt-5"><p className="font-medium">{item.subject}</p><p className="text-xs text-muted-foreground">{item.status === "sent" ? "Provider accepted" : item.status} · {item.notification_type} · {item.attempt_count} attempts · {new Date(item.created_at).toLocaleString()}</p>{item.last_error && <p className="break-words text-sm text-destructive">{item.last_error}</p>}{item.status === "failed" && <Button variant="outline" disabled={!configured || busy !== null} onClick={() => void act(item.id)}>Retry this message</Button>}</CardContent></Card>)}</div>}
    <p className="mt-4 text-xs text-muted-foreground">Shows the latest 50 matching messages. New automatic flows: confirmed-account welcome, registration linked to account, story received and story approved. Existing payment, certificate, group and reminder flows remain connected.</p>
  </main>;
}
