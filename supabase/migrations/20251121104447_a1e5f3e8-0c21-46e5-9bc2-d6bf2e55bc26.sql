-- Fix function search path security issue by recreating with proper search_path
DROP TRIGGER IF EXISTS update_goal_analyses_timestamp ON public.goal_analyses;
DROP FUNCTION IF EXISTS public.update_goal_analyses_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION public.update_goal_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_goal_analyses_timestamp
BEFORE UPDATE ON public.goal_analyses
FOR EACH ROW
EXECUTE FUNCTION public.update_goal_analyses_updated_at();