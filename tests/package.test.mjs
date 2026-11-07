import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePackage, checkPackageFile, computePlanning, contextSignature, canonicalJSON, sha256Hex, findCycles, titleSimilarity, FORBIDDEN_FIELDS, MATURITY, STAGES } from "../lib/package.mjs";
import { buildSchema } from "../lib/package-schema.mjs";
import { buildContext, exportContext, assignTaskCodes, contextFileName, SEED_TASKS_E1 } from "../lib/context.mjs";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const EXAMPLE = read("../docs/pacote-analise/exemplo-pacote.json");
const CONTEXT = read("../docs/pacote-analise/exemplo-contexto.json");
const FIXTURE = read("./fixtures/producao-2026-11-07.json");
const clone = v => JSON.parse(JSON.stringify(v));
const pkg = (change = () => {}) => { const p = clone(EXAMPLE); change(p); return p; };
const codes = result => result.errors.map(e => e.code);
const warnCodes = result => result.warnings.map(w => w.code);
const task = (p, id) => p.etapas.flatMap(s => s.tarefas ?? []).find(t => t.id === id);

// --- Exemplos oficiais -------------------------------------------------------------

test("exemplo oficial é válido sozinho e contra o contexto real exportado", async () => {
  // Sem o contexto, só faltam as tarefas que existem no sistema (T-E1-001 a 005).
  assert.deepEqual(validatePackage(EXAMPLE).errors.map(e => e.message.match(/T-E1-00\d/)?.[0]), ["T-E1-001", "T-E1-002", "T-E1-003", "T-E1-004", "T-E1-005"]);
  const r = await checkPackageFile(JSON.stringify(EXAMPLE), { context: CONTEXT });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.plan.update, ["T-E1-006"]);
  assert.deepEqual(r.plan.notCited, ["T-E1-001", "T-E1-002", "T-E1-003", "T-E1-004", "T-E1-005"]);
  assert.ok(r.plan.create.includes("T-E2-002") && r.plan.create.includes("CTL-RECEBIMENTO"));
});

test("exemplo de contexto é a saída real de exportContext sobre o retrato da produção", async () => {
  const ctx = await exportContext({ ...FIXTURE, diagnosticId: null, generatedAt: "2026-11-07T13:30:00.000Z" });
  assert.deepEqual(ctx, CONTEXT);
  assert.equal(await contextSignature(CONTEXT), CONTEXT.contexto.assinatura);
});

test("esquema publicado está igual ao gerado pelas constantes do validador", () => {
  assert.deepEqual(read("../docs/pacote-analise/pacote-analise.schema.json"), buildSchema());
  const schema = buildSchema();
  assert.deepEqual(schema.properties.etapas.items.properties.id.enum, STAGES);
  assert.deepEqual(schema.properties.controles.items.properties.nivel_observado.enum, MATURITY);
});

// --- Validação de estrutura ---------------------------------------------------------

test("JSON inválido, formato ou versão errados são recusados", async () => {
  assert.deepEqual(codes(await checkPackageFile("{ não é json")), ["json"]);
  assert.ok(codes(validatePackage(pkg(p => { p.formato = "outro"; }))).includes("formato"));
  assert.ok(codes(validatePackage(pkg(p => { p.versao_formato = "2.0"; }))).includes("versao"));
  assert.ok(codes(validatePackage([])).includes("estrutura"));
});

test("campos obrigatórios e listas fechadas são conferidos", () => {
  const r = validatePackage(pkg(p => {
    delete p.diagnostico.resumo;
    p.diagnostico.problemas[0].topico = "cozinha";
    p.diagnostico.problemas[0].gravidade = "grave";
    task(p, "T-E1-007").prioridade_recomendada = "urgente";
    task(p, "T-E1-007").prazo_recomendado = "12/11/2026";
    delete p.origem.contexto_assinatura;
  }));
  assert.ok(r.errors.some(e => e.path === "$.diagnostico.resumo" && e.code === "obrigatorio"));
  assert.ok(r.errors.some(e => e.path.endsWith("topico") && e.code === "valor_invalido"));
  assert.ok(r.errors.some(e => e.path.endsWith("gravidade")));
  assert.ok(r.errors.some(e => e.path.endsWith("prioridade_recomendada")));
  assert.ok(r.errors.some(e => e.path.endsWith("prazo_recomendado")));
  assert.ok(r.errors.some(e => e.path === "$.origem.contexto_assinatura"));
});

