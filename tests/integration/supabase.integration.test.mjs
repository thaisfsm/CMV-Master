// Testes de integração contra um Supabase LOCAL e isolado (supabase start).
// Nunca aponte estas variáveis para o projeto de produção: os testes criam usuários e registros.
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=... npm run test:integration
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { buildVisitReport } from "../../lib/report.mjs";
import { buildAdvice } from "../../lib/consultant.mjs";
import { evidencePath } from "../../lib/diagnostic.mjs";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_ANON_KEY;
if (!url || !key) throw new Error("Defina SUPABASE_TEST_URL e SUPABASE_TEST_ANON_KEY (Supabase local).");
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error("Os testes de integração só rodam contra Supabase local.");

const run = Date.now().toString(36);
const password = "teste-local-123";
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function signUp(name) {
  const c = client();
  const email = `${name}-${run}@teste.local`;
  const { data, error } = await c.auth.signUp({ email, password });
  assert.ifError(error);
  assert.ok(data.session, "confirmação de e-mail deve estar desligada no Supabase local");
  return { c, email, id: data.user.id };
}

const ctx = {};

test("autenticação: cadastro, login, senha errada e sessão anônima", async () => {
  ctx.a = await signUp("consultora-a");
  ctx.b = await signUp("outra-empresa-b");
  ctx.c = await signUp("consultor-c");
  const wrong = await client().auth.signInWithPassword({ email: ctx.a.email, password: "errada-123" });
  assert.match(wrong.error?.message ?? "", /Invalid login credentials/);
  const ok = client();
  const login = await ok.auth.signInWithPassword({ email: ctx.a.email, password });
  assert.ifError(login.error);
  assert.equal(login.data.user.id, ctx.a.id);
  const anon = await client().from("establishments").select("id");
  assert.ok(anon.error || anon.data.length === 0, "visitante sem login não lê estabelecimentos");
});

test("estabelecimento: Pizzaria Enrico criada com contrato e etapas, uma única vez", async () => {
  const { error } = await ctx.a.c.rpc("start_initial_workspace", { owner_name: ctx.a.email });
  assert.ifError(error);
  const again = await ctx.a.c.rpc("start_initial_workspace", { owner_name: ctx.a.email });
  assert.match(again.error?.message ?? "", /already initialized/);
  const { data: sites } = await ctx.a.c.from("establishments").select("*");
  assert.equal(sites.length, 1);
  const site = sites[0];
  assert.equal(site.name, "Pizzaria Enrico");
  assert.equal(site.contract_start, "2026-10-19");
  assert.equal(site.contract_end, "2027-04-18");
  ctx.site = site;
  const { data: stages } = await ctx.a.c.from("implementation_stages").select("*").eq("establishment_id", site.id).order("stage_number");
  assert.equal(stages.length, 6);
  ctx.stages = stages;
  const { data: tasks } = await ctx.a.c.from("tasks").select("*").eq("establishment_id", site.id);
  assert.equal(tasks.length, 6);
  const other = await ctx.b.c.rpc("start_initial_workspace", { owner_name: ctx.b.email });
  assert.ifError(other.error);
  const { data: bSites } = await ctx.b.c.from("establishments").select("*");
  assert.equal(bSites.length, 1);
  assert.notEqual(bSites[0].organization_id, site.organization_id);
  ctx.bSite = bSites[0];
});

test("visitas e diagnóstico: salvar, editar, classificar e manter histórico", async () => {
  const { a, site } = ctx;
  const visit = await a.c.from("visits").insert({ organization_id: site.organization_id, establishment_id: site.id, visit_date: "2026-11-05", participants: ["Robério", "Gi"], objective: "Diagnóstico inicial", next_steps: "Enviar cardápio\nAgendar visita de estoque", stage_id: ctx.stages[0].id }).select().single();
  assert.ifError(visit.error);
  ctx.visit = visit.data;
  const base = { organization_id: site.organization_id, establishment_id: site.id, question_key: "purchases", question: "Como as compras são solicitadas?", visit_id: visit.data.id };
  const first = await a.c.from("diagnostic_responses").upsert({ ...base, answer: "O dono compra.", evidence_status: "declared", situation: "attention" }, { onConflict: "establishment_id,question_key" }).select().single();
  assert.ifError(first.error);
  const second = await a.c.from("diagnostic_responses").upsert({ ...base, answer: "O dono compra sem pedido formal.", evidence_status: "declared", situation: "critical", notes: "pedir notas" }, { onConflict: "establishment_id,question_key" }).select().single();
  assert.ifError(second.error);
  assert.equal(second.data.id, first.data.id, "edição atualiza a mesma resposta");
  assert.equal(second.data.situation, "critical");
  const { data: revisions } = await a.c.from("diagnostic_response_revisions").select("*").eq("response_id", first.data.id).order("revised_at");
  assert.equal(revisions.length, 2);
  assert.equal(revisions[0].answer, "O dono compra.");
  assert.equal(revisions[1].revised_by, a.id);
  const invalid = await a.c.from("diagnostic_responses").upsert({ ...base, question_key: "menu", answer: "x", situation: "pessimo" }, { onConflict: "establishment_id,question_key" });
  assert.ok(invalid.error, "classificação inválida é rejeitada");
  const forged = await a.c.from("diagnostic_response_revisions").insert({ organization_id: site.organization_id, establishment_id: site.id, response_id: first.data.id, question_key: "purchases", answer: "falso", evidence_status: "confirmed" });
  assert.ok(forged.error, "histórico não pode ser forjado pelo app");
  const reread = await a.c.from("diagnostic_responses").select("answer,situation,notes").eq("id", first.data.id).single();
  assert.deepEqual(reread.data, { answer: "O dono compra sem pedido formal.", situation: "critical", notes: "pedir notas" });
});

