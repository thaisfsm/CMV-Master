# Ambiente de preview (teste)

O preview do PR #2 usa um Supabase de **teste**, isolado da produção.

- Projeto Supabase de teste: `cmv-mestre-teste` (organização própria, plano grátis).
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` na Vercel valem **apenas** para o ambiente Preview da branch `claude/project-thread-lmukz7`. Produção e as demais branches não foram alteradas.
- Dados: somente fictícios, marcados como DEMONSTRAÇÃO ("Pizzaria Demonstração (fictícia)"). A Pizzaria Enrico não existe nesse banco.
- Instalação do banco: `supabase/demo/build-test-bundle.mjs` gera o SQL (todas as migrations do repositório + dados de demonstração). O SQL gerado contém a senha de demonstração e não deve ser comitado.
- O preview fica atrás da proteção de acesso da Vercel; só entra quem tem login no time.
