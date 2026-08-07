-- ULTIMATE FIT APP
-- Migration 005: split first/last names, professional profile social link,
-- and private optimized professional avatars.
-- Run after Migration 004.

begin;

-- -----------------------------------------------------------------------------
-- 1. STRUCTURED NAMES
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

update public.profiles
set first_name = nullif(split_part(btrim(full_name), ' ', 1), ''),
    last_name = nullif(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)), '')
where first_name is null
   or btrim(first_name) = '';

alter table public.profiles
  drop constraint if exists profiles_first_name_length;
alter table public.profiles
  add constraint profiles_first_name_length check (
    first_name is null or char_length(first_name) <= 80
  );

alter table public.profiles
  drop constraint if exists profiles_last_name_length;
alter table public.profiles
  add constraint profiles_last_name_length check (
    last_name is null or char_length(last_name) <= 120
  );

-- -----------------------------------------------------------------------------
-- 2. PROFESSIONAL SOCIAL PAGE
-- -----------------------------------------------------------------------------

alter table public.trainer_profiles
  add column if not exists social_url text;

alter table public.trainer_profiles
  drop constraint if exists trainer_social_url_length;
alter table public.trainer_profiles
  add constraint trainer_social_url_length check (
    social_url is null or char_length(social_url) <= 500
  );

-- -----------------------------------------------------------------------------
-- 3. PRIVATE PROFESSIONAL AVATAR STORAGE
-- -----------------------------------------------------------------------------

create or replace function public.profile_id_from_storage_path(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  first_part text;
begin
  first_part := split_part(coalesce(object_name, ''), '/', 1);
  if first_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return first_part::uuid;
  end if;
  return null;
end;
$$;

create or replace function public.can_edit_own_professional_avatar(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_profile_id is not null
    and target_profile_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = target_profile_id
        and p.role in (
          'owner'::public.app_role,
          'admin'::public.app_role,
          'trainer'::public.app_role
        )
        and p.is_active
        and p.deleted_at is null
    );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'professional-avatars',
  'professional-avatars',
  false,
  524288,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists professional_avatars_select_accessible on storage.objects;
create policy professional_avatars_select_accessible
on storage.objects
for select
to authenticated
using (
  bucket_id = 'professional-avatars'
  and public.can_view_profile(public.profile_id_from_storage_path(name))
);

drop policy if exists professional_avatars_insert_own on storage.objects;
create policy professional_avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'professional-avatars'
  and public.can_edit_own_professional_avatar(public.profile_id_from_storage_path(name))
);

drop policy if exists professional_avatars_update_own on storage.objects;
create policy professional_avatars_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'professional-avatars'
  and public.can_edit_own_professional_avatar(public.profile_id_from_storage_path(name))
)
with check (
  bucket_id = 'professional-avatars'
  and public.can_edit_own_professional_avatar(public.profile_id_from_storage_path(name))
);

drop policy if exists professional_avatars_delete_own on storage.objects;
create policy professional_avatars_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'professional-avatars'
  and public.can_edit_own_professional_avatar(public.profile_id_from_storage_path(name))
);

grant execute on function public.profile_id_from_storage_path(text) to authenticated;
grant execute on function public.can_edit_own_professional_avatar(uuid) to authenticated;

commit;