test("tarefas: criar com responsável, editar, concluir e excluir", async () => {
  const { a, site, visit } = ctx;
  const created = await a.c.from("tasks").insert({ organization_id: site.organization_id, establishment_id: site.id, stage_id: ctx.stages[0].id, visit_id: visit.id, title: "Enviar notas fiscais", assignee_name: "Gi", due_on: "2026-11-12", priority: "high" }).select().single();
  assert.ifError(created.error);
  assert.equal(created.data.status, "not_started");
  assert.equal(created.data.created_by, a.id);
  const edited = await a.c.from("tasks").update({ assignee_name: "Robério", status: "in_progress" }).eq("id", created.data.id).select().single();
  assert.ifError(edited.error);
  assert.equal(edited.data.assignee_name, "Robério");
  const done = await a.c.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", created.data.id).select().single();
  assert.equal(done.data.status, "completed");
  ctx.task = done.data;
  const temp = await a.c.from("tasks").insert({ organization_id: site.organization_id, establishment_id: site.id, title: "Temporária" }).select().single();
  const removed = await a.c.from("tasks").delete().eq("id", temp.data.id).select();
  assert.equal(removed.data.length, 1);
  const badPriority = await a.c.from("tasks").insert({ organization_id: site.organization_id, establishment_id: site.id, title: "x", priority: "urgente" });
  assert.ok(badPriority.error);
});

test("evidências: upload privado, link assinado e bloqueio entre empresas", async () => {
  const { a, b, site, visit } = ctx;
  const id = crypto.randomUUID();
  const path = evidencePath({ organizationId: site.organization_id, establishmentId: site.id, visitId: visit.id, fileName: "nota fiscal.png", id });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const up = await a.c.storage.from("cmv-evidence").upload(path, png, { contentType: "image/png" });
  assert.ifError(up.error);
  const row = await a.c.from("evidence_files").insert({ id, organization_id: site.organization_id, establishment_id: site.id, bucket_id: "cmv-evidence", storage_path: path, file_name: "nota fiscal.png", media_type: "image/png", size_bytes: png.length, uploaded_by: a.id, question_key: "purchases", visit_id: visit.id }).select().single();
  assert.ifError(row.error);
  ctx.evidence = row.data;
  const signed = await a.c.storage.from("cmv-evidence").createSignedUrl(path, 60);
  assert.ifError(signed.error);
  const res = await fetch(signed.data.signedUrl);
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).length, png.length);
  const publicUrl = a.c.storage.from("cmv-evidence").getPublicUrl(path).data.publicUrl;
  assert.notEqual((await fetch(publicUrl)).status, 200, "bucket não é público");
  const bSigned = await b.c.storage.from("cmv-evidence").createSignedUrl(path, 60);
  assert.ok(bSigned.error, "outra empresa não gera link");
  const bDownload = await b.c.storage.from("cmv-evidence").download(path);
  assert.ok(bDownload.error, "outra empresa não baixa");
  const bUpload = await b.c.storage.from("cmv-evidence").upload(`${site.organization_id}/${site.id}/x/${crypto.randomUUID()}-intruso.png`, png, { contentType: "image/png" });
  assert.ok(bUpload.error, "outra empresa não envia para a pasta da Enrico");
  const badType = await a.c.storage.from("cmv-evidence").upload(`${site.organization_id}/${site.id}/x/${crypto.randomUUID()}-video.mp4`, png, { contentType: "video/mp4" });
  assert.ok(badType.error, "tipo não permitido é recusado");
  const mismatched = await a.c.from("evidence_files").insert({ organization_id: site.organization_id, establishment_id: site.id, bucket_id: "cmv-evidence", storage_path: `${ctx.bSite.organization_id}/x/y.png`, file_name: "y.png" });
  assert.ok(mismatched.error, "registro precisa apontar para a pasta do próprio estabelecimento");
});

