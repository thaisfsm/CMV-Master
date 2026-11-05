import test from "node:test";
import assert from "node:assert/strict";
import { DIAGNOSTIC_QUESTIONS, validateResponse, diagnosticProgress, evidencePath, validateEvidenceFile } from "../lib/diagnostic.mjs";
import { buildAdvice, currentPhase, calculationReadiness } from "../lib/consultant.mjs";
import { buildVisitReport, reportToText } from "../lib/report.mjs";

const stages = [1, 2, 3, 4, 5, 6].map(n => ({ stage_number: n, status: n === 1 ? "in_progress" : "not_started" }));
const visit = { id: "v1", visit_date: "2026-11-05", visit_type: "diagnostic", participants: ["Robério", "Gi"], next_steps: "- Enviar cardápio\n- Agendar visita de estoque", status: "open" };
const site = { name: "Pizzaria Enrico", segment: "Pizzaria com rodízio", contract_start: "2026-10-19", contract_end: "2027-04-18" };

test("roteiro mantém as 15 chaves já gravadas no banco", () => {
  assert.equal(DIAGNOSTIC_QUESTIONS.length, 15);
  assert.deepEqual(DIAGNOSTIC_QUESTIONS.map(q => q.key), ["management", "expectations", "difficulties", "structure", "responsibles", "menu", "production", "purchases", "receiving", "stock", "systems", "controls", "documents", "team", "visit"]);
});

test("validação de resposta exige texto e classificações válidas", () => {
  assert.throws(() => validateResponse({ answer: "   " }), /Registre/);
  assert.throws(() => validateResponse({ answer: "ok", evidenceStatus: "fato" }), /confirmação/);
  assert.throws(() => validateResponse({ answer: "ok", situation: "ruim" }), /Situação/);
  assert.deepEqual(validateResponse({ answer: "  Compras pelo dono  ", situation: "attention" }), { answer: "Compras pelo dono", evidence_status: "declared", situation: "attention", notes: null });
});

test("progresso conta somente tópicos do roteiro", () => {
  const p = diagnosticProgress([{ question_key: "menu", situation: "adequate", evidence_status: "confirmed" }, { question_key: "outro" }]);
  assert.equal(p.answered, 1);
  assert.equal(p.classified, 1);
  assert.equal(p.confirmed, 1);
  assert.equal(p.percent, 7);
  assert.equal(p.missing.length, 14);
});

test("caminho de evidência começa por organização e estabelecimento e limpa o nome", () => {
  assert.equal(evidencePath({ organizationId: "o", establishmentId: "e", visitId: "v", fileName: "Nota fiscal ção (1).pdf", id: "x" }), "o/e/v/x-Nota-fiscal-cao-1-.pdf");
  assert.throws(() => evidencePath({ organizationId: "", establishmentId: "e", fileName: "a", id: "x" }));
});

test("arquivo de evidência valida tamanho e tipo", () => {
  assert.equal(validateEvidenceFile({ size: 1000, type: "image/jpeg" }), true);
  assert.throws(() => validateEvidenceFile({ size: 30 * 1024 * 1024, type: "image/jpeg" }), /20 MB/);
  assert.throws(() => validateEvidenceFile({ size: 10, type: "video/mp4" }), /não aceito/);
});

test("fase da metodologia segue as etapas", () => {
  assert.equal(currentPhase(stages).phase, "LEVANTAR");
  assert.equal(currentPhase(stages.map(s => s.stage_number === 1 ? { ...s, status: "completed" } : s)).phase, "PADRONIZAR");
  assert.equal(currentPhase(stages.map(s => s.stage_number === 1 ? { ...s, status: "completed" } : s), 2).phase, "TREINAR");
  assert.equal(currentPhase(stages.map(s => s.stage_number < 6 ? { ...s, status: "completed" } : s)).phase, "ACOMPANHAR");
});

test("consultor sem visita pede o registro da visita e não sugere cálculo", () => {
  const advice = buildAdvice({ stages });
  assert.equal(advice.phase, "LEVANTAR");
  assert.match(advice.actions[0].title, /Registre a visita/);
  assert.ok(advice.cautions.some(c => /não solicite pesagem/.test(c)));
  assert.ok(advice.calculations.every(c => c.ready === false));
});

