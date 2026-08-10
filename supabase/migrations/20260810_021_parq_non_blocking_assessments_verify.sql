-- Deve devolver 0 linhas: já não pode existir trigger a bloquear a avaliação física.
select
  tgname as trigger_name,
  pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.physical_assessments'::regclass
  and not tgisinternal
  and tgname = 'physical_assessments_require_parq';

-- Deve devolver pelo menos a versão ativa do PAR-Q, confirmando que o onboarding
-- e o questionário continuam instalados.
select version_code, title, is_active
from public.parq_versions
where is_active = true;
