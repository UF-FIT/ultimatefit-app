# ULTIMATE FIT APP — MVP local

Primeira versão navegável para validar arquitetura e fluxos antes de criar Supabase/Vercel.

## Incluído
- Perfis Admin, Professor e Aluno (seletor no topo para teste)
- Dashboard por perfil
- Gestão local de alunos e professores
- Avaliações físicas e histórico
- Evolução com gráficos
- Planos de treino
- Nutrição
- Objetivos
- Desafios
- Biblioteca inicial com 45 exercícios
- Avisos
- Relatórios demonstrativos
- Backoffice e modo Coming Soon
- Manifest PWA
- Estrutura SQL planeada para Supabase

## Testar localmente
```bash
npm install
npm run dev
```

Os dados são guardados no localStorage do navegador apenas para validação do MVP.

## Importante
Não usar com dados reais de alunos nesta fase. A autenticação, Row Level Security, uploads privados, convites por email e PDFs reais serão ligados depois da validação funcional.
