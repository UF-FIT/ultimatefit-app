-- ULTIMATE FIT APP
-- Migration 019: eliminar definitivamente alunos + normalizar eliminações antigas
-- Data: 2026-08-09
-- Requer migrations anteriores até 018.
--
-- A partir desta migration:
--   * Arquivar = preserva o aluno e o histórico; pode ser reativado.
--   * Eliminar definitivamente = apaga os dados do aluno de forma irreversível.
--
-- As eliminações antigas eram "soft delete". Para não apagar informação antiga
-- silenciosamente durante a migration, esses registos são convertidos em Arquivados.
-- Depois do update da Edge Function, podem ser eliminados definitivamente pela app.

begin;

-- 1) Corrigir semanticamente os antigos "removidos": eram, na prática, arquivos.
update public.profiles p
set is_active = false,
    deleted_at = null
from public.student_profiles sp
where sp.profile_id = p.id
  and sp.deleted_at is not null;

update public.student_profiles
set status = 'archived'::public.student_status,
    archived_at = coalesce(archived_at, now()),
    deleted_at = null
where deleted_at is not null;

-- 2) Função interna utilizada apenas pela Edge Function com service_role.
-- Apaga todas as linhas que referenciam diretamente student_profiles(id), incluindo
-- tabelas futuras, e deixa as cascatas próprias dessas tabelas tratarem os filhos.
create or replace function public.hard_delete_student_data(target_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
  fk record;
begin
  if target_student_id is null then
    raise exception 'Aluno em falta.';
  end if;

  select sp.profile_id
    into target_profile_id
  from public.student_profiles sp
  where sp.id = target_student_id;

  if target_profile_id is null then
    raise exception 'Aluno não encontrado.';
  end if;

  -- Apaga todas as tabelas públicas com FK simples para student_profiles(id).
  -- Isto cobre trainer_students, avaliações/anamnese/fotos, planos, PAR-Q,
  -- desafios, treinos concluídos, inscrições em atividades, nutrição, logs, etc.
  for fk in
    select
      child_ns.nspname as schema_name,
      child.relname as table_name,
      child_att.attname as column_name
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    join lateral unnest(con.conkey) with ordinality ck(attnum, ord) on true
    join lateral unnest(con.confkey) with ordinality pk(attnum, ord) on pk.ord = ck.ord
    join pg_attribute child_att on child_att.attrelid = child.oid and child_att.attnum = ck.attnum
    join pg_attribute parent_att on parent_att.attrelid = parent.oid and parent_att.attnum = pk.attnum
    where con.contype = 'f'
      and parent_ns.nspname = 'public'
      and parent.relname = 'student_profiles'
      and parent_att.attname = 'id'
      and child_ns.nspname = 'public'
      and array_length(con.conkey, 1) = 1
    order by child_ns.nspname, child.relname
  loop
    execute format('delete from %I.%I where %I = $1', fk.schema_name, fk.table_name, fk.column_name)
      using target_student_id;
  end loop;

  -- Remove a ficha e o perfil público. A conta Supabase Auth é eliminada a seguir
  -- pela Edge Function através da Admin API.
  delete from public.student_profiles where id = target_student_id;
  delete from public.profiles where id = target_profile_id;

  return target_profile_id;
end;
$$;

revoke all on function public.hard_delete_student_data(uuid) from public;
revoke execute on function public.hard_delete_student_data(uuid) from anon;
revoke execute on function public.hard_delete_student_data(uuid) from authenticated;
grant execute on function public.hard_delete_student_data(uuid) to service_role;

commit;
