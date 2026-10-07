import { useEffect, useRef } from 'react';
import { StoryShare } from './StoryShare';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Quote, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { recordStoryEvent, type PublicTestimonial } from '@/lib/testimonials';

export function TestimonialCard({ story, featured = false, preview = false, previewPortrait = null, publicStory = true, detail = false }: {
  story: PublicTestimonial; featured?: boolean; preview?: boolean; previewPortrait?: string | null; publicStory?: boolean; detail?: boolean;
}) {
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (preview || !publicStory || !articleRef.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(entries => {
      clearTimeout(timer);
      if ((entries[0]?.intersectionRatio ?? 0) >= 0.1) timer = setTimeout(() => { void recordStoryEvent(story.id, 'view'); observer.disconnect(); }, 1000);
    }, { threshold: 0.1 });
    observer.observe(articleRef.current);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [preview, publicStory, story.id]);
  const { data: media } = useQuery({
    queryKey: ['testimonial-media', story.media_path, story.caption_path], enabled: Boolean(story.media_path) && story.presentation !== 'quote' && !preview,
    queryFn: async () => {
      const paths = [story.media_path!, ...(story.caption_path ? [story.caption_path] : [])];
      const { data, error } = await supabase.storage.from('testimonial-media').createSignedUrls(paths, 900);
      if (error) return null;
      return { url: data?.[0]?.signedUrl, captions: data?.[1]?.signedUrl };
    }, staleTime: 600_000,
  });
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
    <article ref={articleRef} className={`relative mt-10 rounded-[1.75rem] border border-[#e4e3d8] bg-[#fffef9] px-6 pb-7 pt-14 text-[#173c32] shadow-[0_14px_45px_-25px_rgba(23,60,50,0.35)] ${featured ? 'md:px-10 md:pb-10 md:pt-16' : ''}`}>
      <div className="absolute -top-9 left-6 flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-2xl border-[5px] border-[#fffef9] bg-[#e8eddf] shadow-sm md:left-10">
        {portraitSource ? <img src={portraitSource} alt={`Portrait of ${story.display_name}`} className="h-full w-full object-cover" loading="lazy" /> : <UserRound className="h-7 w-7 text-[#577165]" aria-hidden="true" />}
      </div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="h-1 w-12 rounded-full bg-[#C8F31D]" aria-hidden="true" />
        {preview ? <span className="text-xs font-medium">Private preview</span> : story.verified && <span className="flex items-center gap-1.5 text-xs font-medium"><BadgeCheck className="h-4 w-4" />Verified participant</span>}
      </div>
      {story.presentation === 'photo' && (media?.url || portraitSource) && <img src={media?.url || portraitSource} alt={story.media_description || `Story image from ${story.display_name}`} className="mb-7 max-h-[32rem] w-full rounded-2xl object-cover" loading="lazy" />}
      {story.presentation === 'video' && media?.url && <div className="mb-7"><video key={story.media_path} className="aspect-video max-h-[32rem] w-full rounded-2xl bg-[#173c32] object-contain" controls playsInline preload="none" poster={portraitSource || undefined} crossOrigin="anonymous" aria-label={`${story.display_name}'s video story`} onPlay={() => { if (!preview && publicStory) void recordStoryEvent(story.id, 'video_play'); }}><source src={media.url} type={story.media_path?.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />{media.captions && <track kind="captions" src={media.captions} srcLang="en" label="English" default />}Your browser does not support this video.</video><p className="mt-2 text-xs text-[#52665d]">Press play to watch. Captions available.</p>{story.video_transcript && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Read video transcript</summary><p className="mt-3 whitespace-pre-line leading-7">{story.video_transcript}</p></details>}</div>}
      {!preview && story.presentation && story.presentation !== 'quote' && story.media_path && !media?.url && <p role="status" className="mb-5 text-sm">Story media is loading. You can read the story below.</p>}
      <Quote className="mb-3 h-6 w-6 text-[#789314]" aria-hidden="true" />
      <blockquote className={`break-words font-serif font-medium leading-[1.28] tracking-tight ${featured ? 'text-3xl md:text-4xl' : 'text-2xl'}`}>“{story.quote}”</blockquote>
      <div className="mt-6">
        <p className="font-semibold">{story.display_name}</p>
        <p className="mt-1 text-xs text-[#52665d]">GOALS {story.participant_year} Participant</p>
      </div>
      {story.story && <p className="mt-5 whitespace-pre-line break-words border-t border-[#e4e3d8] pt-5 text-sm leading-7 text-[#52665d]">{story.story}</p>}
      {!preview && publicStory && <StoryShare story={story} detail={detail} />}
    </article>
  );
}
