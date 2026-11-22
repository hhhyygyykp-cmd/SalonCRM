-- Store inbound WhatsApp photos, voice notes, and other media in the inbox.

alter table public.whatsapp_chat_messages
  add column if not exists media_id text,
  add column if not exists media_mime text,
  add column if not exists media_path text,
  add column if not exists media_filename text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 16777216)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists whatsapp_media_select on storage.objects;
create policy whatsapp_media_select on storage.objects
  for select to authenticated
  using (bucket_id = 'whatsapp-media' and public.is_staff_user());
