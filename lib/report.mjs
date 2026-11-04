// Relatório da visita: monta o conteúdo a partir dos registros gravados.
// Determinístico: mesma entrada, mesmo relatório. Não inventa informação.

import { DIAGNOSTIC_QUESTIONS, AREA_LABELS, EVIDENCE_STATUS, SITUATION, TASK_STATUS, VISIT_TYPES } from "./diagnostic.mjs";

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * @param {{
 *   establishment: { name: string, segment?: string | null, contract_start?: string | null, contract_end?: string | null },
 *   visit: { id: string, visit_date: string, visit_type?: string, participants?: string[], objective?: string | null, observations?: string | null, next_steps?: string | null, status?: string },
 *   responses?: { question_key: string, answer: string, evidence_status: string, situation?: string | null, notes?: string | null, visit_id?: string | null }[],
 *   tasks?: { id: string, title: string, status: string, assignee_name?: string | null, due_on?: string | null, priority?: string, visit_id?: string | null }[],
 *   evidence?: { file_name: string, visit_id?: string | null, question_key?: string | null, description?: string | null }[],
 *   advice?: { cautions?: string[] },
 * }} input
 */
export function buildVisitReport({ establishment, visit, responses = [], tasks = [], evidence = [], advice }) {
  if (!establishment || !visit) throw new Error("Selecione um estabelecimento e uma visita.");
  const byKey = new Map(responses.map(r => [r.question_key, r]));

  const topics = DIAGNOSTIC_QUESTIONS.map((q, index) => {
    const r = byKey.get(q.key);
    return {
      number: index + 1,
      key: q.key,
      area: AREA_LABELS[q.area],
      question: q.question,
      answer: r?.answer ?? null,
      evidence: r ? EVIDENCE_STATUS[r.evidence_status]?.label ?? r.evidence_status : "Não registrado",
      situation: r?.situation ? SITUATION[r.situation]?.label ?? r.situation : null,
      notes: r?.notes ?? null,
      recordedInThisVisit: Boolean(r && r.visit_id === visit.id),
      attachments: evidence.filter(e => e.question_key === q.key && e.visit_id === visit.id).map(e => e.file_name),
    };
  });

  const answered = topics.filter(t => t.answer !== null);
  const situationCount = Object.fromEntries(Object.entries(SITUATION).map(([k, v]) => [v.label, responses.filter(r => r.situation === k).length]));

  const pendingItems = [
    ...topics.filter(t => t.answer === null).map(t => `Tópico não registrado: ${t.question}`),
    ...topics.filter(t => t.answer !== null && (t.evidence === EVIDENCE_STATUS.pending.label || t.evidence === EVIDENCE_STATUS.hypothesis.label)).map(t => `${t.evidence}: ${t.question}`),
  ];

  const openTasks = tasks.filter(t => t.status !== "completed").map(t => ({
    title: t.title,
    status: TASK_STATUS[t.status] ?? t.status,
    assignee: t.assignee_name || "Sem responsável",
    due: t.due_on ? formatDate(t.due_on) : "Sem prazo",
    fromThisVisit: t.visit_id === visit.id,
  }));
  const completedTasks = tasks.filter(t => t.status === "completed").map(t => t.title);

  const nextSteps = String(visit.next_steps ?? "").split(/\n+/).map(s => s.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);

  return {
    title: `Relatório da visita · ${establishment.name}`,
    establishment: establishment.name,
    segment: establishment.segment ?? null,
    contract: establishment.contract_start ? `${formatDate(establishment.contract_start)} a ${formatDate(establishment.contract_end)}` : null,
    visitDate: formatDate(visit.visit_date),
    visitType: VISIT_TYPES[visit.visit_type ?? "diagnostic"] ?? visit.visit_type,
    visitStatus: visit.status === "completed" ? "Concluída" : "Em aberto",
    participants: visit.participants ?? [],
    objective: visit.objective ?? null,
    observations: visit.observations ?? null,
    summary: {
      answered: answered.length,
      total: topics.length,
      inThisVisit: topics.filter(t => t.recordedInThisVisit).length,
      confirmed: responses.filter(r => r.evidence_status === "confirmed").length,
      declared: responses.filter(r => r.evidence_status === "declared").length,
      attachments: evidence.filter(e => e.visit_id === visit.id).length,
      situations: situationCount,
    },
    topics,
    pendingItems,
    openTasks,
    completedTasks,
    nextSteps,
    cautions: advice?.cautions ?? [],
    disclaimer: "Respostas marcadas como declaradas refletem o que foi informado e ainda não foram confirmadas por evidência. Este relatório não contém estimativas de custo ou CMV.",
  };
}

/** Versão em texto simples, útil para copiar em e-mail ou mensagem. */
export function reportToText(report) {
  const lines = [
    report.title,
    `Data: ${report.visitDate} · ${report.visitType} · ${report.visitStatus}`,
    report.participants.length ? `Participantes: ${report.participants.join(", ")}` : "Participantes: não informados",
    "",
    `Tópicos registrados: ${report.summary.answered}/${report.summary.total} (confirmados: ${report.summary.confirmed})`,
  ];
  if (report.observations) lines.push("", "Observações:", report.observations);
  lines.push("", "Pendências:", ...(report.pendingItems.length ? report.pendingItems.map(p => `- ${p}`) : ["- Nenhuma"]));
  lines.push("", "Tarefas em aberto:", ...(report.openTasks.length ? report.openTasks.map(t => `- ${t.title} (${t.assignee}, ${t.status}, ${t.due})`) : ["- Nenhuma"]));
  lines.push("", "Próximos passos:", ...(report.nextSteps.length ? report.nextSteps.map(s => `- ${s}`) : ["- A definir"]));
  lines.push("", report.disclaimer);
  return lines.join("\n");
}
