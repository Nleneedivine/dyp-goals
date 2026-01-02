-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Chat group members can view each other's profiles" ON public.profiles;

-- Create a security definer function to check if users share a group (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.users_share_group(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Same accountability group
    SELECT 1 FROM public.profiles p1
    JOIN public.profiles p2 ON p1.group_id = p2.group_id
    WHERE p1.id = _viewer_id 
    AND p2.id = _profile_id
    AND p1.group_id IS NOT NULL
  )
  OR EXISTS (
    -- Same chat group
    SELECT 1 FROM public.chat_group_members cgm1
    JOIN public.chat_group_members cgm2 ON cgm1.group_id = cgm2.group_id
    WHERE cgm1.user_id = _viewer_id AND cgm2.user_id = _profile_id
  )
$$;

-- Recreate the policy using the security definer function
CREATE POLICY "Chat group members can view each other's profiles"
ON public.profiles
FOR SELECT
USING (
  users_share_group(auth.uid(), id)
);