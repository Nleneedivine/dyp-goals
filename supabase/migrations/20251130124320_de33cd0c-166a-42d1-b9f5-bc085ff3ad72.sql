-- Add mentor role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'mentor';

-- Create accountability_groups table
CREATE TABLE public.accountability_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  mentor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Add group_id to profiles table
ALTER TABLE public.profiles
ADD COLUMN group_id uuid REFERENCES public.accountability_groups(id) ON DELETE SET NULL;

-- Enable RLS on accountability_groups
ALTER TABLE public.accountability_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accountability_groups
CREATE POLICY "Users can view their own group"
  ON public.accountability_groups FOR SELECT
  USING (
    id IN (SELECT group_id FROM public.profiles WHERE id = auth.uid())
    OR mentor_id = auth.uid()
  );

CREATE POLICY "Admins can view all groups"
  ON public.accountability_groups FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage groups"
  ON public.accountability_groups FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Create function to get next group name
CREATE OR REPLACE FUNCTION public.get_next_group_name()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  group_count integer;
  alphabet text[] := ARRAY['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA', 'ETA', 'THETA', 'IOTA', 'KAPPA', 'LAMBDA', 'MU', 'NU', 'XI', 'OMICRON', 'PI', 'RHO', 'SIGMA', 'TAU', 'UPSILON', 'PHI', 'CHI', 'PSI', 'OMEGA'];
BEGIN
  SELECT COUNT(*) INTO group_count FROM public.accountability_groups;
  
  IF group_count < 24 THEN
    RETURN 'GOALS-' || alphabet[group_count + 1];
  ELSE
    RETURN 'GOALS-' || (group_count + 1)::text;
  END IF;
END;
$$;

-- Create function to assign user to group (called when submitting goals)
CREATE OR REPLACE FUNCTION public.assign_user_to_group(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  available_group_id uuid;
  new_group_id uuid;
  new_group_name text;
  is_mentor boolean;
  available_mentor_id uuid;
BEGIN
  -- Check if user already has a group
  SELECT group_id INTO available_group_id
  FROM public.profiles
  WHERE id = _user_id;
  
  IF available_group_id IS NOT NULL THEN
    RETURN available_group_id;
  END IF;
  
  -- Check if user is a mentor
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = 'mentor'
  ) INTO is_mentor;
  
  IF is_mentor THEN
    -- Find a group without a mentor
    SELECT id INTO available_group_id
    FROM public.accountability_groups
    WHERE mentor_id IS NULL
    LIMIT 1;
    
    -- If no group without mentor, create new group and assign as mentor
    IF available_group_id IS NULL THEN
      new_group_name := public.get_next_group_name();
      
      INSERT INTO public.accountability_groups (name, mentor_id)
      VALUES (new_group_name, _user_id)
      RETURNING id INTO new_group_id;
      
      available_group_id := new_group_id;
    ELSE
      -- Assign mentor to existing group
      UPDATE public.accountability_groups
      SET mentor_id = _user_id
      WHERE id = available_group_id;
    END IF;
  ELSE
    -- Regular member: find group with <5 members and has mentor
    SELECT ag.id INTO available_group_id
    FROM public.accountability_groups ag
    LEFT JOIN public.profiles p ON p.group_id = ag.id AND p.id != ag.mentor_id
    WHERE ag.mentor_id IS NOT NULL
    GROUP BY ag.id
    HAVING COUNT(p.id) < 5
    LIMIT 1;
    
    -- If no available group with mentor, create new group
    IF available_group_id IS NULL THEN
      new_group_name := public.get_next_group_name();
      
      INSERT INTO public.accountability_groups (name)
      VALUES (new_group_name)
      RETURNING id INTO new_group_id;
      
      available_group_id := new_group_id;
    END IF;
  END IF;
  
  -- Assign user to group
  UPDATE public.profiles
  SET group_id = available_group_id
  WHERE id = _user_id;
  
  RETURN available_group_id;
END;
$$;