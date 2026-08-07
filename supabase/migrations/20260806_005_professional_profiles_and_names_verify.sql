-- ULTIMATE FIT APP
-- Verify Migration 005

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('first_name', 'last_name')
order by column_name;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'trainer_profiles'
  and column_name = 'social_url';

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'professional-avatars';

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'professional_avatars_%'
order by policyname;

select p.email, p.first_name, p.last_name, p.full_name,
       tp.whatsapp_phone, tp.social_url
from public.profiles p
left join public.trainer_profiles tp on tp.profile_id = p.id
where p.role in ('owner'::public.app_role, 'admin'::public.app_role, 'trainer'::public.app_role)
  and p.deleted_at is null
order by p.role, p.full_name;
