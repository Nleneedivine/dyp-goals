-- Drop existing problematic policies
DROP POLICY IF EXISTS "Group admins can add members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Group admins can remove members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Users can view members of their groups" ON public.chat_group_members;
DROP POLICY IF EXISTS "Group admins can update groups" ON public.chat_groups;
DROP POLICY IF EXISTS "Users can view groups they are members of" ON public.chat_groups;

-- Create security definer function to check if user is member of a chat group
CREATE OR REPLACE FUNCTION public.is_chat_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members
    WHERE user_id = _user_id
      AND group_id = _group_id
  )
$$;

-- Create security definer function to check if user is admin of a chat group
CREATE OR REPLACE FUNCTION public.is_chat_group_admin(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members
    WHERE user_id = _user_id
      AND group_id = _group_id
      AND role = 'admin'
  )
$$;

-- Create security definer function to get user's chat group IDs
CREATE OR REPLACE FUNCTION public.get_user_chat_group_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT group_id
  FROM public.chat_group_members
  WHERE user_id = _user_id
$$;

-- Create security definer function to check if user is chat group creator
CREATE OR REPLACE FUNCTION public.is_chat_group_creator(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_groups
    WHERE id = _group_id
      AND created_by = _user_id
  )
$$;

-- Recreate policies using security definer functions
CREATE POLICY "Users can view groups they are members of" 
ON public.chat_groups 
FOR SELECT 
USING (
  id IN (SELECT public.get_user_chat_group_ids(auth.uid()))
  OR created_by = auth.uid()
);

CREATE POLICY "Group admins can update groups" 
ON public.chat_groups 
FOR UPDATE 
USING (
  public.is_chat_group_admin(auth.uid(), id)
  OR created_by = auth.uid()
);

CREATE POLICY "Users can view members of their groups" 
ON public.chat_group_members 
FOR SELECT 
USING (
  public.is_chat_group_member(auth.uid(), group_id)
);

CREATE POLICY "Group admins can add members" 
ON public.chat_group_members 
FOR INSERT 
WITH CHECK (
  public.is_chat_group_admin(auth.uid(), group_id)
  OR public.is_chat_group_creator(auth.uid(), group_id)
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Group admins can remove members" 
ON public.chat_group_members 
FOR DELETE 
USING (
  public.is_chat_group_admin(auth.uid(), group_id)
  OR user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);