# CMV Mestre

Aplicação SaaS em construção para implantação e gestão de CMV em negócios gastronômicos. A base usa Next.js/React/TypeScript e Supabase Auth + PostgreSQL com Row Level Security (RLS).

## Estado do projeto

Funcional: autenticação por e-mail/senha com sessão persistente, espaço da Pizzaria Enrico com seis etapas, visitas com histórico, diagnóstico de 15 tópicos com grau de confirmação, situação e histórico de versões, fotos e documentos em armazenamento privado, tarefas com responsável, prazo e status, Consultor CMV por regras a partir dos registros, relatório da visita (imprimir/PDF), Central técnica e cálculos determinísticos. Indicadores financeiros ficam vazios até existirem dados reais.

Compras e estoque, perdas, treinamentos e vendas existem no banco, mas ainda não têm telas. Não são simulados. A logo oficial está em `public/logo-cmv-mestre.png`.

Auditoria, matriz de requisitos, capturas e guia da consultora: pasta `auditoria/`.

## Requisitos

- Node.js 20.9 ou mais recente
- Projeto Supabase
- Variáveis de ambiente em `.env.local` conforme `.env.example`

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Crie uma conta; se a confirmação de e-mail estiver ativa no Supabase, confirme o endereço e entre. O primeiro acesso inicializa o workspace Enrico. As migrations ficam em `supabase/migrations/` e sobem do zero com `npx supabase start` (Supabase local).

## Testes e build

```bash
npm test                 # cálculos, diagnóstico, consultor e relatório
npm run build
# Com Supabase local (nunca a produção):
SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=<chave local> npm run test:integration
NODE_PATH=$(npm root -g) npm run test:e2e   # Playwright; gera capturas em auditoria/capturas/<data>
```

## Banco, isolamento e dados

O banco em nuvem é a fonte oficial dos dados. O armazenamento local do navegador é usado somente pela sessão de autenticação gerenciada pelo Supabase. Todas as tabelas pertencem a uma organização e ativam RLS. A função `start_initial_workspace` cria organização, associação do primeiro usuário, Enrico, etapas, tarefas e evento de auditoria numa transação.

O bucket privado `cmv-evidence` guarda arquivos em `organização/estabelecimento/visita/`; a leitura é por link assinado temporário. A rotina de backup ainda precisa ser definida no Supabase. Não habilite dados de produção antes de validar as políticas RLS e a estratégia de recuperação no projeto escolhido. A chave `anon` é pública por desenho e depende das políticas RLS; nunca use uma `service_role` no navegador.

## Publicação

Conecte o repositório ao Vercel, configure as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no ambiente de produção e aplique a migration no Supabase. O build é `npm run build`. Configure a URL pública também nas URLs permitidas de autenticação do Supabase.

## Continuidade

O repositório é independente do Codex. Para continuar com Claude Code, clone o repositório, leia este README e `.env.example`, instale dependências e use o projeto Supabase configurado. Não comite arquivos `.env*`.
