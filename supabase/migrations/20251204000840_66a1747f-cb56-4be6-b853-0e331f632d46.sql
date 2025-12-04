-- Add read_at to track read receipts
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS read_at timestamp with time zone;

-- Add message reactions table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions on visible messages" 
ON public.message_reactions FOR SELECT 
USING (true);

CREATE POLICY "Users can add their own reactions" 
ON public.message_reactions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own reactions" 
ON public.message_reactions FOR DELETE 
USING (auth.uid() = user_id);

-- Add groups/channels table for future group chat
CREATE TABLE IF NOT EXISTS public.chat_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  avatar_url text,
  created_by uuid NOT NULL,
  is_channel boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

-- Group members table
CREATE TABLE IF NOT EXISTS public.chat_group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

-- Add group_id to chat_messages for group messaging
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE;

-- Update chat_messages to support replies and media
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- RLS for chat_groups
CREATE POLICY "Users can view groups they are members of" 
ON public.chat_groups FOR SELECT 
USING (
  id IN (SELECT group_id FROM public.chat_group_members WHERE user_id = auth.uid())
  OR created_by = auth.uid()
);

CREATE POLICY "Users can create groups" 
ON public.chat_groups FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins can update groups" 
ON public.chat_groups FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.chat_group_members 
    WHERE group_id = id AND user_id = auth.uid() AND role = 'admin'
  )
);

-- RLS for chat_group_members
CREATE POLICY "Users can view members of their groups" 
ON public.chat_group_members FOR SELECT 
USING (
  group_id IN (SELECT group_id FROM public.chat_group_members WHERE user_id = auth.uid())
);

CREATE POLICY "Group admins can add members" 
ON public.chat_group_members FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_group_members 
    WHERE group_id = chat_group_members.group_id AND user_id = auth.uid() AND role = 'admin'
  )
  OR (
    SELECT created_by FROM public.chat_groups WHERE id = group_id
  ) = auth.uid()
);

CREATE POLICY "Group admins can remove members" 
ON public.chat_group_members FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.chat_group_members cgm
    WHERE cgm.group_id = chat_group_members.group_id AND cgm.user_id = auth.uid() AND cgm.role = 'admin'
  )
  OR user_id = auth.uid()
);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_members;