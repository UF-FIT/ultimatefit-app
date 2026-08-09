-- Verificação Migration 020
-- Apenas leitura.

select policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'nutrition_documents'
  and policyname = 'nutrition_documents_delete_accessible';

select policyname, cmd, qual
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'nutrition_documents_storage_delete';
