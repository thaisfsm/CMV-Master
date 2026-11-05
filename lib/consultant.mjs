// Consultor CMV Mestre: orientação determinística baseada nos registros.
// Não usa IA, não estima valores e não trata declarações como fatos.
// Metodologia: LEVANTAR → PADRONIZAR → TREINAR → ACOMPANHAR.

import { DIAGNOSTIC_QUESTIONS, AREA_LABELS, SITUATION } from "./diagnostic.mjs";

export const METHODOLOGY = ["LEVANTAR", "PADRONIZAR", "TREINAR", "ACOMPANHAR"];

// O que fazer, na fase LEVANTAR, quando um tópico está crítico ou em atenção.
// Sempre ações de levantamento/confirmação: nada de pesagem, custeio ou padronização.
const LEVANTAR_ACTIONS = {
  gestao: "Agende uma conversa com a gestão para detalhar o ponto e registrar quem decide e quando.",
  operacao: "Observe a rotina no horário de produção e registre o que foi visto, com fotos se autorizado.",
  equipe: "Liste as pessoas envolvidas por turno e confirme com a gestão quem responde por cada processo.",
  cardapio: "Solicite o cardápio vigente (impresso ou digital) e anexe como evidência.",
  compras: "Solicite exemplos de pedidos e notas fiscais recentes para confirmar como a compra acontece.",
  estoque: "Visite as áreas de armazenamento e registre como os itens são guardados e identificados.",
  controles: "Peça para ver os controles ou relatórios citados e anexe uma cópia ou foto.",
};

/**
 * @typedef {{ question_key: string, answer: string, evidence_status: string, situation?: string | null }} Resp
 * @typedef {{ id: string, title: string, status: string, assignee_name?: string | null, due_on?: string | null }} Task
 * @typedef {{ stage_number: number, status: string, title?: string }} Stage
 * @typedef {{ id: string, visit_date: string, status?: string }} Visit
 * @typedef {{ priority: "alta" | "media" | "baixa", title: string, detail: string, basis: string[] }} Advice
 */

/** Fase atual da metodologia a partir das etapas e treinamentos. */
export function currentPhase(stages = [], trainingCount = 0) {
  const sorted = [...stages].sort((a, b) => a.stage_number - b.stage_number);
  const current = sorted.find(s => s.status !== "completed");
  if (!current || current.stage_number === 1) return { phase: "LEVANTAR", stage: current?.stage_number ?? 1 };
  if (current.stage_number === 6) return { phase: "ACOMPANHAR", stage: 6 };
  return { phase: trainingCount > 0 ? "TREINAR" : "PADRONIZAR", stage: current.stage_number };
}

function excerpt(text, size = 140) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > size ? `${clean.slice(0, size - 1)}…` : clean;
}

/**
 * Indica quais cálculos financeiros podem ser feitos e o que falta.
 * Nunca calcula com dados ausentes ou presumidos.
 */
export function calculationReadiness({ ingredientsWithPrice = 0, recipesWithItems = 0, closedInventories = 0, receivedPurchases = 0, salesRecords = 0 } = {}) {
  const items = [
    {
      name: "Custo de receitas e ficha técnica",
      ready: ingredientsWithPrice > 0 && recipesWithItems > 0,
      missing: [
        ingredientsWithPrice > 0 ? null : "ingredientes com preço informado",
        recipesWithItems > 0 ? null : "receitas com ingredientes e quantidades pesadas",
      ].filter(Boolean),
    },
    {
      name: "CMV real do período",
      ready: closedInventories >= 2 && receivedPurchases > 0 && salesRecords > 0,
      missing: [
        closedInventories >= 2 ? null : "inventário inicial e final fechados",
        receivedPurchases > 0 ? null : "compras do período recebidas",
        salesRecords > 0 ? null : "faturamento do período",
      ].filter(Boolean),
    },
  ];
  return items;
}

/**
 * Gera a orientação do consultor.
 * @param {{ responses?: Resp[], tasks?: Task[], stages?: Stage[], visits?: Visit[], evidenceCount?: number, trainingCount?: number, today?: string, calc?: Parameters<typeof calculationReadiness>[0] }} data
 */
