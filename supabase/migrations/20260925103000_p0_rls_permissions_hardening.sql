-- P0 security hardening pass: RLS, grants and SECURITY DEFINER RPC boundaries.
-- This migration is intentionally additive/corrective so existing environments can apply it safely.

-- ---------------------------------------------------------------------------
-- Base table grants: RLS is only useful when direct privileges are intentional.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.goal_analyses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.goal_analyses TO authenticated;
GRANT ALL ON TABLE public.goal_analyses TO service_role;

REVOKE ALL ON TABLE public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

REVOKE ALL ON TABLE public.user_roles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

REVOKE ALL ON TABLE public.chat_messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;

REVOKE ALL ON TABLE public.message_reactions FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.message_reactions TO authenticated;
GRANT ALL ON TABLE public.message_reactions TO service_role;

REVOKE ALL ON TABLE public.chat_groups FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_groups TO authenticated;
GRANT ALL ON TABLE public.chat_groups TO service_role;

REVOKE ALL ON TABLE public.chat_group_members FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.chat_group_members TO authenticated;
GRANT ALL ON TABLE public.chat_group_members TO service_role;

REVOKE ALL ON TABLE public.time_plans FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.time_plans TO authenticated;
GRANT ALL ON TABLE public.time_plans TO service_role;

-- ---------------------------------------------------------------------------
-- User-owned records: prevent ownership columns from being reassigned on update.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own goals" ON public.goal_analyses;
CREATE POLICY "Users can update their own goals"
ON public.goal_analyses
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own time plans" ON public.time_plans;
CREATE POLICY "Users can update their own time plans"
ON public.time_plans
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Chat: messages and reactions must only be visible/actionable inside groups
-- the authenticated user belongs to (or for their own legacy/orphaned message).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own messages" ON public.chat_messages;
CREATE POLICY "Users can insert messages in their groups"
ON public.chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    group_id IS NULL
    OR public.is_chat_group_member(auth.uid(), group_id)
    OR public.is_chat_group_creator(auth.uid(), group_id)
  )
);

DROP POLICY IF EXISTS "Users can delete their own messages" ON public.chat_messages;
CREATE POLICY "Users can delete their own messages"
ON public.chat_messages
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view reactions on visible messages" ON public.message_reactions;
CREATE POLICY "Users can view reactions on visible messages"
ON public.message_reactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_messages m
    WHERE m.id = message_id
      AND (
        m.user_id = auth.uid()
        OR public.is_chat_group_member(auth.uid(), m.group_id)
      )
  )
);

DROP POLICY IF EXISTS "Users can add their own reactions" ON public.message_reactions;
CREATE POLICY "Users can add their own reactions"
ON public.message_reactions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.chat_messages m
    WHERE m.id = message_id
      AND (
        m.user_id = auth.uid()
        OR public.is_chat_group_member(auth.uid(), m.group_id)
      )
  )
);

-- A creator must remain able to manage a newly-created group before membership
-- rows are established. Admins retain operational access.
DROP POLICY IF EXISTS "Group admins can update groups" ON public.chat_groups;
CREATE POLICY "Group admins can update groups"
ON public.chat_groups
FOR UPDATE TO authenticated
USING (
  public.is_chat_group_admin(auth.uid(), id)
  OR created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  public.is_chat_group_admin(auth.uid(), id)
  OR created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Users can create groups" ON public.chat_groups;
CREATE POLICY "Users can create groups"
ON public.chat_groups
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER functions: callers must not be able to ask questions about
-- arbitrary users. Policies can still call these functions with auth.uid().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN _user_id = auth.uid() OR auth.role() = 'service_role' THEN (
      SELECT role
      FROM public.user_roles
      WHERE user_id = _user_id
      ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'mentor' THEN 2 ELSE 3 END
      LIMIT 1
    )
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.is_chat_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1 FROM public.chat_group_members
      WHERE user_id = _user_id AND group_id = _group_id
    )
$$;

CREATE OR REPLACE FUNCTION public.is_chat_group_admin(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1 FROM public.chat_group_members
      WHERE user_id = _user_id AND group_id = _group_id AND role = 'admin'
    )
$$;

CREATE OR REPLACE FUNCTION public.is_chat_group_creator(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1 FROM public.chat_groups
      WHERE id = _group_id AND created_by = _user_id
    )
$$;

CREATE OR REPLACE FUNCTION public.get_user_chat_group_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT group_id
  FROM public.chat_group_members
  WHERE user_id = _user_id
    AND (_user_id = auth.uid() OR auth.role() = 'service_role')
$$;

CREATE OR REPLACE FUNCTION public.users_share_group(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (_viewer_id = auth.uid() OR auth.role() = 'service_role')
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p1
        JOIN public.profiles p2 ON p1.group_id = p2.group_id
        WHERE p1.id = _viewer_id
          AND p2.id = _profile_id
          AND p1.group_id IS NOT NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.chat_group_members cgm1
        JOIN public.chat_group_members cgm2 ON cgm1.group_id = cgm2.group_id
        WHERE cgm1.user_id = _viewer_id
          AND cgm2.user_id = _profile_id
      )
    )
$$;

-- Do not expose trigger functions as callable RPCs.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_goal_analyses_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_goal_analyses_updated_at() TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Restrict helper RPCs to authenticated users/service role. The functions above
-- additionally bind user-id parameters to the caller.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_chat_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_chat_group_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_chat_group_creator(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_chat_group_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.users_share_group(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_chat_group_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_chat_group_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_chat_group_creator(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_chat_group_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.users_share_group(uuid, uuid) TO authenticated, service_role;

-- Public program configuration is read-only. All mutation remains service-role
-- controlled until an explicit admin editor is introduced.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.program_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.program_events TO anon, authenticated;
GRANT ALL ON TABLE public.program_events TO service_role;

-- Form response data is never directly writable by browser roles; public writes
-- continue through the validated Edge Function using service-role credentials.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.program_form_sessions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.program_form_submissions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.program_form_answers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.program_form_events FROM anon, authenticated;
