// Pacote de contexto ("cmv-mestre.contexto" 1.0): o estado atual da implantação,
// exportado do CMV Mestre para a análise técnica no ChatGPT.
// Só leitura: monta o JSON a partir do que o app já carregou. Não grava nada.
//
// O contexto leva os códigos existentes para o ChatGPT reaproveitá-los em vez de inventar
// novos, e o status de execução para ele saber o que já foi feito (somente leitura).

import { CONTEXT_FORMAT, MATURITY, computePlanning, contextSignature } from "./package.mjs";
import { DIAGNOSTIC_QUESTIONS } from "./diagnostic.mjs";

export const CONTEXT_VERSION = "1.0";

/**
 * Tarefas iniciais criadas por start_initial_workspace, na ordem da função.
 * Enquanto a coluna external_key não existir no banco (Fase 2), essas seis recebem
 * os códigos provisórios T-E1-001 a T-E1-006 por este título, que é o mesmo da criação.
 */
export const SEED_TASKS_E1 = [
  "Entrevistar a gestão",
  "Mapear estrutura e responsáveis",
  "Levantar cardápio e operação",
  "Verificar compras, recebimento e estoque",
  "Listar sistemas e documentos disponíveis",
  "Revisar diagnóstico com a gestão",
];

const EVIDENCE = { confirmed: "confirmada", declared: "declarada", hypothesis: "hipotese", pending: "pendente" };
const SITUATION = { critical: "critico", attention: "atencao", adequate: "adequado", not_applicable: "nao_se_aplica" };
const PRIORITY = { high: "alta", normal: "normal", low: "baixa" };
const stageCode = n => `E${n}`;
const pad = n => String(n).padStart(3, "0");

/**
 * Atribui o código de cada tarefa: o external_key gravado, quando existir; senão um
 * código provisório determinístico (tarefas iniciais pelo título; demais pela data de
 * criação, título e id, numeradas depois das já usadas na etapa).
 * @param {{ id: string, title: string, stage_number: number | null, created_at?: string, external_key?: string | null }[]} tasks
 */
export function assignTaskCodes(tasks) {
  const codes = new Map();
  const used = new Set(tasks.map(t => t.external_key).filter(Boolean));
  for (const t of tasks) if (t.external_key) codes.set(t.id, { code: t.external_key, provisional: false });
  const pending = tasks.filter(t => !t.external_key && t.stage_number);
  const byStage = new Map();
  for (const t of pending) {
    if (!byStage.has(t.stage_number)) byStage.set(t.stage_number, []);
    byStage.get(t.stage_number).push(t);
  }
  for (const [n, list] of [...byStage.entries()].sort((a, b) => a[0] - b[0])) {
    if (n === 1) {
      for (const t of list) {
        const seed = SEED_TASKS_E1.indexOf(t.title);
        const code = `T-E1-${pad(seed + 1)}`;
        if (seed >= 0 && !used.has(code)) { codes.set(t.id, { code, provisional: true }); used.add(code); }
      }
    }
    const rest = list.filter(t => !codes.has(t.id)).sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    let next = 1;
    for (const t of rest) {
      while (used.has(`T-E${n}-${pad(next)}`)) next++;
      const code = `T-E${n}-${pad(next)}`;
      codes.set(t.id, { code, provisional: true }); used.add(code);
    }
  }
  return codes;
}

/**
 * Monta o contexto (sem assinatura). Para assinar, use exportContext.
 * @param {{
 *   establishment: { name: string, segment?: string | null },
 *   stages: { id: string, stage_number: number, title: string, objective: string, status: string, target_start?: string | null, target_end?: string | null, completed_at?: string | null }[],
 *   tasks: { id: string, title: string, description?: string | null, status: string, stage_id: string | null, assignee_name?: string | null, due_on?: string | null, priority?: string, completed_at?: string | null, created_at?: string, external_key?: string | null }[],
 *   responses?: { question_key: string, answer: string, evidence_status: string, situation?: string | null, notes?: string | null, updated_at?: string }[],
 *   visits?: { visit_date: string, status?: string }[],
 *   evidence?: { question_key?: string | null, created_at?: string, file_name?: string }[],
 *   diagnosticId?: string | null,
 *   packages?: { id: string, sha256: string, fase: string, importado_em?: string }[],
 *   lastClosing?: { fase: string, sha256: string, fechado_em?: string } | null,
 *   generatedAt: string,
 *   includeNames?: boolean,
 *   includeAnswers?: boolean,
 * }} input
 */
