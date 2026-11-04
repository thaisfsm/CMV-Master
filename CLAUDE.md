# CMV Mestre — guia para sessões do Claude Code

@AGENTS.md

Repositório: `thaisfsm/CMV-Master`. Não confundir com CMV Enrico, CrediAI, NICO ou Link Finance.
A "Pizzaria Enrico" aparece aqui apenas como primeiro cliente (estabelecimento) criado pela função
`start_initial_workspace`; não é o projeto CMV Enrico.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, aplicação client-side (`app/page.tsx`).
- Supabase Auth (e-mail/senha) + PostgreSQL com RLS por organização (`supabase/migrations/`).
- Cálculos de CMV puros em `lib/cmv.mjs`, testados com `node --test`.
- Identidade visual: `app/globals.css`, `components/BrandLockup.tsx`, `public/logo-cmv-mestre.png`. Preservar.

## Comandos

```bash
npm ci          # instala exatamente o package-lock.json
npm test        # testes de cálculo
npm run build   # build de produção (funciona sem variáveis; a tela pede configuração do Supabase)
npm run dev     # http://localhost:3000
```

Sem `.env.local`, o app abre na tela "Conecte o banco de dados". Variáveis em `.env.example`;
nunca comitar `.env*` nem usar `service_role` no navegador.

## Publicação

- Vercel: projeto `cmv-mestre-thais` (time `linkconsignados26-2410`), ligado a este repositório.
  Push em `main` gera deploy de produção; outras branches geram preview.
- O projeto Vercel `cmv-mestre` (sem repositório, sem deploys) é um duplicado vazio; não publicar nele.

## Regras

- Trabalhar em branch própria; `main` só via pull request.
- `supabase/migrations/`: as 7 migrations de `20261031211507` em diante são cópias exatas (conferidas por MD5) das aplicadas no banco `cmv-mestre`. `202610310001_initial_schema.sql` difere da `initial_schema` remota (`20261031211139`); reconciliar antes de recriar o banco do zero.
- Não aplicar migrations nem alterar Supabase/Vercel remotos sem autorização da Thaís.
- Não simular dados: módulos sem backend mostram estado vazio de propósito.
