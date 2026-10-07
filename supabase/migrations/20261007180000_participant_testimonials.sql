-- Real participant stories. Private identities never appear in the public projection.
create table public.participant_testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  name_visibility text not null default 'full' check (name_visibility in ('full','initial','first')),
  participant_year integer not null check (participant_year between 2019 and 2100),
  quote text not null check (char_length(trim(quote)) between 10 and 240),
  story text not null default '' check (char_length(story) <= 2000),
  photo_path text,
  show_photo boolean not null default false,
  publish_consent boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  verified boolean not null default false,
  verification_notes text not null default '' check (char_length(verification_notes) <= 1000),
  featured boolean not null default false,
  placements text[] not null default array['testimonials']::text[]
    check (placements <@ array['testimonials','home','registration','campaign']::text[]),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (photo_path is null or photo_path like user_id::text || '/%'),
  check (status <> 'approved' or (publish_consent and verified and char_length(trim(verification_notes)) > 0))
);
create index participant_testimonials_public_idx on public.participant_testimonials(status, featured, created_at desc);
alter table public.participant_testimonials enable row level security;
create policy "Participant or admin can read private story" on public.participant_testimonials
for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'::public.app_role));
create policy "Admins moderate stories" on public.participant_testimonials
for update to authenticated using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));
revoke all on public.participant_testimonials from anon, authenticated;
grant select on public.participant_testimonials to authenticated;
-- Moderators cannot change participant-authored content or consent through the table API.
grant update(status, verified, verification_notes, featured, placements, reviewed_by, reviewed_at)
on public.participant_testimonials to authenticated;
grant all on public.participant_testimonials to service_role;

create function public.stamp_testimonial_review()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.has_role(auth.uid(), 'admin'::public.app_role) then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end; $$;
create trigger stamp_testimonial_review before update on public.participant_testimonials
for each row execute function public.stamp_testimonial_review();

create function public.submit_participant_testimonial(
  p_full_name text, p_name_visibility text, p_year integer, p_quote text,
  p_story text, p_photo_path text, p_show_photo boolean, p_consent boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sign in to share your story.'; end if;
  if p_consent is distinct from true then raise exception 'Publishing consent is required.'; end if;
  if p_year > extract(year from current_date) then raise exception 'Choose a past or current participant year.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if (select count(*) from public.participant_testimonials where user_id = v_user and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Please wait an hour before submitting another story.';
  end if;
  if p_photo_path is not null and not exists (
    select 1 from storage.objects where bucket_id = 'testimonial-portraits' and name = p_photo_path and (storage.foldername(name))[1] = v_user::text
  ) then raise exception 'Upload your own portrait first.'; end if;
  insert into public.participant_testimonials(user_id,full_name,name_visibility,participant_year,quote,story,photo_path,show_photo,publish_consent)
  values(v_user,trim(p_full_name),p_name_visibility,p_year,trim(p_quote),trim(coalesce(p_story,'')),p_photo_path,p_show_photo,p_consent)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.submit_participant_testimonial(text,text,integer,text,text,text,boolean,boolean) from public;
grant execute on function public.submit_participant_testimonial(text,text,integer,text,text,text,boolean,boolean) to authenticated;

create function public.withdraw_participant_testimonial(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.participant_testimonials set status = 'withdrawn', publish_consent = false,
  verified = false, featured = false, placements = '{}' where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Story not found.'; end if;
end; $$;
revoke all on function public.withdraw_participant_testimonial(uuid) from public;
grant execute on function public.withdraw_participant_testimonial(uuid) to authenticated;

create function public.get_public_testimonials(p_placement text default 'testimonials')
returns table(id uuid, display_name text, participant_year integer, quote text, story text, photo_path text, verified boolean, featured boolean)
language sql stable security definer set search_path = public as $$
  select t.id,
    case t.name_visibility
      when 'first' then split_part(trim(t.full_name), ' ', 1)
      when 'initial' then split_part(trim(t.full_name), ' ', 1) ||
        case when strpos(trim(t.full_name), ' ') > 0 then ' ' || left(regexp_replace(trim(t.full_name), '^.*\s+', ''), 1) || '.' else '' end
      else t.full_name end,
    t.participant_year, t.quote, t.story,
    case when t.show_photo then t.photo_path else null end, t.verified, t.featured
  from public.participant_testimonials t
  where t.status = 'approved' and t.publish_consent and t.verified and p_placement = any(t.placements)
  order by t.featured desc, t.created_at desc limit 120;
$$;
revoke all on function public.get_public_testimonials(text) from public;
grant execute on function public.get_public_testimonials(text) to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('testimonial-portraits','testimonial-portraits',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy "Participants upload own testimonial portraits" on storage.objects
for insert to authenticated with check (bucket_id = 'testimonial-portraits' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Approved consented portraits or private owner review" on storage.objects
for select to anon, authenticated using (bucket_id = 'testimonial-portraits' and (
  (storage.foldername(name))[1] = auth.uid()::text or public.has_role(auth.uid(), 'admin'::public.app_role)
  or exists (select 1 from public.get_public_testimonials('testimonials') t where t.photo_path = name)
  or exists (select 1 from public.get_public_testimonials('home') t where t.photo_path = name)
  or exists (select 1 from public.get_public_testimonials('registration') t where t.photo_path = name)
  or exists (select 1 from public.get_public_testimonials('campaign') t where t.photo_path = name)
));
create policy "Participants remove unused or withdrawn portraits" on storage.objects
for delete to authenticated using (bucket_id = 'testimonial-portraits' and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (select 1 from public.participant_testimonials t where t.photo_path = name and t.publish_consent));