export function buildContext(input) {
  const { establishment, stages = [], tasks = [], responses = [], visits = [], evidence = [], diagnosticId = null, packages = [], lastClosing = null, generatedAt, includeNames = false, includeAnswers = true } = input;
  if (!establishment || !generatedAt) throw new Error("Estabelecimento e data de geração são obrigatórios.");
  const today = generatedAt.slice(0, 10);
  const stageById = new Map(stages.map(s => [s.id, s]));
  const withStage = tasks.map(t => ({ ...t, stage_number: stageById.get(t.stage_id ?? "")?.stage_number ?? null }));
  const codes = assignTaskCodes(withStage);

  const etapas = [...stages].sort((a, b) => a.stage_number - b.stage_number).map(s => ({
    id: stageCode(s.stage_number),
    titulo: s.title,
    objetivo: s.objective,
    status: s.status,
    inicio_previsto: s.target_start ?? null,
    fim_previsto: s.target_end ?? null,
    concluida_em: s.completed_at ?? null,
    criterios: [],
  }));

  const semEtapa = withStage.filter(t => !t.stage_number).length;
  const tarefas = withStage.filter(t => t.stage_number).map(t => {
    const c = codes.get(t.id);
    return {
      id: c.code,
      codigo_provisorio: c.provisional,
      etapa: stageCode(t.stage_number),
      titulo: t.title,
      descricao: t.description ?? null,
      origem: t.external_key ? "pacote" : "manual",
      status_execucao: t.status,
      verificada: t.status === "completed" ? null : false,
      prioridade: PRIORITY[t.priority ?? "normal"] ?? "normal",
      prazo_aceito: t.due_on ?? null,
      responsavel: includeNames ? (t.assignee_name ?? null) : (t.assignee_name ? "definido" : null),
      concluida_em: t.completed_at ?? null,
      depende_de: [],
      criterios: [],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const known = new Map(responses.map(r => [r.question_key, r]));
  const diagnostico = DIAGNOSTIC_QUESTIONS.map(q => {
    const r = known.get(q.key);
    const row = {
      topico: q.key,
      pergunta: q.question,
      registrado: Boolean(r),
      confirmacao: r ? (EVIDENCE[r.evidence_status] ?? r.evidence_status) : null,
      situacao: r?.situation ? (SITUATION[r.situation] ?? r.situation) : null,
      evidencias: evidence.filter(e => e.question_key === q.key).length,
    };
    if (includeAnswers && r) Object.assign(row, { resposta: r.answer, observacao: r.notes ?? null });
    return row;
  });

  const sortedVisits = [...visits].sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date)));
  const planning = computePlanning({ etapas, tarefas, controles: [] }, today);
  const byId = new Map(planning.tarefas.map(p => [p.id, p]));
  for (const t of tarefas) Object.assign(t, { estado_planejamento: byId.get(t.id)?.estado ?? null, atrasada: byId.get(t.id)?.atrasada ?? false });

  return {
    formato: CONTEXT_FORMAT,
    versao_formato: CONTEXT_VERSION,
    contexto: { gerado_em: generatedAt, gerado_por: "CMV Mestre", assinatura: null },
    estabelecimento: { nome: establishment.name, segmento: establishment.segment ?? null },
    diagnostico_id: diagnosticId,
    regras: {
      etapas_validas: etapas.map(e => e.id),
      niveis_maturidade: MATURITY,
      observacao: "Somente leitura. Reutilize os códigos existentes; crie códigos novos só para itens novos. Status de execução, critérios cumpridos e níveis de controle são registrados pela equipe e não podem ser alterados pelo pacote.",
    },
    etapas,
    tarefas,
    tarefas_sem_etapa: semEtapa,
    problemas: [],
    controles: [],
    orientacoes: [],
    indicadores: [],
    diagnostico,
    visitas: { total: visits.length, ultima_data: sortedVisits[0]?.visit_date ?? null, em_aberto: visits.filter(v => v.status !== "completed").length },
    evidencias: { total: evidence.length },
    pacotes_importados: packages,
    ultimo_fechamento: lastClosing,
    proximo_passo: planning.proximoPasso,
    travas: planning.travas,
    limitacoes: [
      ...(tarefas.some(t => t.codigo_provisorio) ? ["Códigos de tarefa provisórios: o banco ainda não guarda external_key. Eles serão gravados iguais na Fase 2."] : []),
      "Problemas, controles, orientações, indicadores e critérios ainda não têm tabela no banco (Fase 2); as listas vêm vazias.",
    ],
  };
}

/** Monta e assina o contexto. */
export async function exportContext(input) {
  const ctx = buildContext(input);
  ctx.contexto.assinatura = await contextSignature(ctx);
  return ctx;
}

/** Nome do arquivo: cmv-contexto-<estabelecimento>-<data>.json */
export function contextFileName(establishmentName, generatedAt) {
  const slug = String(establishmentName).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `cmv-contexto-${slug}-${generatedAt.slice(0, 10)}.json`;
}
