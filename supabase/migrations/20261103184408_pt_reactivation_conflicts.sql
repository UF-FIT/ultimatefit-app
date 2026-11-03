create or replace function public.pt_mark_attendance(p_session uuid,p_student uuid,p_status text,p_deduct boolean,p_pack uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare a public.pt_attendance; p public.pt_packs; used integer; charge boolean;
begin
 if p_student is null or not public.payment_can_manage(p_student) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pt:'||auth.uid()::text,0));
 select * into a from public.pt_attendance where session_id=p_session and student_id=p_student for update;
 if not found or a.owner_id<>auth.uid() then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if a.version is distinct from p_version then raise exception 'A presença mudou. Atualiza a agenda antes de guardar.'; end if;
 if p_status is null or p_status not in ('booked','present','absent','cancelled') then raise exception 'Estado inválido.'; end if;
 if a.status='cancelled' and p_status<>'cancelled' and exists(
  select 1 from public.pt_sessions s join public.pt_sessions other on other.owner_id=s.owner_id and other.id<>s.id
  where s.id=p_session and other.starts_at<s.starts_at+make_interval(mins=>s.duration)
  and other.starts_at+make_interval(mins=>other.duration)>s.starts_at
  and exists(select 1 from public.pt_attendance member where member.session_id=other.id and member.status<>'cancelled')
 ) then raise exception 'Conflito de horário: não é possível reativar esta sessão.'; end if;
 if p_status in ('present','absent') and (select starts_at from public.pt_sessions where id=p_session)>now() then raise exception 'Não podes registar presença ou falta antes da sessão.'; end if;
 if p_status in ('absent','cancelled') and p_deduct is null then raise exception 'Decide se descontas a sessão.'; end if;
 charge:=case when p_status='present' then p_pack is not null when p_status='booked' then false else p_deduct end;
 if charge and p_pack is null then raise exception 'Seleciona o pack a descontar.'; end if;
 if p_pack is not null then
  select * into p from public.pt_packs where id=p_pack for update;
  if not found or p.student_id<>p_student or p.owner_id<>auth.uid() then raise exception 'Pack inválido.'; end if;
  if charge then
   if (select status from public.student_payments where id=p.payment_id)='cancelled' then raise exception 'O pagamento deste pack foi anulado.'; end if;
   select count(*) into used from public.pt_attendance where pack_id=p_pack and deduct and not(session_id=p_session and student_id=p_student);
   if used>=p.total then raise exception 'Este pack não tem sessões disponíveis. Associa outro pack.'; end if;
  end if;
 end if;
 update public.pt_attendance set status=p_status,deduct=charge,pack_id=p_pack,version=version+1,updated_at=now()
 where session_id=p_session and student_id=p_student;
end $$;
