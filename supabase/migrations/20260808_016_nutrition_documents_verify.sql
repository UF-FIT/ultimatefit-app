-- Verificação Migration 016
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='nutrition_documents'
order by ordinal_position;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id='nutrition-documents';

select policyname, cmd
from pg_policies
where schemaname in ('public','storage')
  and tablename in ('nutrition_documents','objects')
  and policyname like 'nutrition_documents%'
order by policyname;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in ('can_manage_nutrition_student','prepare_nutrition_document')
order by routine_name;

select count(*) as documentos_nutricao
from public.nutrition_documents;
