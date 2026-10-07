import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// Scoped client for the new schema until the generated database types are refreshed.
export const testimonialDb: SupabaseClient = supabase;
export const testimonialPlacements = ['testimonials', 'home', 'registration', 'campaign'] as const;
export type TestimonialPlacement = typeof testimonialPlacements[number];
export type NameVisibility = 'full' | 'initial' | 'first';
export type PublicTestimonial = {
  id: string; display_name: string; participant_year: number; quote: string;
  story: string; photo_path: string | null; verified: boolean; featured: boolean;
  presentation?: 'quote' | 'photo' | 'video'; media_path?: string | null;
  media_type?: 'image' | 'video' | null; media_description?: string;
  caption_path?: string | null; video_transcript?: string;
};
export type PrivateTestimonial = Omit<PublicTestimonial, 'display_name'> & {
  user_id: string; full_name: string; name_visibility: NameVisibility;
  show_photo: boolean; publish_consent: boolean; media_consent?: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  verification_notes: string; placements: TestimonialPlacement[]; created_at: string;
};
export function displayName(name: string, visibility: NameVisibility) {
  const parts = name.trim().split(/\s+/);
  if (visibility === 'first') return parts[0] || 'Your name';
  if (visibility === 'initial') return parts[0] + (parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : '');
  return name.trim() || 'Your name';
}
export async function loadTestimonials(placement: TestimonialPlacement) {
  const { data, error } = await testimonialDb.rpc('get_public_participant_stories', { p_placement: placement });
  if (error) throw error;
  return (data ?? []) as PublicTestimonial[];
}

export async function recordStoryEvent(id: string, event: 'view' | 'video_play' | 'share_action') {
  try {
    let session = sessionStorage.getItem('dyp-story-session');
    if (!session) { session = crypto.randomUUID(); sessionStorage.setItem('dyp-story-session', session); }
    const key = `dyp-story-event:${id}:${event}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const { error } = await testimonialDb.rpc('record_testimonial_engagement', { p_id: id, p_session: session, p_event: event });
    if (error) sessionStorage.removeItem(key);
  } catch { /* Analytics never block reading or sharing. */ }
}
