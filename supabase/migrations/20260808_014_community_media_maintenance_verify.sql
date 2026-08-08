-- Verificação Migration 014

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='activities'
  and column_name in ('poster_url','poster_path')
order by column_name;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='app_notices'
  and column_name in ('image_url','image_path')
order by column_name;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id='community-media';

select policyname, cmd
from pg_policies
where schemaname='storage'
  and tablename='objects'
  and policyname like 'community_media_%'
order by policyname;

select id, maintenance_mode, maintenance_message
from public.app_runtime_settings
where id='global';
