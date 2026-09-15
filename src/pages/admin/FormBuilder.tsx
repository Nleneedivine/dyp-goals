import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, ChevronDown, ChevronUp, Copy, Eye, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FIELD_TYPES, makeSlug, parseOptions, type FieldType, type ProgramField, type ProgramForm } from "@/lib/formTypes";
import type { Json } from "@/integrations/supabase/types";

type DraftField = { field_type: FieldType; label: string; helper_text: string; placeholder: string; required: boolean; options: string[] };
const emptyField = (type: FieldType): DraftField => ({ field_type: type, label: type === "section" ? "Section heading" : "New question", helper_text: "", placeholder: "", required: false, options: ["Option 1", "Option 2"] });

export default function FormBuilder() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<ProgramForm | null>(null);
  const [fields, setFields] = useState<ProgramField[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const publicUrl = useMemo(() => form ? `${window.location.origin}/apply/${form.slug}` : "", [form]);

  const load = async () => {
    if (!formId) return;
    const [{ data: formData }, { data: fieldData }] = await Promise.all([
      supabase.from("program_forms").select("*").eq("id", formId).single(),
      supabase.from("program_form_fields").select("*").eq("form_id", formId).order("display_order"),
    ]);
    setForm(formData as ProgramForm);
    setFields((fieldData ?? []) as ProgramField[]);
  };
  useEffect(() => { void load(); }, [formId]);

  const updateField = (id: string, patch: Partial<ProgramField>) => setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field));
  const move = (index: number, direction: -1 | 1) => setFields((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const addField = async (type: FieldType) => {
    if (!formId) return;
    const field = emptyField(type);
    const { data, error } = await supabase.from("program_form_fields").insert({ ...field, options: field.options as Json, form_id: formId, display_order: fields.length }).select("*").single();
    if (error) return toast({ title: "Field could not be added", description: error.message, variant: "destructive" });
    setFields((current) => [...current, data as ProgramField]);
  };
  const removeField = async (id: string) => { await supabase.from("program_form_fields").delete().eq("id", id); setFields((current) => current.filter((field) => field.id !== id)); };

  const save = async (status?: ProgramForm["status"]) => {
    if (!form || !formId) return;
    setSaving(true);
    const nextForm = { ...form, status: status ?? form.status, slug: makeSlug(form.slug || form.title) };
    const { error } = await supabase.from("program_forms").update({ title: nextForm.title, description: nextForm.description, slug: nextForm.slug, brand: nextForm.brand, status: nextForm.status, featured: nextForm.featured, opens_at: nextForm.opens_at || null, closes_at: nextForm.closes_at || null, submission_deadline: nextForm.submission_deadline || null, response_limit: nextForm.response_limit || null, confirmation_message: nextForm.confirmation_message, confirmation_email_enabled: nextForm.confirmation_email_enabled, dropoff_warning_threshold: nextForm.dropoff_warning_threshold, low_fill_threshold: nextForm.low_fill_threshold }).eq("id", formId);
    if (!error) for (let index = 0; index < fields.length; index += 1) { const field = fields[index]; await supabase.from("program_form_fields").update({ label: field.label, helper_text: field.helper_text, placeholder: field.placeholder, required: field.required, display_order: index, options: field.options, validation_rules: field.validation_rules, conditional_logic: field.conditional_logic }).eq("id", field.id); }
    setSaving(false);
    if (error) toast({ title: "Form could not be saved", description: error.message, variant: "destructive" }); else { setForm(nextForm); toast({ title: status === "published" ? "Form published" : "Changes saved", description: status === "published" ? "The public link is ready to share." : undefined }); }
  };

  const draftWithAi = async () => {
    if (!formId || aiPrompt.trim().length < 20) return toast({ title: "Describe the program", description: "Include the audience, purpose, and any important requirements." });
    setDrafting(true);
    const { data, error } = await supabase.functions.invoke("draft-program-form", { body: { description: aiPrompt } });
    if (error || !data?.draft) { setDrafting(false); return toast({ title: "AI draft unavailable", description: data?.error ?? error?.message, variant: "destructive" }); }
    const draft = data.draft as { title: string; description: string; fields: DraftField[] };
    setForm((current) => current ? { ...current, title: draft.title || current.title, description: draft.description || current.description, slug: makeSlug(draft.title || current.title) } : current);
    const inserts = (draft.fields ?? []).slice(0, 20).map((field, index) => ({ form_id: formId, display_order: fields.length + index, field_type: field.field_type, label: field.label, helper_text: field.helper_text ?? "", placeholder: field.placeholder ?? "", required: Boolean(field.required), options: (field.options ?? []) as Json }));
    const { data: created, error: insertError } = await supabase.from("program_form_fields").insert(inserts).select("*");
    if (!insertError) setFields((current) => [...current, ...((created ?? []) as ProgramField[])]);
    setDrafting(false);
  };

  if (!form) return <main className="page-shell"><div className="h-56 animate-pulse rounded-lg bg-muted" /></main>;
  return <main className="page-shell max-w-7xl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => navigate("/admin/forms")}><ArrowLeft className="mr-2 h-4 w-4" />All forms</Button><div className="flex flex-wrap gap-2"><Button variant="outline" asChild disabled={form.status !== "published"}><Link to={`/apply/${form.slug}`} target="_blank"><Eye className="mr-2 h-4 w-4" />Preview</Link></Button><Button variant="outline" onClick={() => void save()} disabled={saving}><Save className="mr-2 h-4 w-4" />Save</Button><Button onClick={() => void save("published")} disabled={saving || fields.length === 0}>Publish</Button></div></div>
    <Tabs defaultValue="build"><TabsList className="mb-6 grid h-auto w-full grid-cols-3"><TabsTrigger className="min-h-11" value="build">Build</TabsTrigger><TabsTrigger className="min-h-11" value="settings">Settings</TabsTrigger><TabsTrigger className="min-h-11" value="share">Share</TabsTrigger></TabsList>
      <TabsContent value="build"><div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"><aside className="space-y-5"><Card className="border-primary/15"><CardContent className="p-4"><h2 className="mb-3 font-semibold">AI form draft</h2><Textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} maxLength={4000} placeholder="Application form for a 6-week leadership fellowship for young adults…" /><Button className="mt-3 w-full" onClick={() => void draftWithAi()} disabled={drafting}><Bot className="mr-2 h-4 w-4" />{drafting ? "Drafting…" : "Draft with AI"}</Button></CardContent></Card><Card><CardContent className="p-4"><h2 className="mb-3 font-semibold">Add a field</h2><div className="grid grid-cols-2 gap-2">{FIELD_TYPES.map(([type, label]) => <Button key={type} variant="outline" className="h-auto min-h-11 justify-start whitespace-normal text-left text-xs" onClick={() => void addField(type)}><Plus className="mr-1 h-3 w-3 shrink-0" />{label}</Button>)}</div></CardContent></Card></aside>
        <section className="min-w-0 space-y-4"><Card><CardContent className="space-y-4 p-5"><div><Label htmlFor="form-title">Form title</Label><Input id="form-title" value={form.title} maxLength={160} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div><div><Label htmlFor="form-description">Description</Label><Textarea id="form-description" value={form.description} maxLength={3000} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div></CardContent></Card>{fields.map((field, index) => <Card key={field.id} draggable onDragStart={(event) => event.dataTransfer.setData("fieldIndex", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const from = Number(event.dataTransfer.getData("fieldIndex")); if (Number.isFinite(from) && from !== index) setFields((current) => { const next = [...current]; const [item] = next.splice(from, 1); next.splice(index, 0, item); return next; }); }}><CardContent className="p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><GripVertical className="h-5 w-5 cursor-grab text-muted-foreground" /><Select value={field.field_type} onValueChange={(value) => updateField(field.id, { field_type: value as FieldType })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{FIELD_TYPES.map(([type, label]) => <SelectItem key={type} value={type}>{label}</SelectItem>)}</SelectContent></Select><div className="ml-auto flex"><Button size="icon" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move field up"><ChevronUp /></Button><Button size="icon" variant="ghost" onClick={() => move(index, 1)} disabled={index === fields.length - 1} aria-label="Move field down"><ChevronDown /></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => void removeField(field.id)} aria-label="Delete field"><Trash2 /></Button></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Label</Label><Input value={field.label} maxLength={180} onChange={(event) => updateField(field.id, { label: event.target.value })} /></div><div><Label>Helper text</Label><Input value={field.helper_text} maxLength={500} onChange={(event) => updateField(field.id, { helper_text: event.target.value })} /></div><div><Label>Placeholder</Label><Input value={field.placeholder} maxLength={300} onChange={(event) => updateField(field.id, { placeholder: event.target.value })} /></div>{["dropdown","multi_select","radio"].includes(field.field_type) && <div className="sm:col-span-2"><Label>Options (one per line)</Label><Textarea value={parseOptions(field.options).join("\n")} onChange={(event) => updateField(field.id, { options: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} /></div>}<label className="flex min-h-11 items-center gap-3"><Switch checked={field.required} onCheckedChange={(checked) => updateField(field.id, { required: checked })} />Required</label></div></CardContent></Card>)}</section></div></TabsContent>
      <TabsContent value="settings"><Card><CardContent className="grid gap-5 p-5 md:grid-cols-2"><div><Label>Public link</Label><Input value={form.slug} onChange={(event) => setForm({ ...form, slug: makeSlug(event.target.value) })} /></div><div><Label>Brand</Label><Select value={form.brand} onValueChange={(value) => setForm({ ...form, brand: value as "goals" | "dyp" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="goals">GOALS</SelectItem><SelectItem value="dyp">DYP</SelectItem></SelectContent></Select></div><div><Label>Opens</Label><Input type="datetime-local" value={form.opens_at?.slice(0,16) ?? ""} onChange={(event) => setForm({ ...form, opens_at: event.target.value || null })} /></div><div><Label>Closes</Label><Input type="datetime-local" value={form.closes_at?.slice(0,16) ?? ""} onChange={(event) => setForm({ ...form, closes_at: event.target.value || null })} /></div><div><Label>Response limit</Label><Input type="number" min={1} value={form.response_limit ?? ""} onChange={(event) => setForm({ ...form, response_limit: event.target.value ? Number(event.target.value) : null })} /></div><div><Label>Drop-off warning (%)</Label><Input type="number" min={0} max={100} value={form.dropoff_warning_threshold} onChange={(event) => setForm({ ...form, dropoff_warning_threshold: Number(event.target.value) })} /></div><div className="md:col-span-2"><Label>Confirmation message</Label><Textarea value={form.confirmation_message} onChange={(event) => setForm({ ...form, confirmation_message: event.target.value })} /></div><label className="flex min-h-11 items-center gap-3"><Switch checked={form.featured} onCheckedChange={(checked) => setForm({ ...form, featured: checked })} />Feature on home</label><label className="flex min-h-11 items-center gap-3"><Switch checked={form.confirmation_email_enabled} onCheckedChange={(checked) => setForm({ ...form, confirmation_email_enabled: checked })} />Confirmation email</label></CardContent></Card></TabsContent>
      <TabsContent value="share"><Card><CardContent className="space-y-5 p-6"><div><Label>Public form link</Label><div className="mt-2 flex gap-2"><Input readOnly value={publicUrl} /><Button size="icon" variant="outline" onClick={() => navigator.clipboard.writeText(publicUrl)} aria-label="Copy public link"><Copy /></Button></div></div><div><Label>Embed code</Label><Textarea readOnly value={`<iframe src="${publicUrl}" title="${form.title}" width="100%" height="760" loading="lazy"></iframe>`} /></div></CardContent></Card></TabsContent>
    </Tabs>
  </main>;
}