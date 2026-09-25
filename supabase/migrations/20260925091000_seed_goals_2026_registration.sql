-- Seed the 2026 GOALS Master Class registration form.
-- The form is intentionally data-driven so the admin team can edit it later.

do $$
declare
  v_form_id uuid;
  v_created_by uuid;
begin
  select user_id into v_created_by
  from public.user_roles
  where role = 'admin'::public.app_role
  order by created_at
  limit 1;

  if v_created_by is null then
    raise exception 'No admin user exists. Assign an admin role before seeding the GOALS 2026 registration form.';
  end if;

  select id into v_form_id from public.program_forms where slug = 'goals-masterclass-2026';

  if v_form_id is null then
    insert into public.program_forms (
      slug, title, description, brand, status, opens_at, closes_at,
      submission_deadline, confirmation_message, confirmation_email_enabled,
      featured, created_by
    )
    values (
      'goals-masterclass-2026',
      'DYP GOALS Master Class 2026 Registration',
      'Register for the DYP GOALS Master Class, a practical 3-day experience on vision casting, goal setting and time management. Regular price: NGN 35,000. Current discounted price: NGN 5,000.',
      'goals',
      'published',
      null,
      null,
      null,
      'Registration received! The DYP team will review your details and contact you with the next steps for completing your registration.',
      false,
      true,
      v_created_by
    )
    returning id into v_form_id;
  else
    update public.program_forms
    set title = 'DYP GOALS Master Class 2026 Registration',
        description = 'Register for the DYP GOALS Master Class, a practical 3-day experience on vision casting, goal setting and time management. Regular price: NGN 35,000. Current discounted price: NGN 5,000.',
        brand = 'goals',
        status = 'published',
        featured = true,
        updated_at = now()
    where id = v_form_id;
  end if;

  delete from public.program_form_fields where form_id = v_form_id;

  insert into public.program_form_fields
    (form_id, field_type, label, helper_text, placeholder, required, display_order, options)
  values
    (v_form_id, 'section', 'Personal Information', '', '', true, 0, '[]'::jsonb),
    (v_form_id, 'text', 'First Name', '', 'Your first name', true, 1, '[]'::jsonb),
    (v_form_id, 'text', 'Last Name', '', 'Your last name', true, 2, '[]'::jsonb),
    (v_form_id, 'email', 'Email Address', 'Use an email you actively check.', 'you@example.com', true, 3, '[]'::jsonb),
    (v_form_id, 'phone', 'Phone / WhatsApp Number', 'Include your country code where possible.', '+234...', true, 4, '[]'::jsonb),
    (v_form_id, 'dropdown', 'What best describes you?', '', 'Select one', true, 5, '["Student","Graduate","Working professional","Entrepreneur","Other"]'::jsonb),
    (v_form_id, 'section', 'Your Goals', '', '', true, 6, '[]'::jsonb),
    (v_form_id, 'textarea', 'What do you want to achieve or improve in the next 12 months?', 'Tell us what you want to make progress on. There is no perfect answer.', 'Share your goals...', true, 7, '[]'::jsonb),
    (v_form_id, 'textarea', 'What is your biggest challenge with achieving your goals?', '', 'Tell us what usually gets in the way...', true, 8, '[]'::jsonb),
    (v_form_id, 'dropdown', 'How did you hear about DYP GOALS?', '', 'Select one', true, 9, '["WhatsApp","Instagram","Facebook","LinkedIn","Friend / referral","School / campus","Other"]'::jsonb),
    (v_form_id, 'section', 'Registration', '', '', true, 10, '[]'::jsonb),
    (v_form_id, 'radio', 'Current registration fee', 'The original price is NGN 35,000. The current discounted price is NGN 5,000.', 'Select one', true, 11, '["NGN 5,000 discounted registration"]'::jsonb),
    (v_form_id, 'checkbox', 'I understand the program dates', 'The master class runs from 27–29 November 2026.', 'Yes, I understand', true, 12, '["Yes, I understand"]'::jsonb),
    (v_form_id, 'checkbox', 'I agree to receive DYP GOALS program updates', 'We will use your contact details to communicate registration and program information.', 'Yes, I agree', true, 13, '["Yes, I agree"]'::jsonb);
end $$;
