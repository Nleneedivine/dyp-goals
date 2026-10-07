import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TestimonialCard } from '@/components/testimonials/TestimonialCard';
import { displayName, testimonialDb, testimonialPlacements, type PrivateTestimonial, type TestimonialPlacement } from '@/lib/testimonials';

function ReviewStory({ record }: { record: PrivateTestimonial }) {
  const [verified, setVerified] = useState(record.verified);
  const [notes, setNotes] = useState(record.verification_notes);
  const [featured, setFeatured] = useState(record.featured);
  const [placements, setPlacements] = useState(record.placements);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const client = useQueryClient();
  async function save(status: PrivateTestimonial['status']) {
    setBusy(true); setMessage('');
    try {
      const { data: { user } } = await testimonialDb.auth.getUser();
      if (!user) throw new Error('Sign in again to continue.');
      const { error } = await testimonialDb.from('participant_testimonials').update({
        status, verified, verification_notes: notes.trim(), featured, placements,
        reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq('id', record.id).eq('publish_consent', true).select('id').single();
      if (error) throw error;
      await client.invalidateQueries({ queryKey: ['admin-testimonials'] });
      await client.invalidateQueries({ queryKey: ['public-testimonials'] });
      setMessage('Review saved.');
    } catch { setMessage('Review could not save. Refresh to check whether consent changed, then try again.'); }
    finally { setBusy(false); }
  }
  const disabled = busy || !record.publish_consent || record.status === 'withdrawn';
  return <article className="rounded-3xl border bg-card p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{record.full_name}</h2><p className="mt-1 text-xs capitalize text-muted-foreground">{record.status} · Submitted {new Date(record.created_at).toLocaleDateString()}</p></div><span className="text-xs">{record.publish_consent ? 'Publishing consent recorded' : 'Consent withdrawn'}</span></div>
    <div className="mt-3 grid gap-8 lg:grid-cols-2"><div><TestimonialCard story={{ ...record, display_name: displayName(record.full_name, record.name_visibility), photo_path: record.show_photo ? record.photo_path : null }} featured={featured} />{!record.show_photo && <p className="mt-3 text-xs text-muted-foreground">Participant chose to hide their photo.</p>}</div>
    <fieldset disabled={disabled} className="mt-6 space-y-5 disabled:opacity-60"><legend className="font-semibold">Review and publication</legend>
      <p className="text-sm leading-6 text-muted-foreground">Confirm this person's participation and check the story against available evidence. Keep their words and privacy settings intact.</p>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-4 w-4" type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} />I have verified this participant and reviewed their account of the experience.</label>
      <label className="block text-sm font-medium">Private verification note<Textarea className="mt-2" value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)} placeholder="Record how participation was checked, e.g. attendance or certificate record." /></label>
      <label className="flex items-center gap-3 text-sm"><input className="h-4 w-4" type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} />Feature this story</label>
      <div><p className="mb-3 text-sm font-semibold">Show on these pages</p><div className="grid gap-3 sm:grid-cols-2">{testimonialPlacements.map(p => <label key={p} className="flex items-center gap-3 text-sm capitalize"><input className="h-4 w-4" type="checkbox" checked={placements.includes(p)} onChange={e => setPlacements(current => e.target.checked ? [...current, p] : current.filter(item => item !== p))} />{p === 'campaign' ? 'Campaign landing sections' : p}</label>)}</div></div>
      <div className="flex flex-wrap gap-3"><Button disabled={!verified || !notes.trim() || !placements.length} onClick={() => void save('approved')}>{busy ? 'Saving…' : 'Approve & publish'}</Button><Button variant="outline" onClick={() => void save('pending')}>Save as pending</Button><Button variant="outline" onClick={() => void save('rejected')}>Reject / unpublish</Button></div>
    </fieldset></div>
    {message && <p role="status" className="mt-5 text-sm">{message}</p>}
  </article>;
}
export default function AdminTestimonials() {
  const [filter, setFilter] = useState('pending');
  const [limit, setLimit] = useState(30);
  const query = useQuery({
    queryKey: ['admin-testimonials', filter, limit],
    queryFn: async () => {
      let request = testimonialDb.from('participant_testimonials').select('*').order('created_at', { ascending: false }).limit(limit);
      if (filter !== 'all') request = request.eq('status', filter);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as PrivateTestimonial[];
    },
  });
  return <main className="page-shell max-w-6xl"><Button asChild variant="ghost"><Link to="/admin">← Back to admin</Link></Button><p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Participant stories</p><h1 className="mt-3 text-3xl font-bold">Review, verify and publish</h1><p className="mt-4 max-w-3xl leading-7 text-muted-foreground">Choose which approved stories appear on each page. Only the first featured story is given the larger card. Participant consent and chosen identity are preserved.</p><label className="mt-6 block text-sm font-medium">Review queue<select className="ml-3 rounded-md border bg-background px-3 py-2" value={filter} onChange={e => { setFilter(e.target.value); setLimit(30); }}>{['pending','approved','rejected','withdrawn','all'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>{query.isPending && <p role="status" className="mt-8">Loading review queue…</p>}{query.isError && <div role="alert" className="mt-8 rounded-2xl border p-5">The queue could not load. Check that the testimonial database migration is installed.<Button variant="outline" className="ml-3" onClick={() => void query.refetch()}>Retry</Button></div>}{query.data?.length === 0 && <p className="mt-8 rounded-2xl border p-6 text-muted-foreground">No stories in this queue yet.</p>}<div className="mt-8 space-y-6">{query.data?.map(s => <ReviewStory key={`${s.id}-${s.status}-${s.verification_notes}-${s.featured}-${s.placements.join(',')}`} record={s} />)}</div>{query.data?.length === limit && <Button className="mt-6" variant="outline" onClick={() => setLimit(current => current + 30)}>Load more</Button>}</main>;
}
