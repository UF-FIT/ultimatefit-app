-- ULTIMATE FIT APP v5D.6.5.2
-- Avaliações físicas: leitura global para Owner/Admin, escrita reservada ao professor responsável.
-- Data: 2026-08-11
--
-- Regra funcional:
--   * Owner/Admin: podem consultar avaliações de todos os alunos.
--   * Owner/Admin só podem criar/editar/publicar/arquivar/eliminar avaliações dos alunos
--     que lhes estejam atribuídos como professor principal/responsável.
--   * Trainer: continua a ver apenas os alunos que lhe estão atribuídos e só gere as
--     avaliações desses alunos, respeitando a permissão manage_assessments.
--   * Student: apenas consulta as próprias avaliações publicadas.
--
-- A responsabilidade acompanha a atribuição PRIMARY ativa. Para dados antigos sem
-- PRIMARY ativo, é usada a atribuição ativa existente como fallback.

begin;

-- Recriada aqui de forma idempotente para que a regra das avaliações não dependa
-- apenas da ordem em que o update dos planos foi instalado.
create or replace function public.current_trainer_owns_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_student_id is null then false
    when public.current_trainer_id() is null then false
    when exists (
      select 1
      from public.trainer_students ts_primary
      where ts_primary.student_id = target_student_id
        and ts_primary.ended_at is null
        and ts_primary.is_primary = true
    ) then exists (
      select 1
      from public.trainer_students ts
      where ts.student_id = target_student_id
        and ts.trainer_id = public.current_trainer_id()
        and ts.ended_at is null
        and ts.is_primary = true
    )
    else public.trainer_has_student(target_student_id)
  end;
$$;

-- Substitui a regra anterior onde is_admin() dava escrita global.
create or replace function public.can_manage_assessment_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_student_id is not null
    and public.current_profile_is_active()
    and public.current_trainer_owns_student(target_student_id)
    and public.trainer_has_permission('manage_assessments');
$$;

-- Mantém leitura global para Owner/Admin; Trainer só alunos atribuídos;
-- Student só a própria avaliação publicada.
create or replace function public.can_view_physical_assessment(target_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.physical_assessments pa
    where pa.id = target_assessment_id
      and pa.deleted_at is null
      and public.current_profile_is_active()
      and (
        public.is_admin()
        or public.trainer_has_student(pa.student_id)
        or (pa.student_id = public.current_student_id() and pa.status = 'published')
      )
  );
$$;

create or replace function public.can_manage_physical_assessment(target_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.physical_assessments pa
    where pa.id = target_assessment_id
      and pa.deleted_at is null
      and public.can_manage_assessment_student(pa.student_id)
  );
$$;

-- Cabeçalho: leitura continua igual; escrita fica vinculada ao professor responsável.
drop policy if exists physical_assessments_insert on public.physical_assessments;
create policy physical_assessments_insert on public.physical_assessments
for insert to authenticated
with check (
  public.can_manage_assessment_student(student_id)
  and assessor_profile_id = auth.uid()
);

drop policy if exists physical_assessments_update on public.physical_assessments;
create policy physical_assessments_update on public.physical_assessments
for update to authenticated
using (public.can_manage_assessment_student(student_id))
with check (public.can_manage_assessment_student(student_id));

drop policy if exists physical_assessments_delete on public.physical_assessments;
create policy physical_assessments_delete on public.physical_assessments
for delete to authenticated
using (status = 'draft' and public.can_manage_assessment_student(student_id));

-- As policies dos módulos 1:1 e das fotografias já chamam
-- can_manage_physical_assessment()/can_manage_assessment_student().
-- Ao redefinir os helpers acima, ficam automaticamente protegidas também as operações
-- diretas, upload/delete no storage, publicação e hard delete por RPC.

revoke all on function public.current_trainer_owns_student(uuid) from public;
grant execute on function public.current_trainer_owns_student(uuid) to authenticated;
grant execute on function public.can_manage_assessment_student(uuid) to authenticated;
grant execute on function public.can_view_physical_assessment(uuid) to authenticated;
grant execute on function public.can_manage_physical_assessment(uuid) to authenticated;

commit;
