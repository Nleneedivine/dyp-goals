-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view all messages" ON public.chat_messages;

-- Create a new policy that restricts message visibility to group members only
CREATE POLICY "Users can view messages in their groups"
ON public.chat_messages
FOR SELECT
USING (
  -- User can see messages in groups they are a member of
  is_chat_group_member(auth.uid(), group_id)
  -- Or user can see their own messages (for direct messages or orphaned messages)
  OR user_id = auth.uid()
);