import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TestimonialCard } from '@/components/testimonials/TestimonialCard';
import { displayName, testimonialDb, type NameVisibility, type PrivateTestimonial } from '@/lib/testimonials';

export default function SubmitTestimonial() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<NameVisibility>('full');
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [quote, setQuote] = useState('');
  const [story, setStory] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [showPhoto, setShowPhoto] = useState(true);
  const [previewPortrait, setPreviewPortrait] = useState<string | null>(null);
  useEffect(() => {
    if (!photo || !showPhoto) { setPreviewPortrait(null); return; }
    const url = URL.createObjectURL(photo);
    setPreviewPortrait(url);
    return () => URL.revokeObjectURL(url);
  }, [photo, showPhoto]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) { setUser(data.session?.user ?? null); setAuthReady(true); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); setAuthReady(true); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const ownStories = useQuery({
    queryKey: ['my-testimonials', user?.id], enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await testimonialDb.from('participant_testimonials').select('*').eq('user_id', user!.id).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PrivateTestimonial[];
    },
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || busy) return;
    setError(''); setBusy(true);
    let path: string | null = null;
    try {
      if (photo && showPhoto) {
        const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        if (!extensions[photo.type] || photo.size > 2 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP portrait under 2 MB.');
        path = `${user.id}/${crypto.randomUUID()}.${extensions[photo.type]}`;
        const upload = await supabase.storage.from('testimonial-portraits').upload(path, photo, { contentType: photo.type });
        if (upload.error) throw upload.error;
      }
      const result = await testimonialDb.rpc('submit_participant_testimonial', {
        p_full_name: name.trim(), p_name_visibility: visibility, p_year: year, p_quote: quote.trim(),
        p_story: story.trim(), p_photo_path: path, p_show_photo: Boolean(path && showPhoto), p_consent: consent,
      });
      if (result.error) throw result.error;
      setSubmitted(true); setPhoto(null);
      await client.invalidateQueries({ queryKey: ['my-testimonials'] });
    } catch (cause) {
      if (path) await supabase.storage.from('testimonial-portraits').remove([path]);
      setError(cause instanceof Error ? cause.message : (cause as { message?: string })?.message || 'Your story could not be submitted. Please try again.');
    } finally { setBusy(false); }
  }
  async function withdraw(id: string) {
    setError(''); setWithdrawing(id);
    try {
      const { error } = await testimonialDb.rpc('withdraw_participant_testimonial', { p_id: id });
      if (error) throw error;
      await client.invalidateQueries({ queryKey: ['my-testimonials'] });
      await client.invalidateQueries({ queryKey: ['public-testimonials'] });
    } catch { setError('Your story could not be withdrawn. Please try again.'); }
    finally { setWithdrawing(null); }
  }
  return (
    <main className="page-shell max-w-6xl">
      <Link to="/testimonials" className="text-sm text-primary underline">← Participant stories</Link>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Your GOALS experience</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-5xl">Tell us what changed.</h1>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Share a real experience in your own words. DYP checks participation and reviews each story before publishing. You choose how your name and photo appear.</p>
      <div className="mt-8 flex gap-3 rounded-2xl border bg-card p-5 text-sm leading-6"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><p>Your story may appear on the GOALS website, registration pages and campaign landing sections. Your account details stay private. You can withdraw permission here at any time.</p></div>
      {!authReady ? <p role="status" className="mt-8">Checking your account…</p> : !user ? <div className="mt-8 rounded-3xl border bg-card p-8"><h2 className="text-xl font-semibold">Sign in to share your story</h2><p className="mt-3 text-muted-foreground">This links your submission to your account and lets you withdraw it later. Participation is verified separately.</p><Button asChild className="mt-5"><Link to="/auth?next=%2Ftestimonials%2Fsubmit">Sign in or create an account</Link></Button></div> : submitted ? <div role="status" className="mt-8 rounded-3xl border bg-card p-8"><CheckCircle2 className="h-8 w-8 text-primary" /><h2 className="mt-3 text-2xl font-semibold">Thank you for sharing.</h2><p className="mt-3 text-muted-foreground">Your story is awaiting review. It is not public yet.</p><Button variant="outline" className="mt-5" onClick={() => { setSubmitted(false); setQuote(''); setStory(''); setConsent(false); }}>Share another experience</Button></div> : <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <form onSubmit={submit} className="space-y-5 rounded-3xl border bg-card p-6 sm:p-8">
          <label className="block text-sm font-medium">Your real name<Input className="mt-2" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} required autoComplete="name" /></label>
          <label className="block text-sm font-medium">Display my name as<select className="mt-2 flex h-11 w-full rounded-md border bg-background px-3" value={visibility} onChange={e => setVisibility(e.target.value as NameVisibility)}><option value="full">Full name</option><option value="initial">First name + last initial</option><option value="first">First name only</option></select></label>
          <label className="block text-sm font-medium">Year you participated<select className="mt-2 flex h-11 w-full rounded-md border bg-background px-3" value={year} onChange={e => setYear(Number(e.target.value))}>{Array.from({ length: new Date().getFullYear() - 2018 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}</select></label>
          <label className="block text-sm font-medium">Your experience in one sentence<Textarea className="mt-2" value={quote} onChange={e => setQuote(e.target.value)} minLength={10} maxLength={240} required placeholder="What changed in how you plan or follow through?" /><span className="mt-1 block text-xs text-muted-foreground">{quote.length}/240 characters</span></label>
          <label className="block text-sm font-medium">The story behind it (optional)<Textarea className="mt-2 min-h-32" value={story} onChange={e => setStory(e.target.value)} maxLength={2000} placeholder="Where were you before GOALS? What did you try, and what happened?" /></label>
          <label className="block text-sm font-medium">Your portrait (optional)<Input className="mt-2" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0] ?? null)} /><span className="mt-1 block text-xs text-muted-foreground">JPG, PNG or WebP, up to 2 MB. Use a photo of yourself.</span></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={showPhoto} onChange={e => setShowPhoto(e.target.checked)} />Show my portrait publicly after approval</label>
          <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={consent} onChange={e => setConsent(e.target.checked)} required />This is my genuine experience. I give DYP permission to publish this quote and story on its GOALS website using my chosen name and photo settings.</label>
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Submitting…' : 'Send for review'}</Button>
        </form>
        <aside><h2 className="text-sm font-semibold">Your public name and story preview</h2><TestimonialCard preview featured previewPortrait={previewPortrait} story={{ id: 'preview', display_name: displayName(name, visibility), participant_year: year, quote: quote || 'Your own words will appear here.', story, photo_path: null, verified: false, featured: true }} /><p className="mt-4 text-xs leading-6 text-muted-foreground">The verified badge is added only after DYP confirms participation. Portraits are reviewed before publication.</p></aside>
      </div>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-destructive/30 p-4 text-destructive">{error}</p>}
      {user && <section className="mt-12"><h2 className="text-2xl font-semibold">Your submitted stories</h2>{ownStories.isPending && <p role="status" className="mt-4">Loading your stories…</p>}{ownStories.isError && <p role="alert" className="mt-4">Your stories could not load. <button className="underline" onClick={() => void ownStories.refetch()}>Try again</button></p>}{ownStories.data?.length === 0 && <p className="mt-4 text-muted-foreground">You have not submitted a story yet.</p>}<div className="mt-4 space-y-3">{ownStories.data?.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5"><div className="min-w-0 flex-1"><p className="break-words font-medium">“{s.quote}”</p><p className="mt-2 text-sm capitalize text-muted-foreground">{s.participant_year} · {s.status === 'approved' ? 'Published' : s.status}</p></div>{s.publish_consent && <Button variant="outline" disabled={withdrawing !== null} onClick={() => void withdraw(s.id)}>{withdrawing === s.id ? 'Withdrawing…' : 'Withdraw permission'}</Button>}</div>)}</div><p className="mt-4 text-xs text-muted-foreground">Withdrawal removes the story from public feeds. An already loaded portrait may remain accessible for up to one minute.</p></section>}
    </main>
  );
}
