-- ULTIMATE FIT APP
-- Migration 008A: revisão jurídica da redação PAR-Q / declaração de responsabilidade
-- Não apaga submissões anteriores. Cria uma nova versão ativa do documento.

begin;

update public.parq_versions
set is_active = false
where is_active = true;

insert into public.parq_versions (
  version_code,
  title,
  intro_text,
  questions,
  declaration_text,
  is_active,
  activated_at
)
values (
  'UF-PARQ-2026-02',
  'PAR-Q · Questionário de Prontidão para Atividade Física',
  'Este questionário destina-se à triagem pré-participação e ajuda a identificar situações em que poderá ser aconselhável obter orientação de um profissional de saúde ou rever a prática com o profissional de exercício antes de iniciar ou aumentar a atividade física. Não constitui diagnóstico, exame médico nem substitui aconselhamento clínico.',
  jsonb_build_array(
    jsonb_build_object('id','q1','text','O seu médico já lhe comunicou que possui problemas cardiovasculares e que apenas deve praticar atividade física mediante supervisão médica?'),
    jsonb_build_object('id','q2','text','Sente dores no peito quando pratica atividade física?'),
    jsonb_build_object('id','q3','text','No último mês, sentiu dores no peito quando NÃO estava a praticar atividade física?'),
    jsonb_build_object('id','q4','text','Alguma vez perdeu o equilíbrio devido a tonturas ou alguma vez perdeu a consciência?'),
    jsonb_build_object('id','q5','text','Tem algum problema ósseo ou muscular que possa ser agravado com o início da prática de atividades físicas?'),
    jsonb_build_object('id','q6','text','O seu médico prescreveu-lhe algum medicamento para pressão arterial ou doença cardíaca?'),
    jsonb_build_object('id','q7','text','Tem conhecimento, por informação médica ou por experiência própria, de algum motivo que possa impedir a prática de atividade física sem supervisão médica?')
  ),
  'Eu, {{student_name}}, declaro que respondi de forma verdadeira e completa às questões apresentadas e que, tanto quanto é do meu conhecimento, a informação prestada corresponde à minha situação atual.\n\nNos termos do artigo 40.º, n.º 2, da Lei n.º 5/2007, de 16 de janeiro (Lei de Bases da Atividade Física e do Desporto), nas atividades físicas e desportivas não abrangidas pelo regime federado constitui especial obrigação do praticante assegurar-se previamente de que não possui contraindicações para a sua prática.\n\nCompreendo que este questionário e a intervenção do profissional de exercício não constituem diagnóstico médico nem substituem consulta, avaliação ou aconselhamento de um profissional de saúde. Caso alguma resposta, sintoma, condição de saúde ou alteração relevante o justifique, comprometo-me a informar o professor responsável e a obter avaliação clínica quando recomendada.\n\nDeclaro participar voluntariamente nas atividades propostas e comprometo-me a respeitar as orientações de segurança e a comunicar de imediato qualquer dor, mal-estar, tontura, dificuldade respiratória ou outro sintoma anormal durante a prática.\n\nA presente declaração não exclui nem limita quaisquer direitos que me assistam por lei, nem a responsabilidade legal da ULTIMATE FIT ou dos seus profissionais.',
  true,
  now()
);

commit;
