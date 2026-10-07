-- Add consented story media, shareable stories and private session engagement metrics.
alter table public.participant_testimonials
 add column presentation text not null default 'quote' check (presentation in ('quote','photo','video')),
 add column media_path text,
 add column media_type text check (media_type in ('image','video')),
 add column media_consent boolean not null default false,
 add column media_description text not null default '' check (char_length(media_description) <= 240),
 add column caption_path text,
 add column video_transcript text not null default '' check (char_length(video_transcript) <= 10000),
 add constraint testimonial_media_owner check (media_path is null or media_path like user_id::text || '/%'),
 add constraint testimonial_captions_owner check (caption_path is null or caption_path like user_id::text || '/%'),
 add constraint testimonial_format_ready check (
  presentation='quote' or (presentation='photo' and ((media_consent and media_path is not null and media_type='image' and length(trim(media_description))>0) or (show_photo and photo_path is not null)))
  or (presentation='video' and media_consent and media_path is not null and media_type='video' and caption_path is not null and length(trim(video_transcript))>0)
 );
grant update(presentation) on public.participant_testimonials to authenticated;

create function public.submit_participant_story(
 p_full_name text,p_name_visibility text,p_year integer,p_quote text,p_story text,
 p_photo_path text,p_show_photo boolean,p_consent boolean,
 p_media_path text,p_media_type text,p_media_consent boolean,p_media_description text,
 p_caption_path text,p_video_transcript text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if (p_media_path is null) <> (p_media_type is null) then raise exception 'Choose a media type and upload together.'; end if;
 if p_caption_path is not null and p_media_type is distinct from 'video' then raise exception 'Captions belong to a video story.'; end if;
 if p_media_path is not null then
  if p_media_consent is distinct from true then raise exception 'Permission to publish your story media is required.'; end if;
  if not exists(select 1 from storage.objects where bucket_id='testimonial-media' and name=p_media_path and (storage.foldername(name))[1]=auth.uid()::text and
   ((p_media_type='image' and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')) or
    (p_media_type='video' and metadata->>'mimetype' in ('video/mp4','video/webm')))) then raise exception 'Upload your own story image or video.'; end if;
 end if;
 if p_caption_path is not null and not exists(select 1 from storage.objects where bucket_id='testimonial-media' and name=p_caption_path and (storage.foldername(name))[1]=auth.uid()::text and metadata->>'mimetype'='text/vtt') then
  raise exception 'Upload your own captions file.';
 end if;
 if p_media_type='video' and (p_caption_path is null or length(trim(coalesce(p_video_transcript,'')))=0) then raise exception 'Video stories need captions and a transcript.'; end if;
 if p_media_type='image' and length(trim(coalesce(p_media_description,'')))=0 then raise exception 'Add a description of your story image.'; end if;
 v_id:=public.submit_participant_testimonial(p_full_name,p_name_visibility,p_year,p_quote,p_story,p_photo_path,p_show_photo,p_consent);
 update public.participant_testimonials set media_path=p_media_path,media_type=p_media_type,media_consent=p_media_consent,
 media_description=trim(coalesce(p_media_description,'')),caption_path=p_caption_path,video_transcript=trim(coalesce(p_video_transcript,'')) where id=v_id;
 return v_id;
end; $$;
revoke all on function public.submit_participant_story(text,text,integer,text,text,text,boolean,boolean,text,text,boolean,text,text,text) from public;
grant execute on function public.submit_participant_story(text,text,integer,text,text,text,boolean,boolean,text,text,boolean,text,text,text) to authenticated;

-- Keep the original public RPC intact for older deployed clients and portrait policies.
create function public.get_public_participant_stories(p_placement text default 'testimonials',p_id uuid default null)
returns table(id uuid,display_name text,participant_year integer,quote text,story text,photo_path text,verified boolean,featured boolean,
 presentation text,media_path text,media_type text,media_description text,caption_path text,video_transcript text)
language sql stable security definer set search_path=public as $$
 select t.id,case t.name_visibility when 'first' then split_part(trim(t.full_name),' ',1)
 when 'initial' then split_part(trim(t.full_name),' ',1)||case when strpos(trim(t.full_name),' ')>0 then ' '||left(regexp_replace(trim(t.full_name),'^.*\s+',''),1)||'.' else '' end else t.full_name end,
 t.participant_year,t.quote,t.story,case when t.show_photo then t.photo_path end,t.verified,t.featured,t.presentation,
 case when t.media_consent and t.presentation<>'quote' then t.media_path end,
 case when t.media_consent and t.presentation<>'quote' then t.media_type end,
 case when t.media_consent and t.presentation<>'quote' then t.media_description else '' end,
 case when t.media_consent and t.presentation='video' then t.caption_path end,
 case when t.media_consent and t.presentation='video' then t.video_transcript else '' end
 from public.participant_testimonials t where t.status='approved' and t.publish_consent and t.verified and cardinality(t.placements)>0
 and ((p_id is null and p_placement=any(t.placements)) or t.id=p_id)
 order by t.featured desc,t.created_at desc limit 120;
$$;
revoke all on function public.get_public_participant_stories(text,uuid) from public;
grant execute on function public.get_public_participant_stories(text,uuid) to anon,authenticated;

create function public.can_read_testimonial_media(p_path text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.participant_testimonials t where t.status='approved' and t.publish_consent and t.verified and t.media_consent
 and cardinality(t.placements)>0 and t.presentation<>'quote' and (t.media_path=p_path or (t.presentation='video' and t.caption_path=p_path)));
$$;
revoke all on function public.can_read_testimonial_media(text) from public;
grant execute on function public.can_read_testimonial_media(text) to anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('testimonial-media','testimonial-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','text/vtt']);
create policy "Own story media upload" on storage.objects for insert to authenticated
with check(bucket_id='testimonial-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Consented published story media" on storage.objects for select to anon,authenticated
using(bucket_id='testimonial-media' and ((storage.foldername(name))[1]=auth.uid()::text or public.has_role(auth.uid(),'admin'::public.app_role) or public.can_read_testimonial_media(name)));
create policy "Own unused or withdrawn story media cleanup" on storage.objects for delete to authenticated
using(bucket_id='testimonial-media' and (storage.foldername(name))[1]=auth.uid()::text and not exists(
 select 1 from public.participant_testimonials t where t.publish_consent and (t.media_path=name or t.caption_path=name)));

create table public.testimonial_engagement_events (
 testimonial_id uuid not null references public.participant_testimonials(id) on delete cascade,
 session_key uuid not null,
 event_type text not null check(event_type in ('view','video_play','share_action')),
 created_at timestamptz not null default now(),
 primary key(testimonial_id,session_key,event_type)
);
alter table public.testimonial_engagement_events enable row level security;
revoke all on public.testimonial_engagement_events from anon,authenticated;
grant all on public.testimonial_engagement_events to service_role;
create function public.record_testimonial_engagement(p_id uuid,p_session uuid,p_event text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_session is null or p_event is null or p_event not in ('view','video_play','share_action') then return; end if;
 if not exists(select 1 from public.participant_testimonials t where t.id=p_id and t.status='approved' and t.publish_consent and t.verified and cardinality(t.placements)>0
 and (p_event<>'video_play' or (t.presentation='video' and t.media_consent))) then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,1));
 if (select count(*) from public.testimonial_engagement_events where session_key=p_session and created_at>now()-interval '1 day')>=100 then return; end if;
 insert into public.testimonial_engagement_events(testimonial_id,session_key,event_type) values(p_id,p_session,p_event) on conflict do nothing;
end; $$;
revoke all on function public.record_testimonial_engagement(uuid,uuid,text) from public;
grant execute on function public.record_testimonial_engagement(uuid,uuid,text) to anon,authenticated;
create function public.get_testimonial_engagement_summary()
returns table(testimonial_id uuid,session_views bigint,video_plays bigint,share_actions bigint)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or public.has_role(auth.uid(),'admin'::public.app_role) is distinct from true then raise exception 'Admin access required.'; end if;
 return query select e.testimonial_id,count(*) filter(where e.event_type='view'),count(*) filter(where e.event_type='video_play'),count(*) filter(where e.event_type='share_action')
 from public.testimonial_engagement_events e group by e.testimonial_id;
end; $$;
revoke all on function public.get_testimonial_engagement_summary() from public;
grant execute on function public.get_testimonial_engagement_summary() to authenticated;