test("campo desconhecido vira aviso e é ignorado", () => {
  const r = validatePackage(pkg(p => { p.comentario = "x"; task(p, "T-E1-007").cor = "verde"; }), { context: CONTEXT });
  assert.equal(r.ok, true);
  assert.equal(warnCodes(r).filter(c => c === "campo_desconhecido").length, 2);
});

// --- Recomendação não é execução ----------------------------------------------------

test("pacote não pode marcar execução, informar valor medido nem apagar", () => {
  for (const field of ["status", "concluida", "data_conclusao", "valor_medido", "cmv_real", "cumprido", "nivel_atual", "apagar", "excluir"]) {
    const r = validatePackage(pkg(p => { task(p, "T-E1-007")[field] = true; }));
    assert.ok(codes(r).includes("campo_proibido"), field);
  }
  const deep = validatePackage(pkg(p => { task(p, "T-E1-007").criterios[0].cumprido = true; p.indicadores[0].medicoes = [10]; }));
  assert.equal(codes(deep).filter(c => c === "campo_proibido").length, 2);
  assert.ok(FORBIDDEN_FIELDS.includes("completed_at"));
});

test("toda tarefa precisa de critério; linha de base só com fonte", () => {
  assert.ok(codes(validatePackage(pkg(p => { task(p, "T-E1-007").criterios = []; }))).includes("sem_criterio"));
  assert.ok(codes(validatePackage(pkg(p => { delete p.indicadores[0].controle; p.indicadores[0].linha_de_base = 40; }))).includes("linha_de_base_sem_fonte"));
  assert.equal(validatePackage(pkg(p => { delete p.indicadores[0].controle; p.indicadores[0].linha_de_base = 40; p.indicadores[0].fonte_linha_de_base = "Notas de outubro"; }), { context: CONTEXT }).ok, true);
});

// --- Códigos ---------------------------------------------------------------------------

test("códigos seguem o padrão de cada tipo", () => {
  const r = validatePackage(pkg(p => {
    p.pacote.id = "PKG-enrico-7-11";
    p.diagnostico.problemas[0].id = "PROB-1";
    p.controles[0].id = "cadastro";
    p.orientacoes[0].id = "ORI-1";
  }));
  assert.equal(codes(r).filter(c => c === "codigo").length >= 4, true);
});

test("tarefa com código de outra etapa é recusada (mudar de etapa exige código novo)", () => {
  const r = validatePackage(pkg(p => { p.etapas[1].tarefas.push({ ...clone(task(p, "T-E1-007")), id: "T-E1-008", criterios: [{ id: "T-E1-008-C1", texto: "x" }] }); }));
  assert.ok(r.errors.some(e => e.code === "codigo" && /outra etapa/.test(e.message)));
});

test("critério precisa começar pelo código do dono", () => {
  const r = validatePackage(pkg(p => { task(p, "T-E1-007").criterios[0].id = "T-E2-001-C9"; }));
  assert.ok(r.errors.some(e => e.code === "codigo" && /dono/.test(e.message)));
});

test("código da fase do pacote precisa bater com pacote.fase", () => {
  assert.ok(codes(validatePackage(pkg(p => { p.pacote.fase = "E2"; }))).includes("integridade"));
});

test("etapa fora das seis do contrato é recusada", () => {
  const r = validatePackage(pkg(p => { p.etapas.push({ id: "E7", tarefas: [] }); }));
  assert.ok(codes(r).includes("etapa_inexistente"));
});

// --- Duplicidade ------------------------------------------------------------------------

