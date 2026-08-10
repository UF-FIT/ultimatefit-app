-- Migration 021: PAR-Q não bloqueia a publicação da avaliação física
--
-- O PAR-Q continua obrigatório para o ALUNO no primeiro acesso à ULTIMATE FIT APP,
-- através do onboarding existente. O professor pode, no entanto, criar e publicar
-- a avaliação física independentemente de o aluno já ter concluído o PAR-Q.
-- Isto evita bloquear uma avaliação presencial quando o aluno ainda não acedeu à APP.

begin;

-- Remove apenas a regra que condicionava a primeira publicação ao PAR-Q.
-- As tabelas, submissões, histórico, RLS e onboarding do PAR-Q permanecem intactos.
drop trigger if exists physical_assessments_require_parq
on public.physical_assessments;

commit;
