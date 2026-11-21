-- Applications & Admissions + Applicant Portal (additive).

CREATE TABLE public.program_admission_decisions (
  submission_id uuid PRIMARY KEY REFERENCES public.program_form_submissions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','admitted','rejected')),
  grandfathered boolean NOT NULL DEFAULT false,
  decided_by uuid,
  decided_at timestamptz,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.program_admission_decisions IS 'Admission decision, separate from funding verification. Rows exist only for applications submitted after go-live (pending) and grandfathered active/completed participants (admitted, grandfathered=true).';

CREATE TABLE public.program_applicant_portal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.program_form_submissions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('applicant','admin')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  shared_marked_at timestamptz,
  shared_marked_by uuid
);
CREATE INDEX program_applicant_portal_links_submission_idx ON public.program_applicant_portal_links(submission_id, created_at DESC);
COMMENT ON TABLE public.program_applicant_portal_links IS 'Applicant portal links. Only a SHA-256 hash of the random token is stored. shared_marked_at is a manual admin note, not proof of delivery.';

CREATE TABLE public.program_application_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.program_form_submissions(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX program_application_audit_events_submission_idx ON public.program_application_audit_events(submission_id, created_at DESC);

GRANT SELECT ON public.program_admission_decisions TO authenticated;
GRANT SELECT ON public.program_applicant_portal_links TO authenticated;
GRANT SELECT ON public.program_application_audit_events TO authenticated;
GRANT ALL ON public.program_admission_decisions TO service_role;
GRANT ALL ON public.program_applicant_portal_links TO service_role;
GRANT ALL ON public.program_application_audit_events TO service_role;

ALTER TABLE public.program_admission_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_applicant_portal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_application_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admission decisions" ON public.program_admission_decisions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read portal link metadata" ON public.program_applicant_portal_links
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read application audit" ON public.program_application_audit_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Grandfather currently active/completed participants as admitted (new table only; no historical rows changed).
INSERT INTO public.program_admission_decisions (submission_id, status, grandfathered, decided_at, reason)
SELECT DISTINCT e.source_submission_id, 'admitted', true, now(), 'Grandfathered: participant was already active before admissions went live'
FROM public.program_enrollments e
WHERE e.source_submission_id IS NOT NULL AND e.status IN ('active','completed')
ON CONFLICT (submission_id) DO NOTHING;

-- New submissions after go-live start in pending admission.
CREATE OR REPLACE FUNCTION public.create_pending_admission_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.program_admission_decisions (submission_id, status) VALUES (NEW.id, 'pending')
  ON CONFLICT (submission_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.create_pending_admission_decision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER program_form_submissions_pending_admission
  AFTER INSERT ON public.program_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.create_pending_admission_decision();

-- Helpers
CREATE OR REPLACE FUNCTION public.portal_request_ip()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(nullif(trim(split_part(coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip'),
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ''), ',', 1)), ''), 'unknown')
$$;

CREATE OR REPLACE FUNCTION public.portal_token_hash(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.application_recovery_status(p_submission_id uuid)
RETURNS TABLE(eligible boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.program_form_submissions;
  v_completed timestamptz;
  v_pay public.program_payments;
  v_claim public.program_sponsorship_claims;
  v_enr_status text;
  v_has_settings boolean;
BEGIN
  SELECT * INTO v_sub FROM public.program_form_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Application not found'; RETURN; END IF;
  SELECT completed_at INTO v_completed FROM public.program_form_sessions WHERE id = v_sub.session_id;
  SELECT * INTO v_pay FROM public.program_payments WHERE submission_id = p_submission_id;
  SELECT * INTO v_claim FROM public.program_sponsorship_claims WHERE submission_id = p_submission_id ORDER BY created_at DESC LIMIT 1;
  SELECT status INTO v_enr_status FROM public.program_enrollments WHERE source_submission_id = p_submission_id ORDER BY created_at LIMIT 1;
  SELECT EXISTS (SELECT 1 FROM public.program_payment_settings WHERE form_id = v_sub.form_id) INTO v_has_settings;

  IF v_claim.status = 'approved' THEN RETURN QUERY SELECT false, 'Sponsorship already approved'; RETURN; END IF;
  IF v_pay.status = 'paid' THEN RETURN QUERY SELECT false, 'Already paid'; RETURN; END IF;
  IF v_enr_status IN ('active','completed') THEN RETURN QUERY SELECT false, 'Already has programme access (legacy) — not treated as unpaid'; RETURN; END IF;
  IF v_enr_status IS NOT NULL AND v_enr_status NOT IN ('payment_pending','registered') THEN RETURN QUERY SELECT false, 'Enrollment status is ' || v_enr_status; RETURN; END IF;
  IF v_completed IS NULL THEN RETURN QUERY SELECT false, 'Registration session was never finalised — review manually'; RETURN; END IF;
  IF NOT v_has_settings THEN RETURN QUERY SELECT false, 'No payment settings for this form'; RETURN; END IF;
  IF v_claim.status = 'pending' THEN RETURN QUERY SELECT false, 'Sponsorship claim awaiting review'; RETURN; END IF;
  IF v_pay.status = 'pending' AND v_pay.proof_path IS NOT NULL THEN RETURN QUERY SELECT false, 'Payment proof awaiting verification'; RETURN; END IF;
  IF v_pay.status = 'rejected' THEN RETURN QUERY SELECT true, 'Payment was rejected — applicant needs to correct it'; RETURN; END IF;
  IF v_pay.status = 'pending' THEN RETURN QUERY SELECT true, 'Payment started but never completed'; RETURN; END IF;
  IF v_claim.status IN ('rejected','revoked') THEN RETURN QUERY SELECT true, 'Sponsorship not approved — applicant can self-fund'; RETURN; END IF;
  IF v_pay.submission_id IS NULL THEN RETURN QUERY SELECT true, 'Application submitted, payment never started'; RETURN; END IF;
  RETURN QUERY SELECT false, 'Needs manual review';
END $$;
REVOKE ALL ON FUNCTION public.application_recovery_status(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_portal_link_internal(p_submission_id uuid, p_source text, p_actor uuid, p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires timestamptz := now() + make_interval(days => p_days);
  v_id uuid;
BEGIN
  INSERT INTO public.program_applicant_portal_links (submission_id, token_hash, source, created_by, expires_at)
  VALUES (p_submission_id, public.portal_token_hash(v_token), p_source, p_actor, v_expires)
  RETURNING id INTO v_id;
  INSERT INTO public.program_application_audit_events (submission_id, actor_id, action, details)
  VALUES (p_submission_id, p_actor, 'portal_link_created', jsonb_build_object('linkId', v_id, 'source', p_source, 'expiresAt', v_expires));
  RETURN jsonb_build_object('token', v_token, 'linkId', v_id, 'expiresAt', v_expires);
END $$;
REVOKE ALL ON FUNCTION public.issue_portal_link_internal(uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;

-- Applicant: issue own portal link using the existing completed form session credential.
CREATE OR REPLACE FUNCTION public.issue_applicant_portal_link(p_session_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub_id uuid;
  v_ok boolean;
BEGIN
  SELECT allowed INTO v_ok FROM public.consume_edge_rate_limit('portal-issue-ip:' || public.portal_request_ip(), 20, 3600);
  IF NOT v_ok THEN RAISE EXCEPTION 'Too many requests. Please try again later.'; END IF;
  SELECT sub.id INTO v_sub_id
  FROM public.program_form_sessions s JOIN public.program_form_submissions sub ON sub.session_id = s.id
  WHERE s.session_token = p_session_token AND s.completed_at IS NOT NULL LIMIT 1;
  IF v_sub_id IS NULL THEN RAISE EXCEPTION 'Application not found.'; END IF;
  SELECT allowed INTO v_ok FROM public.consume_edge_rate_limit('portal-issue-sub:' || v_sub_id, 5, 86400);
  IF NOT v_ok THEN RAISE EXCEPTION 'Too many portal links were requested today. Please use a link you already have.'; END IF;
  RETURN public.issue_portal_link_internal(v_sub_id, 'applicant', NULL, 180) - 'linkId';
END $$;
REVOKE ALL ON FUNCTION public.issue_applicant_portal_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_applicant_portal_link(uuid) TO anon, authenticated;

-- Applicant: open portal. Generic response for any invalid/expired/revoked token.
CREATE OR REPLACE FUNCTION public.get_applicant_portal(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ok boolean;
  v_link public.program_applicant_portal_links;
  v_sub public.program_form_submissions;
  v_session_token uuid;
  v_form public.program_forms;
  v_enr public.program_enrollments;
  v_adm public.program_admission_decisions;
  v_state jsonb;
BEGIN
  SELECT allowed INTO v_ok FROM public.consume_edge_rate_limit('portal-open-ip:' || public.portal_request_ip(), 30, 600);
  IF NOT v_ok THEN RETURN jsonb_build_object('valid', false, 'rateLimited', true); END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('valid', false); END IF;

  SELECT * INTO v_link FROM public.program_applicant_portal_links
  WHERE token_hash = public.portal_token_hash(p_token) AND revoked_at IS NULL AND expires_at > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false); END IF;

  UPDATE public.program_applicant_portal_links SET last_used_at = now(), use_count = use_count + 1 WHERE id = v_link.id;

  SELECT * INTO v_sub FROM public.program_form_submissions WHERE id = v_link.submission_id;
  SELECT session_token INTO v_session_token FROM public.program_form_sessions WHERE id = v_sub.session_id AND completed_at IS NOT NULL;
  SELECT * INTO v_form FROM public.program_forms WHERE id = v_sub.form_id;
  SELECT * INTO v_enr FROM public.program_enrollments WHERE source_submission_id = v_sub.id ORDER BY created_at LIMIT 1;
  SELECT * INTO v_adm FROM public.program_admission_decisions WHERE submission_id = v_sub.id;
  IF v_session_token IS NOT NULL THEN v_state := public.get_program_payment_state(v_session_token); END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'sessionToken', v_session_token,
    'formSlug', v_form.slug,
    'formTitle', v_form.title,
    'formOpen', (v_form.status = 'published'),
    'firstName', coalesce(nullif(v_enr.first_name, ''), ''),
    'submittedAt', v_sub.submitted_at,
    'enrollmentStatus', v_enr.status,
    'admissionStatus', CASE WHEN v_adm.submission_id IS NULL THEN 'not_required' ELSE v_adm.status END,
    'admissionGrandfathered', coalesce(v_adm.grandfathered, false),
    'admissionReason', CASE WHEN v_adm.status = 'rejected' THEN v_adm.reason ELSE '' END,
    'payment', coalesce(v_state, jsonb_build_object('available', false)),
    'linkExpiresAt', v_link.expires_at
  );
END $$;
REVOKE ALL ON FUNCTION public.get_applicant_portal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_applicant_portal(text) TO anon, authenticated;

-- Admin: create a portal link (optionally rotating existing ones).
CREATE OR REPLACE FUNCTION public.admin_create_portal_link(p_submission_id uuid, p_revoke_existing boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ok boolean;
  v_adm public.program_admission_decisions;
  v_elig boolean;
  v_reason text;
  v_completed timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT allowed INTO v_ok FROM public.consume_edge_rate_limit('portal-admin-create:' || auth.uid(), 60, 3600);
  IF NOT v_ok THEN RAISE EXCEPTION 'Too many links created. Please wait and try again.'; END IF;

  SELECT ss.completed_at INTO v_completed FROM public.program_form_submissions s
    JOIN public.program_form_sessions ss ON ss.id = s.session_id WHERE s.id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_completed IS NULL THEN RAISE EXCEPTION 'This application''s registration session was never finalised; a portal link cannot be issued.'; END IF;

  SELECT * INTO v_adm FROM public.program_admission_decisions WHERE submission_id = p_submission_id;
  IF v_adm.submission_id IS NULL OR v_adm.grandfathered THEN
    SELECT r.eligible, r.reason INTO v_elig, v_reason FROM public.application_recovery_status(p_submission_id) r;
    IF NOT v_elig THEN RAISE EXCEPTION 'Not eligible for a recovery link: %', v_reason; END IF;
  END IF;

  IF p_revoke_existing THEN
    UPDATE public.program_applicant_portal_links SET revoked_at = now(), revoked_by = auth.uid()
    WHERE submission_id = p_submission_id AND revoked_at IS NULL;
    INSERT INTO public.program_application_audit_events (submission_id, actor_id, action, details)
    VALUES (p_submission_id, auth.uid(), 'portal_links_revoked', jsonb_build_object('reason', 'rotated'));
  END IF;
  RETURN public.issue_portal_link_internal(p_submission_id, 'admin', auth.uid(), 90);
END $$;
REVOKE ALL ON FUNCTION public.admin_create_portal_link(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_portal_link(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_portal_links(p_submission_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  UPDATE public.program_applicant_portal_links SET revoked_at = now(), revoked_by = auth.uid()
  WHERE submission_id = p_submission_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.program_application_audit_events (submission_id, actor_id, action, details)
  VALUES (p_submission_id, auth.uid(), 'portal_links_revoked', jsonb_build_object('count', v_count));
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.admin_revoke_portal_links(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_portal_links(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_mark_portal_link_shared(p_link_id uuid, p_shared boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  UPDATE public.program_applicant_portal_links
  SET shared_marked_at = CASE WHEN p_shared THEN now() END, shared_marked_by = CASE WHEN p_shared THEN auth.uid() END
  WHERE id = p_link_id RETURNING submission_id INTO v_sub;
  IF v_sub IS NULL THEN RAISE EXCEPTION 'Link not found'; END IF;
  INSERT INTO public.program_application_audit_events (submission_id, actor_id, action, details)
  VALUES (v_sub, auth.uid(), CASE WHEN p_shared THEN 'portal_link_marked_shared' ELSE 'portal_link_unmarked_shared' END, jsonb_build_object('linkId', p_link_id));
END $$;
REVOKE ALL ON FUNCTION public.admin_mark_portal_link_shared(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_portal_link_shared(uuid, boolean) TO authenticated;

-- Admin: admission decision (separate from funding verification).
CREATE OR REPLACE FUNCTION public.admin_set_admission_decision(p_submission_id uuid, p_decision text, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_adm public.program_admission_decisions;
  v_funded boolean;
  v_applicant uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_decision NOT IN ('pending','admitted','rejected') THEN RAISE EXCEPTION 'Invalid admission decision'; END IF;
  SELECT * INTO v_adm FROM public.program_admission_decisions WHERE submission_id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This application predates admissions and does not use the admission stage'; END IF;
  IF v_adm.grandfathered THEN RAISE EXCEPTION 'Grandfathered participants cannot be changed here'; END IF;
  SELECT user_id INTO v_applicant FROM public.program_enrollments WHERE source_submission_id = p_submission_id ORDER BY created_at LIMIT 1;
  IF v_applicant IS NOT NULL AND v_applicant = auth.uid() THEN RAISE EXCEPTION 'You cannot decide on your own application'; END IF;
  IF p_decision = 'rejected' AND length(trim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A reason is required when rejecting'; END IF;
  IF p_decision = 'admitted' THEN
    SELECT EXISTS (SELECT 1 FROM public.program_payments WHERE submission_id = p_submission_id AND status = 'paid')
        OR coalesce((SELECT status = 'approved' FROM public.program_sponsorship_claims WHERE submission_id = p_submission_id ORDER BY created_at DESC LIMIT 1), false)
    INTO v_funded;
    IF NOT v_funded THEN RAISE EXCEPTION 'Funding must be verified before admission'; END IF;
  END IF;
  UPDATE public.program_admission_decisions
  SET status = p_decision,
      decided_by = CASE WHEN p_decision = 'pending' THEN NULL ELSE auth.uid() END,
      decided_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE now() END,
      reason = trim(coalesce(p_reason, '')),
      updated_at = now()
  WHERE submission_id = p_submission_id;
  INSERT INTO public.program_application_audit_events (submission_id, actor_id, action, details)
  VALUES (p_submission_id, auth.uid(), 'admission_' || p_decision, jsonb_build_object('from', v_adm.status, 'reason', trim(coalesce(p_reason, ''))));
  RETURN jsonb_build_object('submissionId', p_submission_id, 'status', p_decision);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_admission_decision(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_admission_decision(uuid, text, text) TO authenticated;

-- Admin: unified applications list.
CREATE OR REPLACE FUNCTION public.admin_list_applications()
RETURNS TABLE(
  submission_id uuid, form_id uuid, form_title text, submitted_at timestamptz, session_finalised boolean,
  applicant_name text, applicant_email text, applicant_phone text,
  funding_route text, funding_state text,
  payment_status text, payment_method text, payment_reference text, proof_uploaded_at timestamptz, paid_at timestamptz, verified_at timestamptz, payment_rejection_reason text,
  claim_id uuid, claim_status text, sponsor_name text, campaign_name text, claim_requested_at timestamptz, claim_reviewed_at timestamptz, claim_rejection_reason text,
  enrollment_status text, completion_status text,
  admission_status text, admission_grandfathered boolean, admission_decided_at timestamptz, admission_decided_by uuid, admission_reason text,
  recovery_eligible boolean, recovery_reason text,
  active_link_count integer, latest_link_id uuid, latest_link_created_at timestamptz, latest_link_expires_at timestamptz, latest_link_last_used_at timestamptz, latest_link_shared_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  RETURN QUERY
  SELECT s.id, s.form_id, f.title, s.submitted_at, (ss.completed_at IS NOT NULL),
    nullif(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), ''),
    coalesce(nullif(e.email, ''), (SELECT a.answer #>> '{}' FROM public.program_form_answers a JOIN public.program_form_fields pf ON pf.id = a.field_id WHERE a.submission_id = s.id AND pf.field_type = 'email' ORDER BY pf.display_order LIMIT 1)),
    (SELECT a.answer #>> '{}' FROM public.program_form_answers a JOIN public.program_form_fields pf ON pf.id = a.field_id WHERE a.submission_id = s.id AND pf.field_type = 'phone' ORDER BY pf.display_order LIMIT 1),
    CASE WHEN c.status IN ('pending','approved') THEN 'sponsored'
         WHEN p.submission_id IS NOT NULL THEN 'self_funded'
         WHEN c.id IS NOT NULL THEN 'sponsored'
         ELSE 'unknown' END,
    CASE WHEN p.status = 'paid' OR c.status = 'approved' THEN 'verified'
         WHEN c.status = 'pending' OR (p.status = 'pending' AND p.proof_path IS NOT NULL) THEN 'awaiting_verification'
         WHEN p.status = 'rejected' OR c.status IN ('rejected','revoked') THEN 'action_needed'
         WHEN p.status = 'pending' THEN 'in_progress'
         ELSE 'not_started' END,
    p.status, p.method, coalesce(p.provider_reference, p.manual_reference), p.proof_uploaded_at, p.paid_at, p.verified_at, p.rejection_reason,
    c.id, c.status, camp.sponsor_name, camp.name, c.requested_at, c.reviewed_at, nullif(c.rejection_reason, ''),
    e.status, ps.completion_status,
    CASE WHEN ad.submission_id IS NULL THEN 'not_required' ELSE ad.status END, coalesce(ad.grandfathered, false), ad.decided_at, ad.decided_by, ad.reason,
    rs.eligible, rs.reason,
    (SELECT count(*)::int FROM public.program_applicant_portal_links l WHERE l.submission_id = s.id AND l.revoked_at IS NULL AND l.expires_at > now()),
    ll.id, ll.created_at, ll.expires_at, ll.last_used_at, ll.shared_marked_at
  FROM public.program_form_submissions s
  JOIN public.program_forms f ON f.id = s.form_id
  LEFT JOIN public.program_form_sessions ss ON ss.id = s.session_id
  LEFT JOIN public.program_payments p ON p.submission_id = s.id
  LEFT JOIN LATERAL (SELECT * FROM public.program_sponsorship_claims c2 WHERE c2.submission_id = s.id ORDER BY c2.created_at DESC LIMIT 1) c ON true
  LEFT JOIN public.program_sponsorship_campaigns camp ON camp.id = c.campaign_id
  LEFT JOIN LATERAL (SELECT * FROM public.program_enrollments e2 WHERE e2.source_submission_id = s.id ORDER BY e2.created_at LIMIT 1) e ON true
  LEFT JOIN public.program_participant_status ps ON ps.submission_id = s.id
  LEFT JOIN public.program_admission_decisions ad ON ad.submission_id = s.id
  LEFT JOIN LATERAL public.application_recovery_status(s.id) rs ON true
  LEFT JOIN LATERAL (SELECT * FROM public.program_applicant_portal_links l2 WHERE l2.submission_id = s.id AND l2.revoked_at IS NULL AND l2.expires_at > now() ORDER BY l2.created_at DESC LIMIT 1) ll ON true
  ORDER BY s.submitted_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_applications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_applications() TO authenticated;