test("o mesmo código definido duas vezes no pacote é recusado", () => {
  const r = validatePackage(pkg(p => { p.diagnostico.problemas[1].id = "PRB-001"; p.etapas.push(clone(p.etapas[0])); }));
  assert.ok(codes(r).filter(c => c === "codigo_repetido").length >= 2);
});

test("título parecido com item existente e código novo gera aviso de possível duplicata", () => {
  const r = validatePackage(pkg(p => { p.etapas[0].tarefas.push({ id: "T-E1-008", titulo: "Entrevistar gestão", prioridade_recomendada: "normal", justificativa: "x", criterios: [{ id: "T-E1-008-C1", texto: "x" }] }); }), { context: CONTEXT });
  assert.ok(r.warnings.some(w => w.code === "possivel_duplicata" && /T-E1-001/.test(w.message)));
  assert.ok(titleSimilarity("Entrevistar a gestão", "Entrevistar gestão") >= 0.75);
  assert.ok(titleSimilarity("Entrevistar a gestão", "Montar o cadastro de insumos") < 0.2);
});

test("mesmo pacote importado de novo não muda nada; mesmo código com outro conteúdo é recusado", async () => {
  const sha = await sha256Hex(canonicalJSON(EXAMPLE));
  const ctx = clone(CONTEXT);
  ctx.pacotes_importados = [{ id: EXAMPLE.pacote.id, sha256: sha, fase: "E1" }];
  const signed = { ...ctx, contexto: { ...ctx.contexto, assinatura: await contextSignature(ctx) } };
  const p = pkg(x => { x.origem.contexto_assinatura = signed.contexto.assinatura; });
  const again = await checkPackageFile(JSON.stringify(p), { context: signed });
  assert.equal(again.ok, false); // conteúdo mudou (assinatura nova) → outro conteúdo com mesmo código
  assert.ok(codes(again).includes("pacote_repetido"));
  const shaP = await sha256Hex(canonicalJSON(p));
  signed.pacotes_importados[0].sha256 = shaP;
  const resigned = { ...signed, contexto: { ...signed.contexto, assinatura: await contextSignature(signed) } };
  const r = validatePackage(p, { context: resigned, payloadSha256: shaP });
  assert.equal(r.alreadyImported, true);
});

test("substitui_pacote precisa apontar para pacote já importado", () => {
  const r = validatePackage(pkg(p => { p.pacote.id = "PKG-ENRICO-20261107-E1-02"; p.pacote.substitui_pacote = "PKG-ENRICO-20261107-E1-01"; }), { context: CONTEXT });
  assert.ok(r.errors.some(e => e.path === "$.pacote.substitui_pacote"));
});

// --- Dependências ------------------------------------------------------------------------

test("referência a item inexistente é recusada", () => {
  const r = validatePackage(pkg(p => {
    task(p, "T-E1-007").problema = "PRB-099";
    task(p, "T-E1-007").orientacoes = ["ORI-009"];
    task(p, "T-E2-002").depende_de = ["T-E2-050", "CTL-NADA:implantado"];
    p.prioridades[0].problema = "PRB-077";
  }));
  assert.ok(codes(r).filter(c => c === "referencia").length >= 5);
});

test("tarefas do sistema podem ser citadas como dependência, sem contexto vira erro", () => {
  assert.equal(validatePackage(EXAMPLE, { context: CONTEXT }).ok, true);
  const alone = pkg(p => { p.etapas[0].tarefas = p.etapas[0].tarefas.filter(t => t.id !== "T-E1-006"); });
  assert.ok(codes(validatePackage(alone)).includes("referencia")); // T-E1-006 só existe no contexto
  assert.equal(validatePackage(alone, { context: CONTEXT }).ok, true);
});

