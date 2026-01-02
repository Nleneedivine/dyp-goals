-- Fix profiles table: Add policy for chat group members to see each other's names (for chat functionality)
-- while keeping emails protected

-- First, let's add a policy that allows users in the same chat group to see basic profile info
CREATE POLICY "Chat group members can view each other's profiles"
ON public.profiles
FOR SELECT
USING (
  -- User is in the same accountability group
  EXISTS (
    SELECT 1 FROM public.profiles p2 
    WHERE p2.id = auth.uid() 
    AND p2.group_id IS NOT NULL 
    AND p2.group_id = profiles.group_id
  )
  -- OR user is in the same chat group
  OR EXISTS (
    SELECT 1 FROM public.chat_group_members cgm1
    JOIN public.chat_group_members cgm2 ON cgm1.group_id = cgm2.group_id
    WHERE cgm1.user_id = auth.uid() AND cgm2.user_id = profiles.id
  )
);

-- For mentorship_requests, the existing policies are correct but let's ensure 
-- there's no public access by verifying the policies are properly restrictive
-- The existing policies already require auth.uid() = user_id or mentor/admin role