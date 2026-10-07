import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Quote, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { PublicTestimonial } from '@/lib/testimonials';

export function TestimonialCard({ story, featured = false, preview = false, previewPortrait = null }: {
  story: PublicTestimonial; featured?: boolean; preview?: boolean; previewPortrait?: string | null;
}) {
  const { data: portrait } = useQuery({
    queryKey: ['testimonial-portrait', story.photo_path],
    enabled: Boolean(story.photo_path) && !preview,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('testimonial-portraits').createSignedUrl(story.photo_path!, 60);
      if (error) return null;
      return data.signedUrl;
    }, staleTime: 30_000, refetchInterval: 45_000,
  });
  const portraitSource = preview ? previewPortrait : portrait;
  return (
    <article className={`relative mt-10 rounded-[1.75rem] border border-[#e4e3d8] bg-[#fffef9] px-6 pb-7 pt-14 text-[#173c32] shadow-[0_14px_45px_-25px_rgba(23,60,50,0.35)] ${featured ? 'md:px-10 md:pb-10 md:pt-16' : ''}`}>
      <div className="absolute -top-9 left-6 flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-2xl border-[5px] border-[#fffef9] bg-[#e8eddf] shadow-sm md:left-10">
        {portraitSource ? <img src={portraitSource} alt={`Portrait of ${story.display_name}`} className="h-full w-full object-cover" loading="lazy" /> : <UserRound className="h-7 w-7 text-[#577165]" aria-hidden="true" />}
      </div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="h-1 w-12 rounded-full bg-[#C8F31D]" aria-hidden="true" />
        {preview ? <span className="text-xs font-medium">Private preview</span> : story.verified && <span className="flex items-center gap-1.5 text-xs font-medium"><BadgeCheck className="h-4 w-4" />Verified participant</span>}
      </div>
      <Quote className="mb-3 h-6 w-6 text-[#789314]" aria-hidden="true" />
      <blockquote className={`break-words font-serif font-medium leading-[1.28] tracking-tight ${featured ? 'text-3xl md:text-4xl' : 'text-2xl'}`}>“{story.quote}”</blockquote>
      <div className="mt-6">
        <p className="font-semibold">{story.display_name}</p>
        <p className="mt-1 text-xs text-[#52665d]">GOALS {story.participant_year} Participant</p>
      </div>
      {story.story && <p className="mt-5 whitespace-pre-line break-words border-t border-[#e4e3d8] pt-5 text-sm leading-7 text-[#52665d]">{story.story}</p>}
    </article>
  );
}