test("dependência circular é recusada (direta, indireta e entre controles)", () => {
  const self = validatePackage(pkg(p => { task(p, "T-E2-001").depende_de.push("T-E2-001"); }));
  assert.ok(codes(self).includes("dependencia_circular"));
  const loop = validatePackage(pkg(p => { task(p, "T-E1-007").depende_de = ["T-E1-006"]; }), { context: CONTEXT });
  assert.ok(loop.errors.some(e => e.code === "dependencia_circular" && /T-E1-006/.test(e.message) && /T-E1-007/.test(e.message)));
  const ctl = validatePackage(pkg(p => { p.controles[0].pre_requisitos = ["CTL-RECEBIMENTO:informal"]; }));
  assert.ok(codes(ctl).includes("dependencia_circular"));
  assert.deepEqual(findCycles(new Map([["a", ["b"]], ["b", ["c"]], ["c", ["a"]]])), [["a", "b", "c", "a"]]);
});

test("dependência de etapa posterior é recusada", () => {
  const r = validatePackage(pkg(p => { task(p, "T-E1-007").depende_de = ["T-E2-001"]; }));
  assert.ok(codes(r).includes("dependencia_etapa"));
});

test("dependência de controle exige nível válido", () => {
  assert.ok(codes(validatePackage(pkg(p => { task(p, "T-E2-002").depende_de = ["CTL-CADASTRO-INSUMOS"]; }))).includes("tipo"));
  assert.ok(codes(validatePackage(pkg(p => { task(p, "T-E2-002").depende_de = ["CTL-CADASTRO-INSUMOS:inexistente"]; }))).includes("valor_invalido"));
});

test("dependência de tarefa cancelada é recusada", () => {
  const ctx = clone(CONTEXT);
  ctx.tarefas.find(t => t.id === "T-E1-005").status_execucao = "cancelled";
  const r = validatePackage(EXAMPLE, { context: ctx });
  assert.ok(r.errors.some(e => e.code === "referencia" && /cancelada/.test(e.message)));
});

test("próximo passo bloqueado por pré-requisito vira aviso", () => {
  const r = validatePackage(pkg(p => { p.proximo_passo_recomendado = ["T-E2-002"]; }), { context: CONTEXT });
  assert.ok(warnCodes(r).includes("proximo_passo_bloqueado"));
  assert.ok(codes(validatePackage(pkg(p => { p.proximo_passo_recomendado = ["T-E9-001"]; }))).includes("referencia"));
});

// --- Maturidade -----------------------------------------------------------------------------

test("controle não nasce antes do seu pré-requisito", () => {
  const r = validatePackage(pkg(p => { p.controles[1].etapa_prevista = "E2"; p.controles[0].etapa_prevista = "E3"; task(p, "T-E2-001").controle = undefined; }));
  assert.ok(r.errors.some(e => e.code === "maturidade" && /antes do pré-requisito/.test(e.message)));
});

test("tarefa não cria controle antes da etapa prevista", () => {
  const r = validatePackage(pkg(p => { task(p, "T-E1-007").controle = "CTL-RECEBIMENTO"; }));
  assert.ok(r.errors.some(e => e.code === "maturidade" && /momento previsto/.test(e.message)));
});

test("tarefa não depende de controle que só nasce depois, nem de nível acima do alvo", () => {
  const early = validatePackage(pkg(p => { task(p, "T-E1-007").depende_de = ["CTL-CADASTRO-INSUMOS:implantado"]; }));
  assert.ok(early.errors.some(e => e.code === "maturidade" && /só nasce em E2/.test(e.message)));
  const above = validatePackage(pkg(p => { task(p, "T-E2-002").depende_de = ["T-E2-001", "CTL-CADASTRO-INSUMOS:consolidado"]; }));
  assert.ok(above.errors.some(e => e.code === "maturidade" && /alvo planejado/.test(e.message)));
});

test("nível-alvo não pode ser menor que o observado nem inexistente", () => {
  assert.ok(codes(validatePackage(pkg(p => { p.controles[0].nivel_observado = "consolidado"; }))).includes("maturidade"));
  assert.ok(codes(validatePackage(pkg(p => { p.controles[0].nivel_alvo = "inexistente"; }))).includes("maturidade"));
  assert.ok(warnCodes(validatePackage(pkg(p => { p.controles[0].nivel_observado = "implantado"; }))).includes("maturidade"));
});

