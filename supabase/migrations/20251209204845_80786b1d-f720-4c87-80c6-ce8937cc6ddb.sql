-- Create function to update timestamps if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table for storing time plans
CREATE TABLE public.time_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  goal TEXT NOT NULL,
  questionnaire_data JSONB NOT NULL DEFAULT '{}',
  yearly_plan JSONB,
  monthly_plan JSONB,
  weekly_plan JSONB,
  daily_plan JSONB,
  status TEXT NOT NULL DEFAULT 'questionnaire',
  current_step INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.time_plans ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own time plans" 
ON public.time_plans 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own time plans" 
ON public.time_plans 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own time plans" 
ON public.time_plans 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own time plans" 
ON public.time_plans 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_time_plans_updated_at
BEFORE UPDATE ON public.time_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();