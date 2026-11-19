begin;

create or replace function public.hard_delete_student_data(target_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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

  delete from public.audit_logs al
  where al.actor_id = target_profile_id
     or al.entity_id = target_student_id
     or al.entity_id = target_profile_id
     or al.metadata::text like ('%' || target_student_id::text || '%')
     or al.metadata::text like ('%' || target_profile_id::text || '%');

  -- Clear workout result rows before plans and sessions. These rows contain
  -- NO ACTION foreign keys to workout_items, workout_sessions and workout_plans;
  -- deleting a plan first would fail while the student's run history still exists.
  delete from public.workout_run_set_results
  where student_id = target_student_id;

  delete from public.workout_runs
  where student_id = target_student_id;

  delete from public.workout_exercise_loads
  where student_id = target_student_id;

  delete from public.workout_completions
  where student_id = target_student_id;

  -- Remove all other tables with a simple foreign key to student_profiles(id).
  -- This includes trainer_students, assessments, plans, nutrition, PAR-Q,
  -- challenges, payments, registrations, documents and activity logs.
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

  delete from public.student_profiles where id = target_student_id;
  delete from public.profiles where id = target_profile_id;

  return target_profile_id;
end;
$function$;

commit;