test("indicador de controle inexistente não tem linha de base nem começa antes do controle", () => {
  const base = validatePackage(pkg(p => { p.indicadores[0].linha_de_base = 30; p.indicadores[0].fonte_linha_de_base = "estimativa"; }));
  assert.ok(base.errors.some(e => e.code === "maturidade" && /Sem controle não há medição/.test(e.message)));
  const early = validatePackage(pkg(p => { p.indicadores[0].etapa_inicio = "E1"; }));
  assert.ok(early.errors.some(e => e.code === "maturidade" && /antes de existir/.test(e.message)));
});

test("nível observado diferente do registrado no sistema vira aviso, e vale o registrado", () => {
  const ctx = clone(CONTEXT);
  ctx.controles = [{ id: "CTL-CADASTRO-INSUMOS", nome: "Cadastro de insumos com unidade de compra e de uso", nivel: "informal", nivel_alvo: "implantado", etapa_prevista: "E2" }];
  const r = validatePackage(EXAMPLE, { context: ctx });
  assert.ok(r.warnings.some(w => w.code === "maturidade_divergente" && /informal/.test(w.message)));
  assert.ok(r.plan.update.includes("CTL-CADASTRO-INSUMOS"));
});

test("controle inexistente não gera tarefa atrasada; atraso só com tarefa liberada e prazo aceito", () => {
  const state = {
    etapas: [{ id: "E1", status: "in_progress", criterios: [] }, { id: "E2", status: "in_progress", criterios: [] }, { id: "E3", status: "not_started", criterios: [] }],
    controles: [{ id: "CTL-CAD", nivel: "inexistente" }],
    tarefas: [
      { id: "T-E1-001", etapa: "E1", status_execucao: "completed", prioridade: "alta", depende_de: [] },
      { id: "T-E1-002", etapa: "E1", status_execucao: "not_started", prioridade: "normal", prazo_aceito: "2026-11-01", depende_de: ["T-E1-001"] },
      { id: "T-E2-001", etapa: "E2", status_execucao: "not_started", prioridade: "alta", prazo_aceito: "2026-11-01", depende_de: ["CTL-CAD:implantado"] },
      { id: "T-E2-002", etapa: "E2", status_execucao: "not_started", prioridade: "alta", prazo_recomendado: "2026-11-01", depende_de: [] },
      { id: "T-E3-001", etapa: "E3", status_execucao: "not_started", prioridade: "alta", prazo_aceito: "2026-11-01", depende_de: [] },
      { id: "T-E2-003", etapa: "E2", status_execucao: "cancelled", prioridade: "alta", depende_de: [] },
    ],
  };
  const r = computePlanning(state, "2026-11-07");
  const by = Object.fromEntries(r.tarefas.map(t => [t.id, t]));
  assert.equal(by["T-E1-001"].estado, "concluida");
  assert.deepEqual([by["T-E1-002"].estado, by["T-E1-002"].atrasada], ["liberada", true]);
  assert.deepEqual([by["T-E2-001"].estado, by["T-E2-001"].atrasada, by["T-E2-001"].pendentes], ["aguardando_pre_requisito", false, ["CTL-CAD:implantado"]]);
  assert.deepEqual([by["T-E2-002"].estado, by["T-E2-002"].atrasada], ["liberada", false]); // prazo só recomendado
  assert.deepEqual([by["T-E3-001"].estado, by["T-E3-001"].atrasada], ["planejada", false]);
  assert.equal(by["T-E2-003"].estado, "cancelada");
  assert.deepEqual(r.proximoPasso.map(p => p.id), ["T-E1-002", "T-E2-002"]); // atrasada primeiro
});

