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
};
export type PrivateTestimonial = Omit<PublicTestimonial, 'display_name'> & {
  user_id: string; full_name: string; name_visibility: NameVisibility;
  show_photo: boolean; publish_consent: boolean;
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
  const { data, error } = await testimonialDb.rpc('get_public_testimonials', { p_placement: placement });
  if (error) throw error;
  return (data ?? []) as PublicTestimonial[];
}
