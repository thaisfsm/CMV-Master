// Roteiro e regras do diagnóstico inicial (Etapa 01 · LEVANTAR).
// As chaves (`key`) são as mesmas já gravadas no banco; não renomear.

/** @typedef {{ key: string, question: string, area: string, why: string }} DiagnosticQuestion */

/** @type {DiagnosticQuestion[]} */
export const DIAGNOSTIC_QUESTIONS = [
  { key: "management", area: "gestao", question: "Como a gestão está organizada e quem decide sobre a operação?", why: "Saber quem decide evita retrabalho e define quem aprova cada etapa." },
  { key: "expectations", area: "gestao", question: "Quais resultados a gestão espera alcançar com a implantação?", why: "As expectativas declaradas orientam as prioridades da consultoria." },
  { key: "difficulties", area: "gestao", question: "Quais são hoje as maiores dificuldades da operação?", why: "As dificuldades relatadas indicam onde começar a investigar." },
  { key: "structure", area: "operacao", question: "Quais áreas e espaços compõem a operação?", why: "O mapa físico mostra onde ocorrem produção, armazenamento e serviço." },
  { key: "responsibles", area: "equipe", question: "Quem são os responsáveis por cada área e processo?", why: "Cada processo precisa de um responsável antes de ser padronizado." },
  { key: "menu", area: "cardapio", question: "Quais categorias e itens fazem parte do cardápio atual?", why: "Rodízio, pizzas salgadas e doces, mini hambúrguer, batata, japonês e espetinhos têm rotinas distintas." },
  { key: "production", area: "operacao", question: "Como a produção e o serviço funcionam em um dia típico?", why: "A rotina relatada mostra pontos de consumo e de perda sem presumir práticas." },
  { key: "purchases", area: "compras", question: "Como as compras são solicitadas e aprovadas atualmente?", why: "Compras sem critério de aprovação costumam explicar variações de custo." },
  { key: "receiving", area: "compras", question: "Como é feito o recebimento e a conferência das mercadorias?", why: "Sem conferência, a quantidade paga pode diferir da recebida." },
  { key: "stock", area: "estoque", question: "Como os itens são armazenados e como o estoque é acompanhado?", why: "O controle de estoque é a base do CMV real." },
  { key: "systems", area: "controles", question: "Quais sistemas são utilizados na gestão e na operação?", why: "Os sistemas existentes podem fornecer vendas e compras sem digitação dupla." },
  { key: "controls", area: "controles", question: "Quais controles já são realizados? Quem os atualiza?", why: "Controles existentes devem ser aproveitados, não substituídos sem motivo." },
  { key: "documents", area: "controles", question: "Quais documentos, relatórios ou registros estão disponíveis?", why: "Documentos permitem confirmar informações declaradas." },
  { key: "team", area: "equipe", question: "Como a equipe está distribuída por função e turno?", why: "Treinamentos dependem de quem executa cada tarefa e em qual turno." },
  { key: "visit", area: "gestao", question: "Há alguma observação importante desta visita diagnóstica?", why: "Registre percepções gerais, sempre separando o observado do relatado." },
];

export const AREA_LABELS = {
  gestao: "Gestão",
  operacao: "Operação",
  equipe: "Equipe",
  cardapio: "Cardápio",
  compras: "Compras e recebimento",
  estoque: "Estoque",
  controles: "Controles e documentos",
};

// Grau de confiabilidade da informação.
export const EVIDENCE_STATUS = {
  confirmed: { label: "Confirmada", description: "Verificada por evidência registrada." },
  declared: { label: "Declarada", description: "Informada, ainda sem comprovação." },
  hypothesis: { label: "Hipótese", description: "Possibilidade a investigar." },
  pending: { label: "Pendente", description: "Informação que ainda falta coletar." },
};

// Situação observada no tópico (classificação da consultora).
export const SITUATION = {
  critical: { label: "Crítico", description: "Precisa de ação prioritária." },
  attention: { label: "Atenção", description: "Funciona, mas com fragilidades." },
  adequate: { label: "Adequado", description: "Funciona de forma satisfatória." },
  not_applicable: { label: "Não se aplica", description: "Não faz parte desta operação." },
};

export const TASK_STATUS = {
  not_started: "Não iniciada",
  in_progress: "Em andamento",
  awaiting_information: "Aguardando informação",
  awaiting_approval: "Aguardando aprovação",
  completed: "Concluída",
  blocked: "Bloqueada",
};

export const TASK_PRIORITY = { high: "Alta", normal: "Normal", low: "Baixa" };

export const VISIT_TYPES = {
  diagnostic: "Diagnóstico",
  follow_up: "Acompanhamento",
  training: "Treinamento",
  closing: "Fechamento",
  other: "Outra",
};

/**
 * Normaliza e valida uma resposta antes de gravar.
 * @param {{ answer?: string, evidenceStatus?: string, situation?: string | null, notes?: string | null }} input
 */
export function validateResponse(input) {
  const answer = (input.answer ?? "").trim();
  if (!answer) throw new Error("Registre a resposta antes de salvar.");
  const evidenceStatus = input.evidenceStatus ?? "declared";
  if (!(evidenceStatus in EVIDENCE_STATUS)) throw new Error("Grau de confirmação inválido.");
  const situation = input.situation ? input.situation : null;
  if (situation !== null && !(situation in SITUATION)) throw new Error("Situação inválida.");
  const notes = (input.notes ?? "").trim() || null;
  return { answer, evidence_status: evidenceStatus, situation, notes };
}

/**
 * Progresso do roteiro a partir das respostas gravadas.
 * @param {{ question_key: string, evidence_status?: string, situation?: string | null }[]} responses
 */
export function diagnosticProgress(responses) {
  const known = new Set(DIAGNOSTIC_QUESTIONS.map(q => q.key));
  const answered = new Set(responses.filter(r => known.has(r.question_key)).map(r => r.question_key));
  const total = DIAGNOSTIC_QUESTIONS.length;
  const classified = responses.filter(r => known.has(r.question_key) && r.situation).length;
  const confirmed = responses.filter(r => known.has(r.question_key) && r.evidence_status === "confirmed").length;
  return {
    total,
    answered: answered.size,
    classified,
    confirmed,
    percent: Math.round((answered.size / total) * 100),
    missing: DIAGNOSTIC_QUESTIONS.filter(q => !answered.has(q.key)).map(q => q.key),
  };
}

/** Caminho do arquivo no bucket privado: organização/estabelecimento/visita/arquivo. */
export function evidencePath({ organizationId, establishmentId, visitId, fileName, id }) {
  if (!organizationId || !establishmentId) throw new Error("Organização e estabelecimento são obrigatórios.");
  const clean = String(fileName || "arquivo")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(-80);
  return `${organizationId}/${establishmentId}/${visitId || "sem-visita"}/${id}-${clean}`;
}

export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;
export const ALLOWED_EVIDENCE_TYPES = [
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
];

/** @param {{ size: number, type: string }} file */
export function validateEvidenceFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error("Arquivo vazio ou inválido.");
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error("O arquivo deve ter no máximo 20 MB.");
  if (!ALLOWED_EVIDENCE_TYPES.includes(file.type)) throw new Error("Tipo de arquivo não aceito. Use foto (JPG, PNG, WEBP, HEIC), PDF, Word, Excel, CSV ou texto.");
  return true;
}
