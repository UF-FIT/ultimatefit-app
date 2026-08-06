# ULTIMATE FIT APP — Update 5A

Módulo real de **Alunos**, ligado ao Supabase e preparado para as fases seguintes de Avaliação Física, Planos de Treino e Plano Alimentar.

## Incluído nesta versão

- alunos reais no Supabase, sem dados fictícios na listagem;
- criação de conta e convite por email;
- fotografia automaticamente recortada, redimensionada e convertida para WebP;
- imagem de perfil 512 × 512 e miniatura 128 × 128;
- armazenamento privado com URLs temporários;
- atribuição pelo estúdio a um ou vários professores;
- professor principal obrigatório, com WhatsApp profissional registado;
- Proprietário e Administradores veem todos os alunos;
- Professor comum vê apenas alunos atribuídos;
- o aluno nunca pode escolher ou alterar o professor;
- listagem simplificada: fotografia, nome, idade e data de nascimento;
- perfil do aluno com ações rápidas, WhatsApp, envio das instruções da app e estado de acesso;
- edição de dados pessoais e administrativos;
- desativação, reativação, arquivo e remoção segura com histórico preservado;
- seleção e ações em vários alunos;
- vista própria do aluno com Editar perfil, WhatsApp do professor, Avaliação Física, Plano de Treino e Plano Alimentar;
- espaço reservado para o gráfico das últimas avaliações, a ligar no Update 5B.

## Segurança

- As políticas RLS limitam a leitura aos perfis autorizados.
- As alterações sensíveis são feitas pela Edge Function `manage-student`.
- O navegador não tem permissão direta para inserir, alterar ou eliminar registos em `student_profiles`.
- As fotografias ficam no bucket privado `student-avatars`.
- A eliminação na interface é uma remoção segura: bloqueia o acesso e retira as atribuições, sem apagar silenciosamente o histórico.

## Hierarquia

- **Proprietário:** vê e gere tudo.
- **Administrador global:** vê e gere todos os alunos.
- **Professor:** vê apenas alunos atribuídos e depende das permissões concedidas.
- **Aluno:** vê apenas o próprio perfil e não altera a atribuição de professores.

## Instalação

Segue `INSTALL_UPDATE_V5A.txt` pela ordem indicada.

## Próximas fases

- **Update 5B:** avaliações físicas modulares, perimetria, dobras cutâneas, TANITA, análise postural, fotografias, gráficos e relatórios.
- **Update 5C:** primeiro acesso, anamnese inicial, questionário de prontidão/consentimentos e documentos assinados. O conteúdo oficial PAR-Q+ só será integrado após confirmação da licença adequada.