test("próximo passo prioriza o que destrava mais; sem nada liberado mostra as travas", () => {
  const state = {
    etapas: [{ id: "E2", status: "in_progress" }],
    controles: [],
    tarefas: [
      { id: "T-E2-001", etapa: "E2", status_execucao: "not_started", prioridade: "normal", depende_de: [] },
      { id: "T-E2-002", etapa: "E2", status_execucao: "not_started", prioridade: "normal", depende_de: [] },
      { id: "T-E2-003", etapa: "E2", status_execucao: "not_started", prioridade: "normal", depende_de: ["T-E2-002"] },
    ],
  };
  assert.deepEqual(computePlanning(state, "2026-11-07").proximoPasso.map(p => [p.id, p.destrava]), [["T-E2-002", 1], ["T-E2-001", 0]]);
  state.tarefas = [{ id: "T-E2-003", etapa: "E2", status_execucao: "not_started", depende_de: ["T-E2-009"] }];
  assert.deepEqual(computePlanning(state, "2026-11-07").travas, [{ id: "T-E2-003", pendentes: ["T-E2-009"] }]);
});

// --- Integridade com o sistema (contexto) ------------------------------------------------------

test("contexto alterado depois de exportado é recusado", async () => {
  const ctx = clone(CONTEXT);
  ctx.tarefas[0].titulo = "Alterado à mão";
  const r = await checkPackageFile(JSON.stringify(EXAMPLE), { context: ctx });
  assert.ok(r.errors.some(e => e.code === "contexto" && /alterado/.test(e.message)));
});

test("pacote gerado sobre contexto antigo é recusado", () => {
  const r = validatePackage(pkg(p => { p.origem.contexto_assinatura = "0".repeat(64); }), { context: CONTEXT });
  assert.ok(codes(r).includes("contexto_desatualizado"));
});

test("pacote de outro diagnóstico ou de outro estabelecimento é recusado", () => {
  const ctx = { ...clone(CONTEXT), diagnostico_id: "diag-outro" };
  assert.ok(codes(validatePackage(EXAMPLE, { context: ctx })).includes("outro_diagnostico"));
  assert.ok(codes(validatePackage(pkg(p => { p.estabelecimento.nome = "Outra Pizzaria"; }), { context: CONTEXT })).includes("outro_estabelecimento"));
});

test("depois de um fechamento de fase, o pacote precisa vir do último backup de fechamento", () => {
  const ctx = { ...clone(CONTEXT), ultimo_fechamento: { fase: "E1", sha256: "a".repeat(64) } };
  assert.ok(validatePackage(EXAMPLE, { context: ctx }).errors.some(e => e.code === "origem" && /fechamento-fase/.test(e.message)));
  const closing = pkg(p => { p.origem = { ...p.origem, tipo: "fechamento-fase", fase_fechada: "E1", backup_sha256: "b".repeat(64) }; p.pacote.id = "PKG-ENRICO-20261201-E2-01"; p.pacote.fase = "E2"; });
  assert.ok(validatePackage(closing, { context: ctx }).errors.some(e => e.code === "origem" && /último backup/.test(e.message)));
  closing.origem.backup_sha256 = "a".repeat(64);
  assert.equal(validatePackage(closing, { context: ctx }).errors.filter(e => e.code === "origem").length, 0);
  const noClosing = validatePackage(closing, { context: CONTEXT });
  assert.ok(noClosing.errors.some(e => e.code === "origem" && /nenhuma fase foi fechada/.test(e.message)));
});

test("não cria tarefa nova em etapa já concluída", () => {
  const ctx = clone(CONTEXT);
  ctx.etapas[0].status = "completed";
  assert.ok(codes(validatePackage(EXAMPLE, { context: ctx })).includes("etapa_concluida"));
});

test("validação é determinística e não altera o pacote recebido", () => {
  const input = clone(EXAMPLE);
  const a = validatePackage(input, { context: CONTEXT });
  const b = validatePackage(input, { context: CONTEXT });
  assert.deepEqual(a, b);
  assert.deepEqual(input, EXAMPLE);
});

// --- Exportação do contexto ----------------------------------------------------------------------

