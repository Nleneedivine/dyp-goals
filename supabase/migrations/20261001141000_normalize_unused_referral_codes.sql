-- Normalize only unused legacy random referral codes to the original DYPGL-FL****
-- convention. Codes already referenced by a referral are preserved to avoid breaking links.

delete from public.program_referral_codes rc
where rc.code ~ '^DYPGL-[0-9A-F]{8}$'
  and not exists (
    select 1
    from public.program_submission_referrals r
    where r.referral_code = rc.code
       or r.referrer_submission_id = rc.submission_id
  );

select public.ensure_program_referral_code(s.id, s.form_id)
from public.program_form_submissions s
where not exists (
  select 1
  from public.program_referral_codes rc
  where rc.submission_id = s.id
);
