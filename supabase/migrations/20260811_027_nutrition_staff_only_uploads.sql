-- ULTIMATE FIT APP
-- Migration 027: nutrition documents — staff-only management
-- Data: 2026-08-11
--
-- Regras:
-- * aluno pode apenas consultar/abrir os seus documentos;
-- * apenas equipa autorizada pode inserir, atualizar ou eliminar;
-- * Storage acompanha exatamente as mesmas regras.

begin;

-- ---------------------------------------------------------------------------
-- TABLE RLS
-- ---------------------------------------------------------------------------

drop policy if exists nutrition_documents_insert_accessible
  on public.nutrition_documents;
create policy nutrition_documents_insert_accessible
on public.nutrition_documents
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.can_manage_nutrition_student(student_id)
);

drop policy if exists nutrition_documents_update_accessible
  on public.nutrition_documents;
create policy nutrition_documents_update_accessible
on public.nutrition_documents
for update
to authenticated
using (
  public.can_manage_nutrition_student(student_id)
)
with check (
  public.can_manage_nutrition_student(student_id)
);

-- delete already became staff-only in Migration 020; recreate explicitly
-- here so the final policy set is self-documenting.
drop policy if exists nutrition_documents_delete_accessible
  on public.nutrition_documents;
create policy nutrition_documents_delete_accessible
on public.nutrition_documents
for delete
to authenticated
using (
  public.can_manage_nutrition_student(student_id)
);

-- ---------------------------------------------------------------------------
-- STORAGE RLS
-- ---------------------------------------------------------------------------

drop policy if exists nutrition_documents_storage_insert
  on storage.objects;
create policy nutrition_documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'nutrition-documents'
  and public.can_manage_nutrition_student(
    public.student_id_from_storage_path(name)
  )
);

-- No UPDATE policy is needed for this bucket; uploads are immutable.
-- Deletion stays staff-only.
drop policy if exists nutrition_documents_storage_delete
  on storage.objects;
create policy nutrition_documents_storage_delete
on storage.objects
for delete
to authenticated
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