test("tarefas iniciais recebem os códigos T-E1-001 a T-E1-006 pela ordem da criação, mesmo com datas iguais", () => {
  const ctx = buildContext({ ...FIXTURE, generatedAt: "2026-11-07T13:30:00.000Z" });
  assert.deepEqual(ctx.tarefas.map(t => [t.id, t.titulo]), SEED_TASKS_E1.map((title, i) => [`T-E1-00${i + 1}`, title]));
  assert.ok(ctx.tarefas.every(t => t.codigo_provisorio && t.estado_planejamento === "liberada" && !t.atrasada));
  const shuffled = buildContext({ ...FIXTURE, tasks: [...FIXTURE.tasks].reverse(), generatedAt: "2026-11-07T13:30:00.000Z" });
  assert.deepEqual(shuffled.tarefas, ctx.tarefas);
});

test("código gravado prevalece e tarefa manual nova recebe o próximo número livre", () => {
  const map = assignTaskCodes([
    { id: "a", title: "Entrevistar a gestão", stage_number: 1 },
    { id: "b", title: "Outra tarefa", stage_number: 1, created_at: "2026-11-02" },
    { id: "c", title: "Já codificada", stage_number: 1, external_key: "T-E1-002" },
    { id: "d", title: "Pizzas", stage_number: 2, created_at: "2026-11-03" },
  ]);
  assert.deepEqual(Object.fromEntries([...map].map(([k, v]) => [k, v.code])), { c: "T-E1-002", a: "T-E1-001", b: "T-E1-003", d: "T-E2-001" });
  assert.equal(map.get("c").provisional, false);
});

test("contexto não expõe dados sensíveis por padrão", () => {
  const tasks = FIXTURE.tasks.map((t, i) => i === 0 ? { ...t, assignee_name: "Pessoa Real", due_on: "2026-11-20" } : t);
  const ctx = buildContext({ ...FIXTURE, tasks, establishment: { ...FIXTURE.establishment, contract_monthly_value: 2000, management_names: ["Fulano"] }, generatedAt: "2026-11-07T13:30:00.000Z" });
  const text = JSON.stringify(ctx);
  for (const secret of ["Pessoa Real", "Fulano", "2000", "contract", "organization_id", "user_id", "tarefa-1", "etapa-1"]) assert.ok(!text.includes(secret), secret);
  assert.equal(ctx.tarefas.find(t => t.titulo === "Verificar compras, recebimento e estoque").responsavel, "definido");
  const withNames = buildContext({ ...FIXTURE, tasks, generatedAt: "2026-11-07T13:30:00.000Z", includeNames: true });
  assert.ok(JSON.stringify(withNames).includes("Pessoa Real"));
});

test("contexto leva o diagnóstico dos 15 tópicos e marca o que falta", () => {
  const ctx = buildContext({ ...FIXTURE, responses: [{ question_key: "receiving", answer: "Sem conferência", evidence_status: "declared", situation: "critical" }], generatedAt: "2026-11-07T13:30:00.000Z" });
  assert.equal(ctx.diagnostico.length, 15);
  const rec = ctx.diagnostico.find(d => d.topico === "receiving");
  assert.deepEqual([rec.registrado, rec.confirmacao, rec.situacao, rec.resposta], [true, "declarada", "critico", "Sem conferência"]);
  assert.equal(ctx.diagnostico.filter(d => d.registrado).length, 1);
});

test("assinatura muda quando o conteúdo muda e o nome do arquivo é previsível", async () => {
  const a = await exportContext({ ...FIXTURE, generatedAt: "2026-11-07T13:30:00.000Z" });
  const b = await exportContext({ ...FIXTURE, generatedAt: "2026-11-07T13:31:00.000Z" });
  assert.notEqual(a.contexto.assinatura, b.contexto.assinatura);
  assert.match(a.contexto.assinatura, /^[0-9a-f]{64}$/);
  assert.equal(contextFileName("Pizzaria Enrico", "2026-11-07T13:30:00.000Z"), "cmv-contexto-pizzaria-enrico-2026-11-07.json");
});
