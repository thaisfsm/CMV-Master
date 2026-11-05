-- Verificação do schema DEPOIS de aplicar 20261104120000_operational_sprint.sql na produção.
-- Somente leitura. Rode no SQL Editor e compare linha a linha com os valores esperados abaixo.
-- Valores esperados (gerados a partir das 9 migrations do repositório, em banco limpo):
--   buckets 1 34ce5e9cbbda42c3cb07bc06f5007e71
--   colunas 256 8a326d84a7a5f1ff4714ae3310859f77
--   funcoes 17 a70447d650d000ac3ab1a0985f230fc3
--   gatilhos 60 f8eda7c44981ad0ed5e31688ee689f86
--   grants_funcoes 17 9055331fc323f199915e16a877326ed5
--   grants_tabelas 546 380476a4c4a829abeaebf0d69b222644
--   indices 33 c54a79da8261a8035fc1704ef58c2f18
--   politicas 93 632e63a06a22a67fb88c410bfb5b67ef
--   restricoes 123 b265f2d7a65969b3c60c18e52e28cf95
--   rls 25 1d9789fb18e7f2a5a80897b291e5bced
--   views 1 e5976de87fd6a034222dda20c7f6ceda
-- Antes da migration, a produção deve dar os valores do backup (ver backup_LEIA-ME.md).
with
cols as (select string_agg(format('%s.%s.%s:%s:%s:%s', table_schema, table_name, column_name, data_type, is_nullable, coalesce(column_default,'')), E'\n' order by table_schema, table_name, column_name) s, count(*) n
  from information_schema.columns where table_schema in ('public','private')),
cons as (select string_agg(format('%s.%s:%s', n.nspname, c.conname, pg_get_constraintdef(c.oid)), E'\n' order by n.nspname, c.conname) s, count(*) n
  from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private')),
idx as (select string_agg(indexdef, E'\n' order by indexname) s, count(*) n from pg_indexes where schemaname in ('public','private')),
pol as (select string_agg(format('%s.%s.%s:%s:%s:%s:%s', schemaname, tablename, policyname, cmd, roles, coalesce(qual,''), coalesce(with_check,'')), E'\n' order by schemaname, tablename, policyname) s, count(*) n
  from pg_policies where schemaname in ('public','private','storage')),
fns as (select string_agg(pg_get_functiondef(p.oid), E'\n' order by n.nspname, p.proname) s, count(*) n
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
trg as (select string_agg(pg_get_triggerdef(t.oid), E'\n' order by t.tgname) s, count(*) n
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private')),
vws as (select string_agg(format('%s.%s:%s', schemaname, viewname, definition), E'\n' order by viewname) s, count(*) n from pg_views where schemaname in ('public','private')),
rls as (select string_agg(format('%s.%s:%s:%s', n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity), E'\n' order by c.relname) s, count(*) n
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private')),
grt as (select string_agg(format('%s.%s:%s:%s', table_schema, table_name, grantee, privilege_type), E'\n' order by table_schema, table_name, grantee, privilege_type) s, count(*) n
  from information_schema.role_table_grants where table_schema in ('public','private') and grantee in ('anon','authenticated','service_role','public')),
fgr as (select string_agg(format('%s.%s:%s', n.nspname, p.proname, coalesce(p.proacl::text,'default')), E'\n' order by n.nspname, p.proname) s, count(*) n
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
bkt as (select string_agg(format('%s:%s:%s:%s', id, public, file_size_limit, allowed_mime_types), E'\n' order by id) s, count(*) n from storage.buckets)
select k, n, md5(coalesce(s,'')) from (values ('colunas',(select n from cols),(select s from cols)),('restricoes',(select n from cons),(select s from cons)),
 ('indices',(select n from idx),(select s from idx)),('politicas',(select n from pol),(select s from pol)),('funcoes',(select n from fns),(select s from fns)),
 ('gatilhos',(select n from trg),(select s from trg)),('views',(select n from vws),(select s from vws)),('rls',(select n from rls),(select s from rls)),
 ('grants_tabelas',(select n from grt),(select s from grt)),('grants_funcoes',(select n from fgr),(select s from fgr)),('buckets',(select n from bkt),(select s from bkt))) v(k,n,s) order by k;
