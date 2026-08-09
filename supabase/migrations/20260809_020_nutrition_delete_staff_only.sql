-- ULTIMATE FIT APP
-- Migration 020: eliminação de documentos de nutrição reservada à equipa autorizada.
-- O aluno continua a poder consultar e carregar o próprio PDF, mas não o pode eliminar.

begin;

drop policy if exists nutrition_documents_delete_accessible on public.nutrition_documents;
create policy nutrition_documents_delete_accessible
on public.nutrition_documents
for delete to authenticated
using (
  public.can_manage_nutrition_student(student_id)
);

drop policy if exists nutrition_documents_storage_delete on storage.objects;
create policy nutrition_documents_storage_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'nutrition-documents'
  and exists (
    select 1
    from public.nutrition_documents nd
    where nd.file_path = name
      and public.can_manage_nutrition_student(nd.student_id)
  )
);

commit;
