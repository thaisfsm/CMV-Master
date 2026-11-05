// Gera o pacote SQL de um Supabase de TESTE isolado (nunca a produção).
// Uso: DEMO_PASSWORD=... node supabase/demo/build-test-bundle.mjs > instalar_ambiente_teste.sql
// O arquivo gerado contém a senha de demonstração: não comitar.
import { readFileSync, readdirSync } from "node:fs";
import { DIAGNOSTIC_QUESTIONS } from "../../lib/diagnostic.mjs";

const password = process.env.DEMO_PASSWORD;
const email = process.env.DEMO_EMAIL ?? "demonstracao@cmvmestre.teste";
if (!password || password.length < 12) throw new Error("Defina DEMO_PASSWORD (12+ caracteres).");
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const dir = new URL("../migrations/", import.meta.url);
const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const question = (key) => DIAGNOSTIC_QUESTIONS.find((x) => x.key === key).question;

const out = [];
out.push(`-- CMV Mestre · INSTALAÇÃO DO AMBIENTE DE TESTE (DEMONSTRAÇÃO)
-- Executar SOMENTE num projeto Supabase de teste, novo e vazio. NUNCA na produção (cmv-mestre).
-- Cole tudo no SQL Editor e clique em Run. Pode ser executado de novo sem duplicar nada.
-- Conteúdo: ${migrations.length} migrations do repositório + dados fictícios marcados como DEMONSTRAÇÃO
-- + login de demonstração (${email}). Nenhum dado real da Pizzaria Enrico.
do $guard$ begin
  if to_regclass('public.establishments') is not null then
    if (select count(*) from public.establishments e where e.name = 'Pizzaria Enrico') > 0 then
      raise exception 'Este banco contém a Pizzaria Enrico: parece ser a produção. Instalação cancelada.';
    end if;
  end if;
end $guard$;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
`);
for (const file of migrations) {
  const version = file.split("_")[0];
  const sql = readFileSync(new URL(file, dir), "utf8");
  out.push(`-- ===== ${file} =====
do $mig$ begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = ${q(version)}) then
    raise notice 'migration ${version} já aplicada';
  else
    execute ${"$sql_" + version + "$"}${sql}${"$sql_" + version + "$"};
    insert into supabase_migrations.schema_migrations (version, name) values (${q(version)}, ${q(file.slice(15, -4))});
  end if;
end $mig$;
`);
}

// No teste, o primeiro acesso de uma conta nova cria um estabelecimento fictício, não a Enrico.
out.push(`-- ===== Somente no TESTE: primeiro acesso cria estabelecimento fictício =====
create or replace function public.start_initial_workspace(owner_name text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $fn$ declare org_id uuid; site_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.memberships where user_id = auth.uid()) then raise exception 'Workspace already initialized'; end if;
  insert into public.organizations(name) values ('DEMONSTRAÇÃO · CMV Mestre (teste)') returning id into org_id;
  insert into public.memberships(organization_id,user_id,role) values (org_id,auth.uid(),'owner');
  insert into public.establishments(organization_id,name,segment,operational_notes)
  values (org_id,'Pizzaria Demonstração (fictícia)','DEMONSTRAÇÃO','Ambiente de teste com dados fictícios.') returning id into site_id;
  insert into public.implementation_stages(organization_id,establishment_id,stage_number,title,objective,status)
  select org_id, site_id, n, 'Etapa ' || n || ' (demonstração)', 'Etapa fictícia para testes.', case when n = 1 then 'in_progress' else 'not_started' end
  from generate_series(1,6) n;
  return jsonb_build_object('organization_id',org_id,'establishment_id',site_id);
end $fn$;
revoke all on function public.start_initial_workspace(text) from public, anon;
grant execute on function public.start_initial_workspace(text) to authenticated;
`);

const ids = {
  user: "d0000000-0000-4000-8000-000000000001", org: "d0000000-0000-4000-8000-000000000010",
  site: "d0000000-0000-4000-8000-000000000020", visit: "d0000000-0000-4000-8000-000000000030",
};
const stages = [
  [1, "Diagnóstico geral e organização da base", "LEVANTAR: conhecer gestão, operação, cardápio, compras e estoque. Sem pesagem nem custeio.", "in_progress"],
  [2, "Padronização dos produtos principais", "PADRONIZAR: fichas técnicas após diagnóstico aprovado.", "not_started"],
  [3, "Treinamento da equipe", "TREINAR: aplicar os padrões com a equipe.", "not_started"],
  [4, "Acompanhamento e indicadores", "ACOMPANHAR: medir CMV e perdas.", "not_started"],
];
const answers = [
  ["management", "[DEMONSTRAÇÃO] Dois sócios decidem; a gerente de salão cuida das compras.", "declared", "attention"],
  ["menu", "[DEMONSTRAÇÃO] Cardápio impresso com 30 itens; sem fichas técnicas.", "confirmed", "critical"],
  ["purchases", "[DEMONSTRAÇÃO] Compras feitas por WhatsApp, sem cotação registrada.", "declared", "attention"],
  ["stock", "[DEMONSTRAÇÃO] Não há contagem de estoque periódica.", "hypothesis", "critical"],
  ["team", "[DEMONSTRAÇÃO] Equipe de 8 pessoas em dois turnos.", "declared", "adequate"],
];
const tasks = [
  ["[DEMONSTRAÇÃO] Enviar foto do cardápio atual", "Gerente (fictícia)", "high", "in_progress"],
  ["[DEMONSTRAÇÃO] Listar fornecedores principais", "Sócio A (fictício)", "normal", "not_started"],
  ["[DEMONSTRAÇÃO] Combinar data da próxima visita", "Consultora", "normal", "completed"],
];

