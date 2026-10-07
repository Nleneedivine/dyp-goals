import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { TestimonialCard } from '@/components/testimonials/TestimonialCard';
import { testimonialDb, type PublicTestimonial } from '@/lib/testimonials';
export default function TestimonialStory() {
  const { id } = useParams();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['public-testimonials', 'story', id],
    queryFn: async () => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '')) return null;
      const { data, error } = await testimonialDb.rpc('get_public_participant_stories', { p_id: id });
      if (error) throw error;
      return (data?.[0] ?? null) as PublicTestimonial | null;
    }, staleTime: 30_000,
  });
  return <main className="page-shell max-w-4xl"><Link className="text-sm text-primary underline" to="/testimonials">← All participant stories</Link>{isPending ? <p role="status" className="mt-10">Loading this story…</p> : isError ? <div className="mt-10"><p>We could not load this story.</p><button className="mt-3 underline" onClick={() => void refetch()}>Try again</button></div> : data ? <div className="mt-6"><TestimonialCard story={data} featured detail /></div> : <div className="mt-10 rounded-3xl border p-8"><h1 className="text-2xl font-semibold">This story is not available.</h1><p className="mt-3 text-muted-foreground">It may not have been published, or its participant may have withdrawn permission.</p></div>}</main>;
}
