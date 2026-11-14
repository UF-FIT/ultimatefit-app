-- Configuração explícita de duos para pagamentos. Os valores continuam separados por aluno.
create table public.payment_duos (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 member_a_id uuid not null references public.student_profiles(id),
 member_b_id uuid not null references public.student_profiles(id),
 payment_mode text not null check(payment_mode in ('shared','individual')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(member_a_id < member_b_id)
);
create unique index payment_duos_pair_active on public.payment_duos(owner_id,member_a_id,member_b_id) where active;

create table public.payment_duo_settlements (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 duo_id uuid not null references public.payment_duos(id),
 period date not null check(extract(day from period)=1),
 payment_a_id uuid not null references public.student_payments(id),
 payment_b_id uuid not null references public.student_payments(id),
 request_id uuid not null,
 created_at timestamptz not null default now(),
 check(payment_a_id<>payment_b_id),
 unique(owner_id,request_id),
 unique(duo_id,period),
 unique(payment_a_id),
 unique(payment_b_id)
);
alter table public.student_payments
 add column duo_settlement_id uuid references public.payment_duo_settlements(id);

alter table public.payment_duos enable row level security;
alter table public.payment_duo_settlements enable row level security;
revoke all on public.payment_duos,public.payment_duo_settlements from anon,authenticated;
grant select on public.payment_duos,public.payment_duo_settlements to authenticated;
create policy payment_duos_manager_read on public.payment_duos for select to authenticated
 using(owner_id=auth.uid() and public.payment_can_manage());
create policy payment_duo_settlements_manager_read on public.payment_duo_settlements for select to authenticated
 using(owner_id=auth.uid() and public.payment_can_manage());

create function public.payment_duos_validate_members() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text || ':payment-duos',0));
 if new.member_a_id>=new.member_b_id then raise exception 'Escolhe dois alunos diferentes.'; end if;
 if new.active and exists(
  select 1 from public.payment_duos d
  where d.owner_id=new.owner_id and d.active and d.id<>new.id
  and (d.member_a_id in (new.member_a_id,new.member_b_id) or d.member_b_id in (new.member_a_id,new.member_b_id))
 ) then raise exception 'Um destes alunos já pertence a outro duo de pagamento ativo.'; end if;
 return new;
end $$;
create trigger payment_duos_validate_members before insert or update on public.payment_duos
 for each row execute function public.payment_duos_validate_members();
revoke all on function public.payment_duos_validate_members() from public,anon,authenticated;

create function public.payment_save_duo(p_id uuid,p_student_a uuid,p_student_b uuid,p_mode text,p_active boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_a uuid; v_b uuid; v_old public.payment_duos;
begin
 if not public.payment_can_manage() or not public.payment_can_manage(p_student_a) or not public.payment_can_manage(p_student_b) then
  raise exception 'Sem permissão para gerir estes alunos.' using errcode='42501';
 end if;
 if p_student_a is null or p_student_b is null or p_student_a=p_student_b then raise exception 'Escolhe dois alunos diferentes.'; end if;
 if p_mode not in ('shared','individual') or p_active is null then raise exception 'Configuração do duo inválida.'; end if;
 v_a:=least(p_student_a,p_student_b);
 v_b:=greatest(p_student_a,p_student_b);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':payment-duos',0));
 if p_id is not null then
  select * into v_old from public.payment_duos where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Duo de pagamento não disponível.' using errcode='42501'; end if;
  if (v_old.member_a_id<>v_a or v_old.member_b_id<>v_b) and exists(
   select 1 from public.payment_duo_settlements where duo_id=v_old.id
  ) then raise exception 'Não é possível trocar os alunos de um duo com pagamentos conjuntos registados.'; end if;
  update public.payment_duos set member_a_id=v_a,member_b_id=v_b,payment_mode=p_mode,active=p_active,updated_at=now()
   where id=p_id and owner_id=auth.uid() returning id into v_id;
 else
  select id into v_id from public.payment_duos
   where owner_id=auth.uid() and member_a_id=v_a and member_b_id=v_b
   order by active desc,created_at desc limit 1 for update;
  if found then
   update public.payment_duos set payment_mode=p_mode,active=p_active,updated_at=now()
    where id=v_id and owner_id=auth.uid();
  else
   insert into public.payment_duos(owner_id,member_a_id,member_b_id,payment_mode,active)
   values(auth.uid(),v_a,v_b,p_mode,p_active) returning id into v_id;
  end if;
 end if;
 return v_id;
end $$;

