# ULTIMATE FIT APP — MVP v0.2

Versão ligada ao Supabase com autenticação real e perfil Admin.

## Já funcional
- Login com email e palavra-passe através do Supabase Auth
- Leitura segura do perfil em `public.profiles`
- Reconhecimento dos papéis Admin, Professor e Aluno
- Sessão persistente e logout
- Interface completa do MVP anterior
- Dados dos módulos ainda demonstrativos em `localStorage`

## Variáveis necessárias
```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## Desenvolvimento local
```bash
npm install
npm run dev
```

## Estado de segurança
O frontend usa apenas a Publishable Key. A Secret Key nunca deve ser adicionada ao projeto ou à Vercel.

## Próxima fase
Substituir gradualmente os dados demonstrativos por dados reais do Supabase, começando por professores, alunos e atribuições.