export function buildAdvice({ responses = [], tasks = [], stages = [], visits = [], evidenceCount = 0, trainingCount = 0, today, calc } = {}) {
  const { phase, stage } = currentPhase(stages, trainingCount);
  const byKey = new Map(responses.map(r => [r.question_key, r]));
  const questions = DIAGNOSTIC_QUESTIONS;
  /** @type {Advice[]} */
  const actions = [];
  const cautions = [];

  if (visits.length === 0) {
    actions.push({ priority: "alta", title: "Registre a visita de hoje", detail: "Toda resposta, foto e tarefa fica vinculada a uma visita. Comece pela data e pelos participantes.", basis: [] });
  }

  // Tópicos críticos e em atenção, sempre pedindo confirmação antes de qualquer conclusão.
  for (const level of ["critical", "attention"]) {
    for (const q of questions) {
      const r = byKey.get(q.key);
      if (!r || r.situation !== level) continue;
      const confirmed = r.evidence_status === "confirmed";
      actions.push({
        priority: level === "critical" ? "alta" : "media",
        title: `${SITUATION[level].label}: ${AREA_LABELS[q.area]} — ${q.question}`,
        detail: `${confirmed ? "Informação confirmada por evidência." : "Informação ainda não confirmada; trate como relato."} ${phase === "LEVANTAR" ? LEVANTAR_ACTIONS[q.area] : "Defina com a gestão o padrão a adotar e o responsável."} Registro: “${excerpt(r.answer)}”`,
        basis: [q.key],
      });
    }
  }

  // Declarações e hipóteses que precisam de evidência.
  const toConfirm = questions.filter(q => {
    const r = byKey.get(q.key);
    return r && (r.evidence_status === "declared" || r.evidence_status === "hypothesis") && (r.situation === "critical" || r.situation === "attention");
  });
  if (toConfirm.length) {
    cautions.push(`${toConfirm.length} tópico(s) classificados como crítico ou atenção ainda não têm evidência. Não apresente esses pontos à gestão como fatos confirmados.`);
  }
  const hypotheses = questions.filter(q => byKey.get(q.key)?.evidence_status === "hypothesis");
  if (hypotheses.length) {
    actions.push({ priority: "media", title: `Investigue ${hypotheses.length} hipótese(s)`, detail: "Hipóteses são possibilidades, não conclusões. Defina como confirmar ou descartar cada uma.", basis: hypotheses.map(q => q.key) });
  }

  // Roteiro incompleto.
  const missing = questions.filter(q => !byKey.has(q.key));
  if (missing.length) {
    actions.push({
      priority: phase === "LEVANTAR" ? "alta" : "media",
      title: `Complete o roteiro: faltam ${missing.length} de ${questions.length} tópicos`,
      detail: `Próximos tópicos: ${missing.slice(0, 3).map(q => q.question).join(" · ")}`,
      basis: missing.map(q => q.key),
    });
  }

  const unclassified = questions.filter(q => byKey.has(q.key) && !byKey.get(q.key).situation);
  if (unclassified.length) {
    actions.push({ priority: "baixa", title: `Classifique ${unclassified.length} resposta(s)`, detail: "Indique se cada tópico está crítico, em atenção, adequado ou não se aplica. A classificação orienta as prioridades.", basis: unclassified.map(q => q.key) });
  }

  // Tarefas.
  const open = tasks.filter(t => t.status !== "completed");
  const blocked = open.filter(t => t.status === "blocked");
  const overdue = today ? open.filter(t => t.due_on && t.due_on < today) : [];
  const unassigned = open.filter(t => !t.assignee_name);
  if (blocked.length) actions.push({ priority: "alta", title: `${blocked.length} tarefa(s) bloqueada(s)`, detail: blocked.map(t => t.title).join(" · "), basis: [] });
  if (overdue.length) actions.push({ priority: "media", title: `${overdue.length} tarefa(s) com prazo vencido`, detail: overdue.map(t => t.title).join(" · "), basis: [] });
  if (unassigned.length) actions.push({ priority: "baixa", title: `${unassigned.length} tarefa(s) sem responsável`, detail: "Defina quem executa cada tarefa para acompanhar a evolução.", basis: [] });

  if (phase === "LEVANTAR") {
    cautions.push("Etapa diagnóstica: não solicite pesagem, custos, fichas técnicas nem padronização nesta visita.");
    if (missing.length === 0 && open.length === 0) {
      actions.unshift({ priority: "alta", title: "Diagnóstico pronto para revisão com a gestão", detail: "Todos os tópicos foram registrados e as tarefas da etapa estão concluídas. Apresente o relatório e registre a aprovação antes de iniciar a padronização.", basis: [] });
    }
  }
  if (evidenceCount === 0 && responses.length > 0) {
    cautions.push("Nenhuma evidência anexada até agora: todas as respostas continuam como relatos.");
  }

  const calculations = calculationReadiness(calc);
  const order = { alta: 0, media: 1, baixa: 2 };
  actions.sort((a, b) => order[a.priority] - order[b.priority]);

  const headline = visits.length === 0
    ? "Comece registrando a visita."
    : missing.length
      ? `Diagnóstico em andamento: ${questions.length - missing.length} de ${questions.length} tópicos registrados.`
      : "Roteiro completo. Revise classificações e evidências.";

  return { phase, stage, methodology: METHODOLOGY, headline, actions, cautions, calculations, basisCount: responses.length };
}
