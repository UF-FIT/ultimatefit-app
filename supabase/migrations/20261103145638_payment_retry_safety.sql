alter table public.student_payments add column request_id uuid not null default gen_random_uuid();
alter table public.student_payments add constraint payment_request_unique unique(owner_id,request_id);
create or replace function public.payment_save(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()); v_old public.student_payments;
 v_student uuid:=(p_data->>'student_id')::uuid; v_status text:=p_data->>'status';
begin
 if not public.payment_can_manage(v_student) then raise exception 'Sem permissão para gerir este aluno.' using errcode='42501'; end if;
 if v_status not in ('pending','paid','cancelled') then raise exception 'Estado inválido.'; end if;
 if v_status='paid' and (p_data->>'paid_on')::date>(now() at time zone 'Europe/Lisbon')::date then raise exception 'A data do pagamento não pode ser futura.'; end if;
 if nullif(p_data->>'id','') is null then
  if nullif(p_data->>'request_id','') is null then raise exception 'Identificador do pedido em falta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || (p_data->>'request_id'),0));
  select * into v_old from public.student_payments where owner_id=auth.uid() and request_id=(p_data->>'request_id')::uuid;
  if found then return v_old.id; end if;
 end if;
 if nullif(p_data->>'id','') is not null then
  select * into v_old from public.student_payments where id=v_id for update;
  if not found or v_old.owner_id<>auth.uid() or v_old.student_id<>v_student then raise exception 'Pagamento não disponível.' using errcode='42501'; end if;
  if v_old.version is distinct from (p_data->>'version')::integer then raise exception 'Este pagamento foi alterado. Atualiza a página antes de guardar.'; end if;
  if v_old.status='cancelled' then raise exception 'Um registo anulado não pode ser alterado.'; end if;
  update public.student_payments set kind=p_data->>'kind',amount_cents=(p_data->>'amount_cents')::integer,
   period=(p_data->>'period')::date,due_on=(p_data->>'due_on')::date,status=v_status,
   paid_on=case when v_status='paid' then (p_data->>'paid_on')::date end,
   method=case when v_status='paid' then p_data->>'method' end,
   receipt_reference=coalesce(p_data->>'receipt_reference',''),description=coalesce(p_data->>'description',''),
   version=version+1,updated_at=now() where id=v_id;
 else
  insert into public.student_payments(id,request_id,owner_id,student_id,kind,amount_cents,period,due_on,status,paid_on,method,receipt_reference,description)
  values(v_id,(p_data->>'request_id')::uuid,auth.uid(),v_student,p_data->>'kind',(p_data->>'amount_cents')::integer,(p_data->>'period')::date,
   (p_data->>'due_on')::date,v_status,case when v_status='paid' then (p_data->>'paid_on')::date end,
   case when v_status='paid' then p_data->>'method' end,coalesce(p_data->>'receipt_reference',''),coalesce(p_data->>'description',''));
 end if;
 return v_id;
end $$;
