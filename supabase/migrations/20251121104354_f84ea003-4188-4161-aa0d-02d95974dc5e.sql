-- Create table to store goal analyses for AI learning
CREATE TABLE IF NOT EXISTS public.goal_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_goals TEXT NOT NULL,
  ai_analysis JSONB NOT NULL,
  user_responses JSONB,
  refined_goals TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.goal_analyses ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public feature)
CREATE POLICY "Anyone can submit goals for analysis"
ON public.goal_analyses
FOR INSERT
WITH CHECK (true);

-- Allow anyone to read their own analyses
CREATE POLICY "Users can view analyses"
ON public.goal_analyses
FOR SELECT
USING (true);

-- Allow anyone to update their responses
CREATE POLICY "Anyone can update their responses"
ON public.goal_analyses
FOR UPDATE
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_goal_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_goal_analyses_timestamp
BEFORE UPDATE ON public.goal_analyses
FOR EACH ROW
EXECUTE FUNCTION public.update_goal_analyses_updated_at();