out.push(`-- ===== Login e dados de DEMONSTRAÇÃO (fictícios) =====
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', ${q(ids.user)}, 'authenticated', 'authenticated', ${q(email)},
  extensions.crypt(${q(password)}, extensions.gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{"demonstracao":true}', '', '', '', '')
on conflict (id) do update set encrypted_password = excluded.encrypted_password;
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (${q(ids.user)}, ${q(ids.user)}, ${q(ids.user)}, jsonb_build_object('sub', ${q(ids.user)}, 'email', ${q(email)}, 'email_verified', true),
  'email', now(), now(), now())
on conflict do nothing;

insert into public.organizations (id, name) values (${q(ids.org)}, 'DEMONSTRAÇÃO · CMV Mestre (teste)') on conflict do nothing;
insert into public.memberships (organization_id, user_id, role) values (${q(ids.org)}, ${q(ids.user)}, 'owner') on conflict do nothing;
insert into public.establishments (id, organization_id, name, segment, management_names, operational_notes, contract_start, contract_end)
values (${q(ids.site)}, ${q(ids.org)}, 'Pizzaria Demonstração (fictícia)', 'DEMONSTRAÇÃO · Pizzaria fictícia',
  array['Sócio A (fictício)','Sócio B (fictício)'], 'Todos os dados deste estabelecimento são fictícios, para teste do sistema.',
  current_date - 14, current_date + 166)
on conflict do nothing;
`);
for (const [n, title, objective, status] of stages) {
  out.push(`insert into public.implementation_stages (id, organization_id, establishment_id, stage_number, title, objective, status, target_start, target_end)
values ('d0000000-0000-4000-8000-00000000010${n}', ${q(ids.org)}, ${q(ids.site)}, ${n}, ${q(title)}, ${q(objective)}, ${q(status)}, current_date - 14 + ${(n - 1) * 30}, current_date + ${n * 30}) on conflict do nothing;`);
}
out.push(`
insert into public.visits (id, organization_id, establishment_id, stage_id, visit_date, visit_type, status, participants, objective, observations, created_by)
values (${q(ids.visit)}, ${q(ids.org)}, ${q(ids.site)}, 'd0000000-0000-4000-8000-000000000101', current_date - 2, 'diagnostic', 'open',
  array['Consultora','Sócio A (fictício)'], '[DEMONSTRAÇÃO] Primeira visita de diagnóstico', '[DEMONSTRAÇÃO] Visita fictícia para testar o sistema.', ${q(ids.user)})
on conflict do nothing;
`);
answers.forEach(([key, answer, evidence, situation], i) => {
  out.push(`insert into public.diagnostic_responses (id, organization_id, establishment_id, visit_id, question_key, question, answer, evidence_status, situation, updated_by)
values ('d0000000-0000-4000-8000-00000000020${i}', ${q(ids.org)}, ${q(ids.site)}, ${q(ids.visit)}, ${q(key)}, ${q(question(key))}, ${q(answer)}, ${q(evidence)}, ${q(situation)}, ${q(ids.user)})
on conflict do nothing;`);
});
tasks.forEach(([title, who, priority, status], i) => {
  out.push(`insert into public.tasks (id, organization_id, establishment_id, stage_id, visit_id, title, assignee_name, priority, status, due_on, completed_at, created_by)
values ('d0000000-0000-4000-8000-00000000030${i}', ${q(ids.org)}, ${q(ids.site)}, 'd0000000-0000-4000-8000-000000000101', ${q(ids.visit)}, ${q(title)}, ${q(who)}, ${q(priority)}, ${q(status)}, current_date + ${7 + i * 3}, ${status === "completed" ? "now()" : "null"}, ${q(ids.user)})
on conflict do nothing;`);
});
out.push(`
select 'Ambiente de teste pronto' as resultado, ${q(email)} as login,
  (select count(*) from public.establishments) as estabelecimentos,
  (select count(*) from supabase_migrations.schema_migrations) as migrations;
`);
process.stdout.write(out.join("\n"));
