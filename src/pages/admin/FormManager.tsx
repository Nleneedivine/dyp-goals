import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, BarChart3, ExternalLink, FilePlus2, MoreHorizontal, Pencil, QrCode, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { ProgramForm } from "@/lib/formTypes";

export default function FormManager() {
  const [forms, setForms] = useState<ProgramForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<{ title: string; src: string } | null>(null);
  const [performance, setPerformance] = useState<Record<string, { visits: number; submissions: number }>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = async () => {
    const { data, error } = await supabase.from("program_forms").select("*").order("updated_at", { ascending: false });
    if (error) toast({ title: "Forms could not be loaded", description: error.message, variant: "destructive" });
    setForms((data ?? []) as ProgramForm[]);
    const formIds = (data ?? []).map((form) => form.id);
    if (formIds.length) {
      const [{ data: sessions }, { data: submissions }] = await Promise.all([
        supabase.from("program_form_sessions").select("form_id").in("form_id", formIds),
        supabase.from("program_form_submissions").select("form_id").in("form_id", formIds),
      ]);
      const totals: Record<string, { visits: number; submissions: number }> = {};
      formIds.forEach((id) => { totals[id] = { visits: 0, submissions: 0 }; });
      sessions?.forEach((row) => { if (totals[row.form_id]) totals[row.form_id].visits += 1; });
      submissions?.forEach((row) => { if (totals[row.form_id]) totals[row.form_id].submissions += 1; });
      setPerformance(totals);
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const createForm = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const slug = `new-program-${Date.now().toString(36)}`;
    const { data, error } = await supabase.from("program_forms").insert({ title: "Untitled program application", slug, created_by: user.id }).select("id").single();
    if (error) return toast({ title: "Form could not be created", description: error.message, variant: "destructive" });
    navigate(`/admin/forms/${data.id}/edit`);
  };

  const duplicate = async (form: ProgramForm) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { id, created_at, updated_at, ...copy } = form;
    const { data: created, error } = await supabase.from("program_forms").insert({ ...copy, title: `${form.title} copy`, slug: `${form.slug}-copy-${Date.now().toString(36)}`, status: "draft", featured: false, created_by: user.id }).select("id").single();
    if (error || !created) return toast({ title: "Could not duplicate form", description: error?.message, variant: "destructive" });
    const { data: fields } = await supabase.from("program_form_fields").select("*").eq("form_id", form.id);
    if (fields?.length) await supabase.from("program_form_fields").insert(fields.map(({ id: _id, created_at: _created, updated_at: _updated, ...field }) => ({ ...field, form_id: created.id })));
    await load();
  };

  const remove = async (form: ProgramForm) => {
    if (!window.confirm(`Delete “${form.title}” and all collected responses?`)) return;
    const { error } = await supabase.from("program_forms").delete().eq("id", form.id);
    if (error) return toast({ title: "Could not delete form", description: error.message, variant: "destructive" });
    await load();
  };

  const publicUrl = (form: ProgramForm) => `${window.location.origin}/apply/${form.slug}`;
  const showQr = async (form: ProgramForm) => setQr({ title: form.title, src: await QRCode.toDataURL(publicUrl(form), { width: 360, margin: 2 }) });

  return (
    <main className="page-shell max-w-7xl">
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="mb-2 text-sm font-semibold uppercase text-primary">Program operations</p><h1 className="text-3xl font-bold sm:text-5xl">Application forms</h1><p className="mt-3 max-w-2xl text-muted-foreground">Create, publish, share, and understand every program application.</p></div>
        <Button onClick={createForm} size="lg" className="min-h-11"><FilePlus2 className="mr-2 h-5 w-5" />Create form</Button>
      </div>
      {forms.length > 0 && <section className="mb-8"><h2 className="mb-3 text-xl font-semibold">Form comparison</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{forms.map((form) => { const stats = performance[form.id] ?? { visits: 0, submissions: 0 }; const conversion = stats.visits ? Math.round(stats.submissions / stats.visits * 100) : 0; return <Card key={`performance-${form.id}`}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><p className="font-medium">{form.title}</p><span className="text-lg font-bold text-primary">{conversion}%</span></div><p className="mt-2 text-sm text-muted-foreground">{stats.submissions} submissions from {stats.visits} visits</p></CardContent></Card>; })}</div></section>}
      {loading ? <div className="h-48 animate-pulse rounded-lg bg-muted" /> : forms.length === 0 ? (
        <section className="brand-card rounded-lg border p-10 text-center"><FilePlus2 className="mx-auto mb-4 h-10 w-10 text-primary" /><h2 className="text-xl font-semibold">Create your first program form</h2><p className="mx-auto mt-2 max-w-lg text-muted-foreground">Start from a blank form or ask AI to draft the fields from your program description.</p><Button onClick={createForm} className="mt-6">Create form</Button></section>
      ) : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{forms.map((form) => (
        <Card key={form.id} className="overflow-hidden border-primary/10 shadow-[var(--shadow-card)]"><div className="h-2 bg-primary" /><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Badge variant={form.status === "published" ? "default" : "secondary"}>{form.status}</Badge><h2 className="mt-3 truncate text-xl font-semibold">{form.title}</h2><p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">{form.description || "No description yet."}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`More actions for ${form.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void duplicate(form)}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem><DropdownMenuItem onClick={() => void showQr(form)}><QrCode className="mr-2 h-4 w-4" />QR code</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => void remove(form)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><div className="mt-5 flex flex-wrap gap-2"><Button asChild size="sm"><Link to={`/admin/forms/${form.id}/edit`}><Pencil className="mr-2 h-4 w-4" />Edit</Link></Button><Button asChild size="sm" variant="outline"><Link to={`/admin/forms/${form.id}/analytics`}><BarChart3 className="mr-2 h-4 w-4" />Analytics</Link></Button>{form.status === "published" && <Button asChild size="icon" variant="ghost"><a href={publicUrl(form)} target="_blank" rel="noreferrer" aria-label="Open public form"><ExternalLink className="h-4 w-4" /></a></Button>}</div></CardContent></Card>
      ))}</div>}
      <Dialog open={Boolean(qr)} onOpenChange={() => setQr(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{qr?.title}</DialogTitle></DialogHeader>{qr && <img src={qr.src} alt={`QR code for ${qr.title}`} className="mx-auto aspect-square w-full max-w-72" />}</DialogContent></Dialog>
    </main>
  );
}