test("consultor prioriza críticos, trata declaração como relato e cita a base", () => {
  const advice = buildAdvice({
    stages, visits: [visit],
    responses: [
      { question_key: "purchases", answer: "O dono compra quando lembra.", evidence_status: "declared", situation: "critical" },
      { question_key: "menu", answer: "Rodízio e à la carte.", evidence_status: "confirmed", situation: "adequate" },
      { question_key: "stock", answer: "Talvez haja desvio.", evidence_status: "hypothesis", situation: null },
    ],
  });
  const first = advice.actions[0];
  assert.equal(first.priority, "alta");
  assert.match(first.title, /Crítico/);
  assert.match(first.detail, /não confirmada/);
  assert.match(first.detail, /notas fiscais/);
  assert.deepEqual(first.basis, ["purchases"]);
  assert.ok(advice.actions.some(a => /hipótese/.test(a.title)));
  assert.ok(advice.actions.some(a => /Classifique 1/.test(a.title)));
  assert.ok(advice.cautions.some(c => /fatos confirmados/.test(c)));
  assert.ok(!JSON.stringify(advice).match(/R\$|\d+%/), "não apresenta valores financeiros");
});

test("consultor aponta tarefas bloqueadas, vencidas e sem responsável", () => {
  const advice = buildAdvice({ stages, visits: [visit], today: "2026-11-10", tasks: [
    { id: "1", title: "A", status: "blocked", assignee_name: "Gi" },
    { id: "2", title: "B", status: "in_progress", due_on: "2026-11-06", assignee_name: null },
    { id: "3", title: "C", status: "completed" },
  ] });
  assert.ok(advice.actions.some(a => /1 tarefa\(s\) bloqueada/.test(a.title)));
  assert.ok(advice.actions.some(a => /prazo vencido/.test(a.title)));
  assert.ok(advice.actions.some(a => /sem responsável/.test(a.title)));
});

test("cálculos só ficam disponíveis com dados reais suficientes", () => {
  const none = calculationReadiness({});
  assert.deepEqual(none[1].missing, ["inventário inicial e final fechados", "compras do período recebidas", "faturamento do período"]);
  const ready = calculationReadiness({ closedInventories: 2, receivedPurchases: 3, salesRecords: 30, ingredientsWithPrice: 1, recipesWithItems: 1 });
  assert.ok(ready.every(r => r.ready));
});

test("relatório da visita reúne respostas, pendências, tarefas e próximos passos", () => {
  const report = buildVisitReport({
    establishment: site, visit,
    responses: [
      { question_key: "management", answer: "Robério decide.", evidence_status: "declared", situation: "adequate", visit_id: "v1" },
      { question_key: "stock", answer: "Sem controle.", evidence_status: "pending", situation: "critical", visit_id: "v0" },
    ],
    tasks: [
      { id: "t1", title: "Enviar notas fiscais", status: "in_progress", assignee_name: "Gi", due_on: "2026-11-12", visit_id: "v1" },
      { id: "t2", title: "Entrevistar a gestão", status: "completed" },
    ],
    evidence: [{ file_name: "cardapio.pdf", visit_id: "v1", question_key: "management" }],
  });
  assert.equal(report.visitDate, "05/11/2026");
  assert.equal(report.contract, "19/10/2026 a 18/04/2027");
  assert.equal(report.summary.answered, 2);
  assert.equal(report.summary.inThisVisit, 1);
  assert.equal(report.summary.attachments, 1);
  assert.equal(report.summary.situations["Crítico"], 1);
  assert.equal(report.topics[0].attachments[0], "cardapio.pdf");
  assert.ok(report.pendingItems.some(p => p.startsWith("Pendente:")));
  assert.equal(report.pendingItems.filter(p => p.startsWith("Tópico não registrado")).length, 13);
  assert.deepEqual(report.openTasks[0], { title: "Enviar notas fiscais", status: "Em andamento", assignee: "Gi", due: "12/11/2026", fromThisVisit: true });
  assert.deepEqual(report.completedTasks, ["Entrevistar a gestão"]);
  assert.deepEqual(report.nextSteps, ["Enviar cardápio", "Agendar visita de estoque"]);
  const text = reportToText(report);
  assert.match(text, /Próximos passos:\n- Enviar cardápio/);
  assert.match(text, /não contém estimativas/);
});
