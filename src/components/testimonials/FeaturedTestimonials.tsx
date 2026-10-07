import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { loadTestimonials, type TestimonialPlacement } from '@/lib/testimonials';
import { TestimonialCard } from './TestimonialCard';

export function FeaturedTestimonials({ placement, limit = 3, showEmpty = false }: {
  placement: TestimonialPlacement; limit?: number; showEmpty?: boolean;
}) {
  const { data: stories = [], isPending, isError, refetch } = useQuery({
    queryKey: ['public-testimonials', placement], queryFn: () => loadTestimonials(placement), staleTime: 30_000,
  });
  if (isPending) return showEmpty ? <p role="status" className="py-10 text-center text-muted-foreground">Loading participant stories…</p> : null;
  if (isError) return showEmpty ? <div className="py-10 text-center"><p>Participant stories could not load.</p><button className="mt-3 underline" onClick={() => void refetch()}>Try again</button></div> : null;
  if (!stories.length) return showEmpty ? <div className="my-10 rounded-3xl border bg-card p-8 text-center"><h2 className="text-xl font-semibold">Your story could be the first.</h2><p className="mt-3 text-muted-foreground">Stories appear after participant verification and permission to publish. We never invent social proof.</p></div> : null;
  const visible = stories.slice(0, limit);
  return (
    <section aria-label="Participant stories" className="rounded-[2rem] bg-[#f2f1e8] p-5 sm:p-8" style={{ backgroundImage: 'radial-gradient(rgba(23,60,50,0.055) 0.7px, transparent 0.7px)', backgroundSize: '7px 7px' }}>
      {placement !== 'testimonials' && <div className="mb-4 flex flex-wrap items-end justify-between gap-4 text-[#173c32]"><div><p className="text-xs font-semibold uppercase tracking-[0.18em]">Participant stories</p><h2 className="mt-2 text-2xl font-semibold">What changed after GOALS</h2></div><Link to="/testimonials" className="text-sm underline underline-offset-4">Read their stories</Link></div>}
      <div className="grid items-start gap-6 md:grid-cols-2">
        {visible.map((story, index) => <div key={story.id} className={index === 0 && story.featured ? 'md:col-span-2' : ''}><TestimonialCard story={story} featured={index === 0 && story.featured} /></div>)}
      </div>
    </section>
  );
}
