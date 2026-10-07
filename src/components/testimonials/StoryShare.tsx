import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Share2 } from 'lucide-react';
import { recordStoryEvent, type PublicTestimonial } from '@/lib/testimonials';

export function StoryShare({ story, detail = false }: { story: PublicTestimonial; detail?: boolean }) {
  const [message, setMessage] = useState('');
  const url = `${window.location.origin}/testimonials/${story.id}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage('Story link copied.'); void recordStoryEvent(story.id, 'share_action'); }
    catch { setMessage('Copy this story link from your browser address bar.'); }
  };
  const share = async () => {
    if (!navigator.share) return copy();
    try { await navigator.share({ title: `${story.display_name}'s GOALS story`, text: story.quote, url }); void recordStoryEvent(story.id, 'share_action'); }
    catch (cause) { if ((cause as Error)?.name !== 'AbortError') setMessage('Sharing could not open. Try copying the link.'); }
  };
  return <div className="mt-6 border-t border-[#e4e3d8] pt-4 text-xs"><div className="flex flex-wrap items-center gap-4">{!detail && <Link className="mr-auto font-semibold underline underline-offset-4" to={`/testimonials/${story.id}`}>Read full story</Link>}<button className="flex min-h-10 items-center gap-1.5" onClick={() => void share()}><Share2 className="h-4 w-4" />Share</button><a className="flex min-h-10 items-center" href={`https://wa.me/?text=${encodeURIComponent(`${story.quote}\n${url}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => void recordStoryEvent(story.id,'share_action')}>WhatsApp</a><button className="flex min-h-10 items-center gap-1.5" onClick={() => void copy()}><Copy className="h-4 w-4" />Copy link</button></div>{message && <p role="status" className="mt-2">{message}</p>}</div>;
}
