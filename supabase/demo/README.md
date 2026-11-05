# Ambiente de teste (demonstração)

`build-test-bundle.mjs` gera um único SQL para instalar num projeto Supabase **de teste**, novo e vazio:
todas as migrations de `supabase/migrations/`, dados fictícios marcados como DEMONSTRAÇÃO e um login de demonstração.

```bash
DEMO_PASSWORD='senha-forte-de-teste' node supabase/demo/build-test-bundle.mjs > instalar_ambiente_teste.sql
```

- O arquivo gerado contém a senha de demonstração: não comitar.
- Recusa executar se o banco tiver a Pizzaria Enrico (proteção contra rodar na produção).
- Reexecutável: migrations já aplicadas são puladas e os dados usam `on conflict do nothing`.
- Somente no teste, `start_initial_workspace` cria um estabelecimento fictício em vez da Enrico.
