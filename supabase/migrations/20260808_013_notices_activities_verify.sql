-- Verificação Migration 013
select table_name from information_schema.tables
where table_schema='public' and table_name in ('app_notices','activities','activity_registrations')
order by table_name;

select routine_name from information_schema.routines
where routine_schema='public' and routine_name in ('register_for_activity','cancel_activity_registration')
order by routine_name;

select count(*) as avisos from public.app_notices;
select count(*) as atividades from public.activities;
select count(*) as inscricoes from public.activity_registrations;
