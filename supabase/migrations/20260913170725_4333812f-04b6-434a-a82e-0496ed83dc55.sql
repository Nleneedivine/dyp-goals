CREATE TABLE public.program_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 3000),
  brand text NOT NULL DEFAULT 'goals' CHECK (brand IN ('goals', 'dyp')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  opens_at timestamptz,
  closes_at timestamptz,
  submission_deadline timestamptz,
  response_limit integer CHECK (response_limit IS NULL OR response_limit > 0),
  confirmation_message text NOT NULL DEFAULT 'Thank you. Your response has been received.' CHECK (char_length(confirmation_message) <= 1000),
  confirmation_email_enabled boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  dropoff_warning_threshold numeric(5,2) NOT NULL DEFAULT 25 CHECK (dropoff_warning_threshold BETWEEN 0 AND 100),
  low_fill_threshold numeric(5,2) NOT NULL DEFAULT 15 CHECK (low_fill_threshold BETWEEN 0 AND 100),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_forms_schedule_valid CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_forms TO authenticated;
GRANT SELECT ON public.program_forms TO anon;
GRANT ALL ON public.program_forms TO service_role;
ALTER TABLE public.program_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view available forms" ON public.program_forms FOR SELECT TO anon USING (
  status = 'published'
  AND (opens_at IS NULL OR opens_at <= now())
  AND (closes_at IS NULL OR closes_at > now())
  AND (submission_deadline IS NULL OR submission_deadline > now())
);
CREATE POLICY "Signed in users can view published forms" ON public.program_forms FOR SELECT TO authenticated USING (
  status = 'published' OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
CREATE POLICY "Admins can create forms" ON public.program_forms FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role) AND created_by = auth.uid()
);
CREATE POLICY "Admins can update forms" ON public.program_forms FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete forms" ON public.program_forms FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE TABLE public.program_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.program_forms(id) ON DELETE CASCADE,
  field_type text NOT NULL CHECK (field_type IN ('text','textarea','email','phone','number','date','dropdown','multi_select','checkbox','radio','file','rating','section')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 180),
  helper_text text NOT NULL DEFAULT '' CHECK (char_length(helper_text) <= 500),
  placeholder text NOT NULL DEFAULT '' CHECK (char_length(placeholder) <= 300),
  required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditional_logic jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_form_fields TO authenticated;
GRANT SELECT ON public.program_form_fields TO anon;
GRANT ALL ON public.program_form_fields TO service_role;
ALTER TABLE public.program_form_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view fields for available forms" ON public.program_form_fields FOR SELECT TO anon USING (
  EXISTS (SELECT 1 FROM public.program_forms f WHERE f.id = form_id AND f.status = 'published' AND (f.opens_at IS NULL OR f.opens_at <= now()) AND (f.closes_at IS NULL OR f.closes_at > now()) AND (f.submission_deadline IS NULL OR f.submission_deadline > now()))
);
CREATE POLICY "Signed in users can view fields" ON public.program_form_fields FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.program_forms f WHERE f.id = form_id AND (f.status = 'published' OR public.has_role(auth.uid(), 'admin'::public.app_role)))
);
CREATE POLICY "Admins can create fields" ON public.program_form_fields FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update fields" ON public.program_form_fields FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete fields" ON public.program_form_fields FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.program_form_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.program_forms(id) ON DELETE CASCADE,
  session_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  device_type text NOT NULL DEFAULT 'unknown' CHECK (device_type IN ('mobile','tablet','desktop','unknown')),
  browser_family text NOT NULL DEFAULT 'unknown' CHECK (char_length(browser_family) <= 80),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.program_form_sessions TO authenticated;
GRANT ALL ON public.program_form_sessions TO service_role;
ALTER TABLE public.program_form_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view form sessions" ON public.program_form_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.program_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.program_forms(id) ON DELETE CASCADE,
  session_id uuid NOT NULL UNIQUE REFERENCES public.program_form_sessions(id) ON DELETE RESTRICT,
  completion_time_ms integer NOT NULL DEFAULT 0 CHECK (completion_time_ms >= 0),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.program_form_submissions TO authenticated;
GRANT ALL ON public.program_form_submissions TO service_role;
ALTER TABLE public.program_form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view submissions" ON public.program_form_submissions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete submissions" ON public.program_form_submissions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.program_form_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.program_form_submissions(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.program_form_fields(id) ON DELETE RESTRICT,
  answer jsonb NOT NULL DEFAULT 'null'::jsonb,
  first_input_delay_ms integer CHECK (first_input_delay_ms IS NULL OR first_input_delay_ms >= 0),
  active_time_ms integer CHECK (active_time_ms IS NULL OR active_time_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, field_id)
);
GRANT SELECT ON public.program_form_answers TO authenticated;
GRANT ALL ON public.program_form_answers TO service_role;
ALTER TABLE public.program_form_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view answers" ON public.program_form_answers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.program_form_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  form_id uuid NOT NULL REFERENCES public.program_forms(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.program_form_sessions(id) ON DELETE CASCADE,
  field_id uuid REFERENCES public.program_form_fields(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view','focus','first_input','change','blur','submit')),
  elapsed_ms integer NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.program_form_events TO authenticated;
GRANT ALL ON public.program_form_events TO service_role;
ALTER TABLE public.program_form_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view form events" ON public.program_form_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX program_forms_status_featured_idx ON public.program_forms(status, featured);
CREATE INDEX program_form_fields_form_order_idx ON public.program_form_fields(form_id, display_order);
CREATE INDEX program_form_sessions_form_started_idx ON public.program_form_sessions(form_id, started_at);
CREATE INDEX program_form_submissions_form_submitted_idx ON public.program_form_submissions(form_id, submitted_at);
CREATE INDEX program_form_answers_submission_idx ON public.program_form_answers(submission_id);
CREATE INDEX program_form_events_session_created_idx ON public.program_form_events(session_id, created_at);
CREATE INDEX program_form_events_form_field_type_idx ON public.program_form_events(form_id, field_id, event_type);

CREATE TRIGGER update_program_forms_updated_at BEFORE UPDATE ON public.program_forms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_program_form_fields_updated_at BEFORE UPDATE ON public.program_form_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();