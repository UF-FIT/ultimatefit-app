begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','392fe540-ed9b-4548-9051-2f43405f11cc',true);
do $$
declare sid uuid:='a2b9b839-7c0f-4e44-9e56-41d5ca5f9f5d'; pack uuid; pay uuid; ses uuid; a boolean; p boolean; denied boolean;
begin
 pack:=public.pt_create_pack(jsonb_build_object('request_id',gen_random_uuid(),'student_id',sid,'title','QA permissions','total',3,'amount_cents',1000,'due_on','2020-01-01'));
 select payment_id into pay from public.pt_packs where id=pack;
 ses:=public.pt_save_session(jsonb_build_object('request_id',gen_random_uuid(),'starts_local','2019-01-07T04:00','duration',5,'kind','individual','participants',jsonb_build_array(jsonb_build_object('student_id',sid,'pack_id',pack))));
 foreach a in array array[false,true] loop
 foreach p in array array[false,true] loop
  perform set_config('request.jwt.claim.sub','392fe540-ed9b-4548-9051-2f43405f11cc',true);
  perform public.set_student_module_permissions(sid,a,p);
  if public.student_module_access('agenda')<>'manage' or public.payment_access()<>'manage' then raise exception 'Manager lost access'; end if;
  if not exists(select 1 from public.student_payments where id=pay) or not exists(select 1 from public.pt_sessions where id=ses) then raise exception 'Manager rows hidden'; end if;
  perform set_config('request.jwt.claim.sub','64e4e12e-a03a-46d6-b213-2e1cde6a029d',true);
  if (public.student_module_access('agenda')='read')<>a or (public.payment_access()='read')<>p then raise exception 'Access mode mismatch'; end if;
  if exists(select 1 from public.student_payments where id=pay)<>p then raise exception 'Payment RLS mismatch'; end if;
  if exists(select 1 from public.pt_packs where id=pack)<>a or exists(select 1 from public.pt_sessions where id=ses)<>a then raise exception 'Agenda RLS mismatch'; end if;
  if exists(select 1 from public.pt_attendance where session_id=ses)<>a then raise exception 'Attendance RLS mismatch'; end if;
  if exists(select 1 from jsonb_array_elements(public.pt_snapshot('2019-01-07')->'sessions') x where x->>'id'=ses::text)<>a then raise exception 'Direct snapshot bypass'; end if;
 end loop;end loop;
 denied:=false;
 begin perform public.set_student_module_permissions(sid,true,true);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Student can enable access';end if;
 denied:=false;
 begin perform public.get_student_module_permissions(sid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Student can view teacher settings';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 denied:=false;
 begin perform public.set_student_module_permissions(sid,true,true);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Outsider can enable access';end if;
end $$;
reset role;
select 'PASS: all four independent access combinations, manager access preserved, direct table/RPC restrictions, student and outsider cannot change settings' result;
rollback;
