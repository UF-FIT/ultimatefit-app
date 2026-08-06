# ULTIMATE FIT APP — v0.4

Atualização de equipa, hierarquia, convites e recuperação de palavra-passe.

## Hierarquia definitiva

- **Proprietário — Rui Marques**
  - controlo total;
  - pode criar e gerir Administradores globais e Professores;
  - pode desativar ou eliminar o acesso de um Administrador;
  - conta protegida: ninguém o pode desativar, eliminar ou despromover.
- **Administrador global — Manuel e futuros administradores**
  - acesso operacional completo ao backoffice;
  - pode criar, gerir, desativar e eliminar Professores;
  - não pode criar outro Administrador global;
  - não pode gerir o Proprietário.
- **Professor**
  - vê apenas alunos atribuídos;
  - recebe permissões individuais;
  - não acede a planos privados de outros Professores.
- **Aluno**
  - acede apenas aos próprios dados.

A regra é aplicada também na Edge Function e na base de dados, não apenas na interface.

## Funcional nesta versão

- Login real pelo Supabase Auth
- “Esqueci-me da palavra-passe”
- Página para definir nova palavra-passe
- Ativação de conta através de convite
- Gestão real da equipa
- Convite por email para Professor ou Administrador global
- Permissões individuais de Professores
- Desativação e reativação
- Remoção segura de acesso, preservando autoria e histórico
- Rotas Vercel para convite e recuperação

## Ainda demonstrativo

Os módulos de alunos, avaliações, planos, nutrição, objetivos, desafios e relatórios continuam parcialmente em `localStorage`. A separação definitiva dos planos por autor será aplicada quando as tabelas reais de treino forem implementadas.

## Variáveis Vercel

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Nunca colocar uma Secret Key no frontend, GitHub ou Vercel.

## Instalação

Consultar `INSTALL_UPDATE_V4.txt`.
