-- Verificação da revisão jurídica PAR-Q 008A
select version_code, title, is_active, activated_at
from public.parq_versions
order by activated_at desc nulls last, created_at desc;

select version_code, intro_text, declaration_text
from public.parq_versions
where version_code = 'UF-PARQ-2026-02';