create function public.payment_save_duo_settlement(
 p_id uuid,p_request_id uuid,p_duo_id uuid,p_period date,p_paid_on date,p_method text,p_receipt_reference text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_id uuid; v_a uuid; v_b uuid; v_mode text; v_payment_a public.student_payments;
 v_payment_b public.student_payments; v_settlement public.payment_duo_settlements; v_count integer;
begin
 if not public.payment_can_manage() then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if p_period is null or extract(day from p_period)<>1 then raise exception 'Mês inválido.'; end if;
 if p_paid_on is null or p_paid_on>(now() at time zone 'Europe/Lisbon')::date then raise exception 'A data do pagamento não pode ser futura.'; end if;
 if p_method not in ('mbway','cash','transfer') then raise exception 'Método de pagamento inválido.'; end if;
 if length(coalesce(p_receipt_reference,''))>200 then raise exception 'A referência do recibo é demasiado longa.'; end if;

 if p_id is null then
  if p_request_id is null then raise exception 'Identificador do pedido em falta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':duo-settlement:' || p_request_id::text,0));
  select id into v_id from public.payment_duo_settlements where owner_id=auth.uid() and request_id=p_request_id;
  if found then return v_id; end if;
 end if;

 select member_a_id,member_b_id,payment_mode into v_a,v_b,v_mode
  from public.payment_duos where id=p_duo_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Duo de pagamento não disponível.' using errcode='42501'; end if;
 if not public.payment_can_manage(v_a) or not public.payment_can_manage(v_b) then
  raise exception 'Sem permissão para gerir estes alunos.' using errcode='42501';
 end if;

 if p_id is null then
  if v_mode<>'shared' then raise exception 'Este duo está configurado para pagamentos individuais.'; end if;
  select * into v_payment_a from public.student_payments
   where owner_id=auth.uid() and student_id=v_a and kind='monthly' and period=p_period and status='pending' and duo_settlement_id is null
   for update;
  if not found then raise exception 'A mensalidade do primeiro aluno não está pendente neste mês.'; end if;
  select * into v_payment_b from public.student_payments
   where owner_id=auth.uid() and student_id=v_b and kind='monthly' and period=p_period and status='pending' and duo_settlement_id is null
   for update;
  if not found then raise exception 'A mensalidade do segundo aluno não está pendente neste mês.'; end if;
  insert into public.payment_duo_settlements(owner_id,duo_id,period,payment_a_id,payment_b_id,request_id)
   values(auth.uid(),p_duo_id,p_period,v_payment_a.id,v_payment_b.id,p_request_id) returning id into v_id;
  update public.student_payments set status='paid',paid_on=p_paid_on,method=p_method,
   receipt_reference=coalesce(p_receipt_reference,''),duo_settlement_id=v_id,version=version+1,updated_at=now()
   where owner_id=auth.uid() and id in (v_payment_a.id,v_payment_b.id) and status='pending' and duo_settlement_id is null;
  get diagnostics v_count=row_count;
  if v_count<>2 then raise exception 'Os dois pagamentos deixaram de estar pendentes. Atualiza os dados e tenta novamente.'; end if;
 else
  select * into v_settlement from public.payment_duo_settlements
   where id=p_id and owner_id=auth.uid() for update;
  if not found or v_settlement.duo_id<>p_duo_id or v_settlement.period<>p_period then
   raise exception 'Pagamento conjunto não disponível.' using errcode='42501';
  end if;
  update public.student_payments set paid_on=p_paid_on,method=p_method,
   receipt_reference=coalesce(p_receipt_reference,''),version=version+1,updated_at=now()
   where owner_id=auth.uid() and duo_settlement_id=p_id and status='paid';
  get diagnostics v_count=row_count;
  if v_count<>2 then raise exception 'O pagamento conjunto está incompleto e não pode ser editado.'; end if;
  v_id:=p_id;
 end if;
 return v_id;
end $$;

create or replace function public.payment_save(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_id uuid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
 v_old public.student_payments; v_student uuid:=(p_data->>'student_id')::uuid; v_status text:=p_data->>'status';
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
  if v_old.duo_settlement_id is not null then raise exception 'Este pagamento foi registado em conjunto. Altera-o através do registo do duo.'; end if;
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

revoke all on function public.payment_duos_validate_members(),
 public.payment_save_duo(uuid,uuid,uuid,text,boolean),
 public.payment_save_duo_settlement(uuid,uuid,uuid,date,date,text,text),
 public.payment_save(jsonb) from public,anon;
grant execute on function public.payment_save_duo(uuid,uuid,uuid,text,boolean),
 public.payment_save_duo_settlement(uuid,uuid,uuid,date,date,text,text) to authenticated;