# ULTIMATE FIT App — versão final desta fase

Esta versão está preparada para ser instalada em `app.ultimatefit.pt` como projeto separado do site principal `ultimatefit.pt`.

## Alterações desta versão

- Removida a área de horários/treinos presenciais.
- Página pública **Coming Soon** com countdown de 30 dias.
- Coming Soon com foco em: Planos de Treino, Nutrição, Avaliações e Relatórios.
- Login protegido para a área em construção.
- Backoffice com opção para ativar/desativar Coming Soon.
- Design alinhado com a identidade ULTIMATE FIT: preto, amarelo `#ffd908`, Bebas Neue para títulos e Montserrat para texto.
- Perfis: Admin, Professor e Aluno.
- Gestão de professores.
- Gestão de alunos.
- Planos de treino.
- Biblioteca de exercícios dividida por grupos musculares.
- Nutrição / planos alimentares.
- Avaliações físicas.
- Relatórios automáticos.
- PWA/manifest para instalação no telemóvel.

## Instalar localmente

```bash
npm install
npm run dev
```

Abre o link mostrado no terminal, normalmente:

```text
http://localhost:5173
```

## Variáveis de ambiente

Cria um ficheiro `.env` com base em `.env.example`:

```bash
cp .env.example .env
```

Preenche:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Notas:

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` são usadas no frontend.
- `SUPABASE_SERVICE_ROLE_KEY` só deve ficar no ambiente do servidor/Vercel, nunca exposta no frontend.

## Supabase

1. Cria um projeto em Supabase.
2. Vai a SQL Editor.
3. Executa o ficheiro:

```text
supabase/schema.sql
```

Isto cria as tabelas principais e políticas iniciais de segurança.

## Deploy no Vercel

1. Cria um novo repositório GitHub, por exemplo `ultimatefit-app`.
2. Envia estes ficheiros para o repositório.
3. No Vercel, cria um novo projeto e importa esse repositório.
4. Framework: Vite.
5. Build command: `npm run build`.
6. Output directory: `dist`.
7. Adiciona as variáveis de ambiente no Vercel.
8. Faz deploy.

## Subdomínio

Depois do projeto estar online no Vercel:

1. Abre o projeto no Vercel.
2. Vai a **Settings → Domains**.
3. Adiciona `app.ultimatefit.pt`.
4. Segue exatamente os registos DNS indicados pela Vercel.

## Coming Soon

Por defeito, a app mostra a página Coming Soon ao público.

Para entrar na área privada:

1. Clica em **Login**.
2. Entra em modo demo ou com Supabase configurado.
3. Vai a **Definições**.
4. Desativa **Mostrar Coming Soon ao público** quando a app estiver pronta.

## Próximas melhorias recomendadas

- Ligar totalmente formulários ao Supabase.
- Criar autenticação real por perfis.
- Fazer upload privado de PDFs e fotos.
- Gerar PDFs de relatórios com template ULTIMATE FIT.
- Criar convites reais por email para professores e alunos.
- Criar páginas individuais de aluno.
- Adicionar GIFs próprios/autorizados à biblioteca de exercícios.
