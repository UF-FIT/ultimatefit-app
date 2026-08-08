-- ULTIMATE FIT APP
-- Migration 016: documentos de nutrição em PDF
-- Data: 2026-08-08
-- Requer migrations anteriores até 015.

begin;

create or replace function public.can_manage_nutrition_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_student_id is null then false
    when public.is_admin() then true
    else public.trainer_has_student(target_student_id)
      and public.trainer_has_permission('manage_nutrition')
  end;
$$;

create table if not exists public.nutrition_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  title text not null,
  notes text,
  file_path text not null unique,
  file_name text not null,
  file_size_bytes bigint,
  mime_type text not null default 'application/pdf',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_documents_title_check check (char_length(btrim(title)) between 2 and 150),
  constraint nutrition_documents_notes_check check (notes is null or char_length(notes) <= 1500),
  constraint nutrition_documents_mime_check check (mime_type = 'application/pdf'),
  constraint nutrition_documents_size_check check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 10485760))
);

create index if not exists nutrition_documents_student_created_idx
  on public.nutrition_documents (student_id, created_at desc);

create or replace function public.prepare_nutrition_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.notes := nullif(btrim(coalesce(new.notes,'')), '');
  new.file_name := btrim(new.file_name);
  new.file_path := btrim(new.file_path);
  new.mime_type := 'application/pdf';
  if new.uploaded_by is null then new.uploaded_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists nutrition_documents_prepare on public.nutrition_documents;
create trigger nutrition_documents_prepare
before insert or update on public.nutrition_documents
for each row execute function public.prepare_nutrition_document();

drop trigger if exists nutrition_documents_set_updated_at on public.nutrition_documents;
create trigger nutrition_documents_set_updated_at
before update on public.nutrition_documents
for each row execute function public.set_updated_at();

alter table public.nutrition_documents enable row level security;

drop policy if exists nutrition_documents_select_accessible on public.nutrition_documents;
create policy nutrition_documents_select_accessible
on public.nutrition_documents
for select to authenticated
using (public.can_view_student(student_id));

drop policy if exists nutrition_documents_insert_accessible on public.nutrition_documents;
create policy nutrition_documents_insert_accessible
on public.nutrition_documents
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    student_id = public.current_student_id()
    or public.can_manage_nutrition_student(student_id)
  )
);

drop policy if exists nutrition_documents_update_accessible on public.nutrition_documents;
create policy nutrition_documents_update_accessible
on public.nutrition_documents
for update to authenticated
using (
  uploaded_by = auth.uid()
  or public.can_manage_nutrition_student(student_id)
)
with check (
  uploaded_by = auth.uid()
  or public.can_manage_nutrition_student(student_id)
);

drop policy if exists nutrition_documents_delete_accessible on public.nutrition_documents;
create policy nutrition_documents_delete_accessible
on public.nutrition_documents
for delete to authenticated
using (
  uploaded_by = auth.uid()
  or public.can_manage_nutrition_student(student_id)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nutrition-documents',
  'nutrition-documents',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nutrition_documents_storage_select on storage.objects;
create policy nutrition_documents_storage_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'nutrition-documents'
  and public.can_view_student(public.student_id_from_storage_path(name))
);

drop policy if exists nutrition_documents_storage_insert on storage.objects;
create policy nutrition_documents_storage_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'nutrition-documents'
  and (
    public.student_id_from_storage_path(name) = public.current_student_id()
    or public.can_manage_nutrition_student(public.student_id_from_storage_path(name))
  )
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
      and (
        nd.uploaded_by = auth.uid()
        or public.can_manage_nutrition_student(nd.student_id)
      )
  )
);

revoke all on table public.nutrition_documents from anon;
grant select, insert, update, delete on table public.nutrition_documents to authenticated;
grant execute on function public.can_manage_nutrition_student(uuid) to authenticated;
grant execute on function public.prepare_nutrition_document() to authenticated;

commit;
