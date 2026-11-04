-- Keep existing student access until the assigned pilot manager changes it.
create table public.student_module_permissions (
 owner_id uuid not null references public.profiles(id), student_id uuid not null references public.student_profiles(id),
 agenda_enabled boolean not null default true, payments_enabled boolean not null default true,
 updated_at timestamptz not null default now(), primary key(owner_id,student_id)
);
create index student_module_permissions_student on public.student_module_permissions(student_id);
alter table public.student_module_permissions enable row level security;
revoke all on public.student_module_permissions from anon,authenticated;

create function public.student_module_can_read(p_owner uuid,p_student uuid,p_module text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_module in ('agenda','payments') and exists(
 select 1 from public.payment_managers m join public.profiles owner on owner.id=m.profile_id
 join public.trainer_profiles tp on tp.profile_id=m.profile_id
 join public.trainer_students ts on ts.trainer_id=tp.id and ts.ended_at is null
 join public.student_profiles s on s.id=ts.student_id
 join public.profiles viewer on viewer.id=auth.uid()
 left join public.student_module_permissions permissions on permissions.owner_id=m.profile_id and permissions.student_id=s.id
 where m.enabled and m.profile_id=p_owner and owner.is_active and owner.deleted_at is null
 and s.id=p_student and s.deleted_at is null and viewer.is_active and viewer.deleted_at is null
 and (auth.uid()=p_owner or (auth.uid()=s.profile_id and
 case when p_module='agenda' then coalesce(permissions.agenda_enabled,true) else coalesce(permissions.payments_enabled,true) end)))
$$;
create or replace function public.payment_can_read(p_owner uuid,p_student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.student_module_can_read(p_owner,p_student,'payments')
$$;
create function public.student_module_access(p_module text) returns text
language sql stable security definer set search_path='' as $$
 select case when p_module not in ('agenda','payments') or p_module is null then 'none'
 when public.payment_can_manage() then 'manage'
 when exists(select 1 from public.student_profiles s join public.payment_managers m on m.enabled
 where s.profile_id=auth.uid() and public.student_module_can_read(m.profile_id,s.id,p_module)) then 'read' else 'none' end
$$;
create or replace function public.payment_access() returns text language sql stable security definer set search_path='' as $$
 select public.student_module_access('payments')
$$;
alter policy pack_read on public.pt_packs using(public.student_module_can_read(owner_id,student_id,'agenda'));
alter policy attendance_read on public.pt_attendance using(public.student_module_can_read(owner_id,student_id,'agenda'));
create or replace function public.pt_session_read(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pt_attendance a where a.session_id=p_id and public.student_module_can_read(a.owner_id,a.student_id,'agenda'))
$$;
create function public.get_student_module_permissions(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_student is null or not public.payment_can_manage(p_student) then raise exception 'Sem permissão para gerir os acessos deste aluno.' using errcode='42501'; end if;
 select jsonb_build_object('agenda',agenda_enabled,'payments',payments_enabled) into result
 from public.student_module_permissions where owner_id=auth.uid() and student_id=p_student;
 return coalesce(result,'{"agenda":true,"payments":true}'::jsonb);
end $$;
create function public.set_student_module_permissions(p_student uuid,p_agenda boolean,p_payments boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_student is null or not public.payment_can_manage(p_student) then raise exception 'Sem permissão para gerir os acessos deste aluno.' using errcode='42501'; end if;
 if p_agenda is null or p_payments is null then raise exception 'Escolhe o acesso a cada secção.'; end if;
 insert into public.student_module_permissions(owner_id,student_id,agenda_enabled,payments_enabled)
 values(auth.uid(),p_student,p_agenda,p_payments)
 on conflict(owner_id,student_id) do update set agenda_enabled=excluded.agenda_enabled,payments_enabled=excluded.payments_enabled,updated_at=now();
end $$;
revoke all on function public.student_module_can_read(uuid,uuid,text),public.student_module_access(text),public.get_student_module_permissions(uuid),public.set_student_module_permissions(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.student_module_can_read(uuid,uuid,text),public.student_module_access(text),public.get_student_module_permissions(uuid),public.set_student_module_permissions(uuid,boolean,boolean) to authenticated;
