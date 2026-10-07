// Isolated PostgreSQL test. Never points at a remote database.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const author='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const admin='33333333-3333-3333-3333-333333333333';
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create table auth.users(id uuid primary key);
insert into auth.users values('${author}'),('${other}'),('${admin}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create type public.app_role as enum('admin','user');
create function public.has_role(uid uuid, role public.app_role) returns boolean language sql stable as $$ select uid = '${admin}'::uuid and role = 'admin' $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
grant usage on schema public, auth, storage to anon, authenticated;
grant select,insert,delete on storage.objects to anon, authenticated;
-- Supabase default grants are deliberately modeled to test explicit revocation.
alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261007180000_participant_testimonials.sql', import.meta.url),'utf8'));
await db.exec('alter table storage.objects add column metadata jsonb');
await db.exec(readFileSync(new URL('../supabase/migrations/20261008003000_rich_participant_stories.sql', import.meta.url),'utf8'));
async function role(name,id='') { await db.exec(`reset role; set role ${name}; set request.jwt.claim.sub = '${id}';`); }
async function fails(sql,label) { await assert.rejects(()=>db.query(sql),undefined,label); }
await role('authenticated',author);
await db.query(`insert into storage.objects(bucket_id,name,metadata) values
 ('testimonial-media','${author}/image.jpg','{"mimetype":"image/jpeg"}'),
 ('testimonial-media','${author}/video.mp4','{"mimetype":"video/mp4"}'),
 ('testimonial-media','${author}/captions.vtt','{"mimetype":"text/vtt"}'),
 ('testimonial-portraits','${author}/portrait.jpg',null)`);
await fails(`select submit_participant_story('Private Person','first',2025,'A genuine sample story.','Written summary.',null,false,true,'${author}/image.jpg','image',false,'A person reviewing goals.',null,'')`,'separate media consent required');
await fails(`select submit_participant_story('Private Person','first',2025,'A genuine sample story.','Written summary.',null,false,true,'${other}/image.jpg','image',true,'A person reviewing goals.',null,'')`,'foreign media denied');
await fails(`select submit_participant_story('Private Person','first',2025,'A genuine sample story.','Written summary.',null,false,true,'${author}/video.mp4','video',true,'',null,'Spoken transcript.')`,'captions required');
const imageId=(await db.query(`select submit_participant_story('Private Person','first',2025,'A genuine sample photo story.','Written summary.',null,false,true,'${author}/image.jpg','image',true,'A person reviewing goals.',null,'') as id`)).rows[0].id;
const videoId=(await db.query(`select submit_participant_story('Video Person','initial',2025,'A genuine sample video story.','Written summary.',null,false,true,'${author}/video.mp4','video',true,'','${author}/captions.vtt','Spoken transcript.') as id`)).rows[0].id;
await role('anon');
assert.equal((await db.query('select * from get_public_participant_stories()')).rows.length,0);
assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await role('authenticated',other);
await fails('select * from get_testimonial_engagement_summary()','metrics private to admins');
await role('authenticated',admin);
await fails(`update participant_testimonials set media_consent=true where id='${imageId}'`,'admins cannot override media consent');
await fails(`update participant_testimonials set presentation='video' where id='${imageId}'`,'wrong format denied');
await db.query(`update participant_testimonials set status='approved',verified=true,verification_notes='Checked attendance',presentation='photo',placements=array['home'] where id='${imageId}'`);
await db.query(`update participant_testimonials set status='approved',verified=true,verification_notes='Checked attendance',presentation='video' where id='${videoId}'`);
await role('anon');
assert.equal((await db.query(`select * from get_public_participant_stories('testimonials','${imageId}')`)).rows[0].display_name,'Private');
assert.equal((await db.query("select * from get_public_participant_stories('testimonials')")).rows.length,1,'placement filters respected');
assert.equal((await db.query('select * from storage.objects')).rows.length,3,'published image video captions accessible');
await fails('select * from testimonial_engagement_events','raw session keys hidden');
const session='99999999-9999-9999-9999-999999999999';
await db.query(`select record_testimonial_engagement('${videoId}','${session}','view')`);
await db.query(`select record_testimonial_engagement('${videoId}','${session}','view')`);
await db.query(`select record_testimonial_engagement('${videoId}','${session}','video_play')`);
await db.query(`select record_testimonial_engagement('${videoId}','${session}','share_action')`);
await role('authenticated',admin);
const stats=(await db.query('select * from get_testimonial_engagement_summary()')).rows[0];
assert.equal(Number(stats.session_views),1);assert.equal(Number(stats.video_plays),1);assert.equal(Number(stats.share_actions),1);
await role('authenticated',author);
await db.query(`select withdraw_participant_testimonial('${videoId}')`);
const portraitId=(await db.query(`select submit_participant_testimonial('Portrait Person','full',2025,'A genuine sample portrait story.','','${author}/portrait.jpg',true,true) as id`)).rows[0].id;
await role('authenticated',admin);
await db.query(`update participant_testimonials set status='approved',verified=true,verification_notes='Checked attendance',presentation='photo' where id='${portraitId}'`);
await role('anon');
assert.equal((await db.query(`select * from get_public_participant_stories('testimonials','${videoId}')`)).rows.length,0,'withdrawn shared link unavailable');
assert.equal((await db.query(`select can_read_testimonial_media('${author}/video.mp4') as allowed`)).rows[0].allowed,false);
assert.equal((await db.query(`select can_read_testimonial_media('${author}/captions.vtt') as allowed`)).rows[0].allowed,false);
assert.equal((await db.query(`select * from get_public_participant_stories('testimonials','${portraitId}')`)).rows[0].presentation,'photo');
console.log('PASS: media consent, ownership, captions, format checks, private analytics, session deduplication, shared links and media withdrawal.');
await db.close();
