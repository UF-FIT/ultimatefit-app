-- ULTIMATE FIT APP
-- Migration 014: media otimizada para atividades/avisos + modo manutenção real
-- Data: 2026-08-08
-- Requer migrations anteriores até 013.

begin;

-- 1. Referências aos ficheiros guardados no Supabase Storage.
alter table public.activities
  add column if not exists poster_path text;

alter table public.app_notices
  add column if not exists image_url text,
  add column if not exists image_path text;

-- 2. Bucket público apenas para cartazes/comunicações já destinados a ser vistos na app.
-- O frontend converte sempre para WebP 1080x1350 antes do upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-media',
  'community-media',
  true,
  1048576,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists community_media_read on storage.objects;
create policy community_media_read
on storage.objects for select to public
using (bucket_id = 'community-media');

drop policy if exists community_media_insert_admin on storage.objects;
create policy community_media_insert_admin
on storage.objects for insert to authenticated
with check (bucket_id = 'community-media' and public.is_admin());

drop policy if exists community_media_update_admin on storage.objects;
create policy community_media_update_admin
on storage.objects for update to authenticated
using (bucket_id = 'community-media' and public.is_admin())
with check (bucket_id = 'community-media' and public.is_admin());

drop policy if exists community_media_delete_admin on storage.objects;
create policy community_media_delete_admin
on storage.objects for delete to authenticated
using (bucket_id = 'community-media' and public.is_admin());

-- 3. Definições de execução da app.
-- A leitura é pública para que o ecrã de manutenção possa aparecer antes do login.
create table if not exists public.app_runtime_settings (
  id text primary key,
  maintenance_mode boolean not null default false,
  maintenance_message text not null default 'Estamos a realizar uma atualização. Voltamos dentro de momentos.',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_runtime_settings_id_check check (id = 'global'),
  constraint app_runtime_settings_message_check check (char_length(btrim(maintenance_message)) between 2 and 800)
);

insert into public.app_runtime_settings (id, maintenance_mode, maintenance_message)
values ('global', false, 'Estamos a realizar uma atualização. Voltamos dentro de momentos.')
on conflict (id) do nothing;

drop trigger if exists app_runtime_settings_set_updated_at on public.app_runtime_settings;
create trigger app_runtime_settings_set_updated_at
before update on public.app_runtime_settings
for each row execute function public.set_updated_at();

create or replace function public.app_runtime_settings_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id := 'global';
  new.maintenance_message := btrim(new.maintenance_message);
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists app_runtime_settings_prepare_trigger on public.app_runtime_settings;
create trigger app_runtime_settings_prepare_trigger
before insert or update on public.app_runtime_settings
for each row execute function public.app_runtime_settings_prepare();

alter table public.app_runtime_settings enable row level security;

drop policy if exists app_runtime_settings_read on public.app_runtime_settings;
create policy app_runtime_settings_read
on public.app_runtime_settings for select to public
using (true);

drop policy if exists app_runtime_settings_admin_update on public.app_runtime_settings;
create policy app_runtime_settings_admin_update
on public.app_runtime_settings for update to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.app_runtime_settings from anon;
grant select on public.app_runtime_settings to anon, authenticated;
grant update on public.app_runtime_settings to authenticated;
grant execute on function public.app_runtime_settings_prepare() to authenticated;

commit;