test("isolamento: outra organização não lê nem altera dados da Enrico", async () => {
  const { b, site } = ctx;
  for (const table of ["establishments", "implementation_stages", "tasks", "diagnostic_responses", "diagnostic_response_revisions", "visits", "evidence_files", "audit_events"]) {
    const { data, error } = await b.c.from(table).select("id").eq("organization_id", site.organization_id);
    assert.ifError(error);
    assert.equal(data.length, 0, `${table} vazou para outra organização`);
  }
  const insert = await b.c.from("tasks").insert({ organization_id: site.organization_id, establishment_id: site.id, title: "intrusa" });
  assert.ok(insert.error, "inserção cruzada bloqueada");
  const crossSite = await b.c.from("tasks").insert({ organization_id: ctx.bSite.organization_id, establishment_id: site.id, title: "intrusa" });
  assert.ok(crossSite.error, "estabelecimento de outra organização bloqueado pelo gatilho");
  const update = await b.c.from("tasks").update({ title: "alterada" }).eq("id", ctx.task.id).select();
  assert.equal(update.data.length, 0);
  const del = await b.c.from("visits").delete().eq("id", ctx.visit.id).select();
  assert.equal(del.data.length, 0);
  const crossVisit = await b.c.from("tasks").insert({ organization_id: ctx.bSite.organization_id, establishment_id: ctx.bSite.id, title: "x", visit_id: ctx.visit.id });
  assert.ok(crossVisit.error, "não vincula visita de outra empresa");
  const still = await ctx.a.c.from("tasks").select("title").eq("id", ctx.task.id).single();
  assert.equal(still.data.title, "Enviar notas fiscais");
});

test("papéis: consultor convidado edita, mas não gerencia membros nem exclui o estabelecimento", async () => {
  const { a, c, site } = ctx;
  const invite = await a.c.from("memberships").insert({ organization_id: site.organization_id, user_id: c.id, role: "consultant" });
  assert.ifError(invite.error);
  const sees = await c.c.from("establishments").select("id");
  assert.equal(sees.data.length, 1);
  const canEdit = await c.c.from("tasks").insert({ organization_id: site.organization_id, establishment_id: site.id, title: "Tarefa do consultor" }).select().single();
  assert.ifError(canEdit.error);
  const promote = await c.c.from("memberships").update({ role: "owner" }).eq("user_id", c.id).select();
  assert.equal(promote.data?.length ?? 0, 0, "consultor não se promove");
  const addOther = await c.c.from("memberships").insert({ organization_id: site.organization_id, user_id: ctx.b.id, role: "owner" });
  assert.ok(addOther.error, "consultor não inclui terceiros");
  const delSite = await c.c.from("establishments").delete().eq("id", site.id).select();
  assert.equal(delSite.data.length, 0, "consultor não exclui o estabelecimento");
  const audit = await a.c.from("audit_events").select("id").eq("organization_id", site.organization_id).limit(1).single();
  const tamper = await a.c.from("audit_events").update({ action: "alterado" }).eq("id", audit.data.id).select();
  assert.equal(tamper.data.length, 0, "auditoria é imutável");
  const erase = await a.c.from("audit_events").delete().eq("id", audit.data.id).select();
  assert.equal(erase.data.length, 0, "auditoria não pode ser apagada");
});

test("etapa 1 só conclui com 15 tópicos e tarefas concluídas", async () => {
  const gate = await ctx.a.c.from("implementation_stages").update({ status: "completed" }).eq("id", ctx.stages[0].id);
  assert.match(gate.error?.message ?? "", /Diagnostic approval requires/);
});

test("relatório da visita é gerado a partir dos dados gravados", async () => {
  const { a, site, visit } = ctx;
  const [responses, tasks, evidence, stages] = await Promise.all([
    a.c.from("diagnostic_responses").select("*").eq("establishment_id", site.id),
    a.c.from("tasks").select("*").eq("establishment_id", site.id),
    a.c.from("evidence_files").select("*").eq("establishment_id", site.id),
    a.c.from("implementation_stages").select("*").eq("establishment_id", site.id),
  ]);
  const advice = buildAdvice({ responses: responses.data, tasks: tasks.data, stages: stages.data, visits: [visit], evidenceCount: evidence.data.length });
  assert.match(advice.actions[0].title, /Crítico/);
  const report = buildVisitReport({ establishment: site, visit, responses: responses.data, tasks: tasks.data, evidence: evidence.data, advice });
  assert.equal(report.establishment, "Pizzaria Enrico");
  assert.equal(report.visitDate, "05/11/2026");
  assert.equal(report.summary.answered, 1);
  assert.equal(report.summary.attachments, 1);
  assert.equal(report.topics.find(t => t.key === "purchases").situation, "Crítico");
  assert.deepEqual(report.topics.find(t => t.key === "purchases").attachments, ["nota fiscal.png"]);
  assert.ok(report.completedTasks.includes("Enviar notas fiscais"));
  assert.ok(report.openTasks.length >= 6);
  assert.deepEqual(report.nextSteps, ["Enviar cardápio", "Agendar visita de estoque"]);
});
