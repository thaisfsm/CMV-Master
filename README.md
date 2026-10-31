# CMV Mestre

Aplicação SaaS em construção para implantação e gestão de CMV em negócios gastronômicos. A base usa Next.js/React/TypeScript e Supabase Auth + PostgreSQL com Row Level Security (RLS).

## Estado do projeto

O primeiro incremento contém autenticação por e-mail/senha, inicialização do espaço da Pizzaria Enrico com os dados fornecidos, seis etapas, roteiro diagnóstico com respostas persistidas e marcadas como declaradas, tarefas, cadastros conectados de produtos/ingredientes/fornecedores/receitas e cálculos determinísticos de conversão/custos. Indicadores financeiros ficam vazios até existirem dados reais.

Compras, estoque, perdas, treinamento, fichas técnicas, PDFs, evidências em storage e relatórios ainda não têm telas funcionais. Não são simulados. A logo oficial está em `public/logo-cmv-mestre.png`.

## Requisitos

- Node.js 20.9 ou mais recente
- Projeto Supabase
- Variáveis de ambiente em `.env.local` conforme `.env.example`

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Crie uma conta; se a confirmação de e-mail estiver ativa no Supabase, confirme o endereço e entre. O primeiro acesso inicializa o workspace Enrico. Aplique antes a migration `supabase/migrations/202610310001_initial_schema.sql` no projeto Supabase.

## Testes e build

```bash
npm test
npm run build
```

## Banco, isolamento e dados

O banco em nuvem é a fonte oficial dos dados. O armazenamento local do navegador é usado somente pela sessão de autenticação gerenciada pelo Supabase. Todas as tabelas pertencem a uma organização e ativam RLS. A função `start_initial_workspace` cria organização, associação do primeiro usuário, Enrico, etapas, tarefas e evento de auditoria numa transação.

O bucket de arquivos, políticas de upload e rotina de backup ainda precisam ser configurados no Supabase. Não habilite dados de produção antes de validar as políticas RLS e a estratégia de recuperação no projeto escolhido. A chave `anon` é pública por desenho e depende das políticas RLS; nunca use uma `service_role` no navegador.

## Publicação

Conecte o repositório ao Vercel, configure as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no ambiente de produção e aplique a migration no Supabase. O build é `npm run build`. Configure a URL pública também nas URLs permitidas de autenticação do Supabase.

## Continuidade

O repositório é independente do Codex. Para continuar com Claude Code, clone o repositório, leia este README e `.env.example`, instale dependências e use o projeto Supabase configurado. Não comite arquivos `.env*`.
