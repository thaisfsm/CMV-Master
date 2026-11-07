// Pacote de análise da consultoria (formato "cmv-mestre.pacote-analise" 1.0).
// Validação pura: não acessa banco, rede nem armazenamento. Mesma entrada, mesmo resultado.
// Esquema oficial: docs/pacote-analise/pacote-analise.schema.json
// Regras de negócio: docs/pacote-analise/INSTRUCOES_CHATGPT.md
//
// Princípio: o pacote RECOMENDA; só a equipe EXECUTA. O pacote nunca marca execução,
// nunca informa valor medido e nunca apaga nada. Itens não citados ficam como estão.

import { DIAGNOSTIC_QUESTIONS } from "./diagnostic.mjs";

export const PACKAGE_FORMAT = "cmv-mestre.pacote-analise";
export const CONTEXT_FORMAT = "cmv-mestre.contexto";
export const SUPPORTED_VERSIONS = ["1.0"];

/** As seis etapas do contrato. O pacote não cria etapas. */
export const STAGES = ["E1", "E2", "E3", "E4", "E5", "E6"];
export const TOPICS = DIAGNOSTIC_QUESTIONS.map(q => q.key);
export const SEVERITY = ["critico", "atencao", "melhoria"];
export const CONFIRMATION = ["confirmada", "declarada", "hipotese"];
export const PRIORITY = ["alta", "normal", "baixa"];
/** Níveis de maturidade de um controle, do menor para o maior. */
export const MATURITY = ["inexistente", "informal", "implantado", "consolidado"];
export const DIRECTION = ["subir", "descer"];
export const FREQUENCY = ["diaria", "semanal", "quinzenal", "mensal", "por-fase"];
export const ORIGIN_TYPES = ["diagnostico-enrico", "fechamento-fase"];
export const SUGGESTION_TYPES = ["problema", "tarefa", "controle"];
export const SUGGESTIONS = ["resolver", "cancelar", "reabrir"];

export const CODE = {
  package: /^PKG-[A-Z0-9]+-\d{8}-E[1-6]-\d{2}$/,
  stage: /^E[1-6]$/,
  stageCriterion: /^E[1-6]-C\d{1,2}$/,
  finding: /^PRB-\d{3}$/,
  task: /^T-E[1-6]-\d{3}$/,
  taskCriterion: /^T-E[1-6]-\d{3}-C\d{1,2}$/,
  guidance: /^ORI-\d{3}$/,
  indicator: /^IND-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
  control: /^CTL-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
  diagnostic: /^diag-[A-Za-z0-9_-]+$/,
  sha256: /^[0-9a-f]{64}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
};

/** Campos que o pacote não pode trazer em lugar nenhum: execução, medição ou exclusão. */
export const FORBIDDEN_FIELDS = [
  "status", "status_execucao", "situacao_execucao", "concluida", "concluido", "concluida_em", "data_conclusao",
  "feito", "executado", "executada", "completed", "completed_at", "done",
  "valor_medido", "medicao", "medicoes", "valor_atual", "resultado_medido", "cmv_real",
  "criterio_cumprido", "cumprido", "nivel_atual",
  "apagar", "excluir", "remover", "delete", "deletar",
];

const ALLOWED = {
  root: ["formato", "versao_formato", "pacote", "origem", "estabelecimento", "diagnostico", "prioridades", "controles", "etapas", "orientacoes", "indicadores", "sugestoes_de_status", "proximo_passo_recomendado"],
  pacote: ["id", "substitui_pacote", "gerado_em", "gerado_por", "fase", "observacao"],
  origem: ["tipo", "diagnostico_id", "backup_arquivo", "backup_sha256", "fase_fechada", "contexto_assinatura"],
  estabelecimento: ["nome"],
  diagnostico: ["resumo", "problemas"],
  problema: ["id", "titulo", "descricao", "topico", "gravidade", "confirmacao", "base"],
  prioridade: ["ordem", "problema", "motivo"],
  controle: ["id", "nome", "topico", "nivel_observado", "nivel_alvo", "etapa_prevista", "pre_requisitos", "criterio_maturidade", "justificativa"],
  etapa: ["id", "objetivo_recomendado", "criterios_etapa", "tarefas"],
  criterio: ["id", "texto", "exige_evidencia"],
  tarefa: ["id", "titulo", "descricao", "problema", "controle", "prioridade_recomendada", "prazo_recomendado", "responsavel_recomendado", "justificativa", "depende_de", "criterios", "orientacoes"],
  orientacao: ["id", "titulo", "texto", "publico"],
  indicador: ["id", "nome", "definicao", "unidade", "sentido", "linha_de_base", "fonte_linha_de_base", "meta", "frequencia", "etapa_inicio", "controle"],
  sugestao: ["tipo", "id", "sugestao", "motivo"],
};

const stageNumber = code => Number(String(code).match(/E([1-6])/)?.[1] ?? 0);
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = v => typeof v === "string" && v.trim().length > 0;
const level = name => MATURITY.indexOf(name);

/** Texto comparável: sem acento, minúsculo, só letras e números. */
export function normalizeTitle(text) {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const STOPWORDS = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "um", "uma"]);
/** Semelhança entre títulos (0 a 1), pelas palavras em comum. */
export function titleSimilarity(a, b) {
  const words = s => new Set(normalizeTitle(s).split(" ").filter(w => w && !STOPWORDS.has(w)));
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / (x.size + y.size - common);
}

/** JSON canônico (chaves ordenadas) para assinatura e comparação. */
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (isObj(value)) return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

/** SHA-256 em hexadecimal (Web Crypto: navegador e Node 20+). */
export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Assinatura do contexto: SHA-256 do JSON canônico sem o próprio campo de assinatura. */
export async function contextSignature(context) {
  const copy = JSON.parse(JSON.stringify(context ?? {}));
  if (isObj(copy.contexto)) delete copy.contexto.assinatura;
  return sha256Hex(canonicalJSON(copy));
}

/**
 * Valida um pacote já lido (objeto). Síncrono e puro.
 * @param {any} pkg
 * @param {{ context?: any, contextSignatureOk?: boolean, payloadSha256?: string }} [options]
 * @returns {{ ok: boolean, errors: Issue[], warnings: Issue[], alreadyImported: boolean, plan: Plan | null }}
 *
 * @typedef {{ code: string, path: string, message: string }} Issue
 * @typedef {{ create: string[], update: string[], notCited: string[] }} Plan
 */
export function validatePackage(pkg, options = {}) {
  const { context = null, contextSignatureOk, payloadSha256 } = options;
  /** @type {Issue[]} */ const errors = [];
  /** @type {Issue[]} */ const warnings = [];
  const err = (code, path, message) => errors.push({ code, path, message });
  const warn = (code, path, message) => warnings.push({ code, path, message });

  if (!isObj(pkg)) {
    err("estrutura", "$", "O arquivo não é um objeto JSON.");
    return { ok: false, errors, warnings, alreadyImported: false, plan: null };
  }

  // 1. Campos proibidos em qualquer nível --------------------------------------
  (function scan(node, path) {
    if (Array.isArray(node)) { node.forEach((v, i) => scan(v, `${path}[${i}]`)); return; }
    if (!isObj(node)) return;
    for (const key of Object.keys(node)) {
      if (FORBIDDEN_FIELDS.includes(key)) err("campo_proibido", `${path}.${key}`, `O pacote não pode marcar execução, informar valor medido ou apagar itens (campo "${key}").`);
      scan(node[key], `${path}.${key}`);
    }
  })(pkg, "$");

  const unknown = (obj, allowed, path) => {
    if (!isObj(obj)) return;
    for (const key of Object.keys(obj)) if (!allowed.includes(key) && !FORBIDDEN_FIELDS.includes(key)) warn("campo_desconhecido", `${path}.${key}`, `Campo "${key}" não faz parte do formato e será ignorado.`);
  };
  const required = (obj, key, path, check = isStr, what = "texto") => {
    if (!isObj(obj) || obj[key] === undefined || obj[key] === null || (typeof obj[key] === "string" && !obj[key].trim())) { err("obrigatorio", `${path}.${key}`, `Campo obrigatório ausente: ${key}.`); return false; }
    if (!check(obj[key])) { err("tipo", `${path}.${key}`, `Valor inválido em ${key}: esperado ${what}.`); return false; }
    return true;
  };
  const oneOf = (obj, key, list, path, mandatory = true) => {
    if (!isObj(obj)) return false;
    if (obj[key] === undefined || obj[key] === null) { if (mandatory) err("obrigatorio", `${path}.${key}`, `Campo obrigatório ausente: ${key}.`); return false; }
    if (!list.includes(obj[key])) { err("valor_invalido", `${path}.${key}`, `Valor "${obj[key]}" não aceito em ${key}. Use: ${list.join(", ")}.`); return false; }
    return true;
  };
  const array = (obj, key, path, mandatory = false) => {
    if (!isObj(obj) || obj[key] === undefined || obj[key] === null) { if (mandatory) err("obrigatorio", `${path}.${key}`, `Lista obrigatória ausente: ${key}.`); return []; }
    if (!Array.isArray(obj[key])) { err("tipo", `${path}.${key}`, `${key} precisa ser uma lista.`); return []; }
    return obj[key];
  };

  // 2. Cabeçalho ---------------------------------------------------------------
  unknown(pkg, ALLOWED.root, "$");
  if (pkg.formato !== PACKAGE_FORMAT) err("formato", "$.formato", `Formato precisa ser "${PACKAGE_FORMAT}".`);
  if (!SUPPORTED_VERSIONS.includes(pkg.versao_formato)) err("versao", "$.versao_formato", `Versão do formato não suportada. Versões aceitas: ${SUPPORTED_VERSIONS.join(", ")}.`);

  const meta = pkg.pacote;
  if (!isObj(meta)) err("obrigatorio", "$.pacote", "Bloco obrigatório ausente: pacote.");
  else {
    unknown(meta, ALLOWED.pacote, "$.pacote");
    if (required(meta, "id", "$.pacote") && !CODE.package.test(meta.id)) err("codigo", "$.pacote.id", "Código do pacote fora do padrão PKG-<CLIENTE>-<AAAAMMDD>-<E1..E6>-<NN>.");
    if (meta.substitui_pacote != null && !CODE.package.test(meta.substitui_pacote)) err("codigo", "$.pacote.substitui_pacote", "substitui_pacote precisa ser um código de pacote ou null.");
    if (required(meta, "gerado_em", "$.pacote") && Number.isNaN(Date.parse(meta.gerado_em))) err("tipo", "$.pacote.gerado_em", "gerado_em precisa ser data e hora ISO 8601.");
    required(meta, "gerado_por", "$.pacote");
    oneOf(meta, "fase", STAGES, "$.pacote");
    if (CODE.package.test(meta.id ?? "") && meta.fase && !meta.id.includes(`-${meta.fase}-`)) err("integridade", "$.pacote.id", "O código do pacote cita uma fase diferente de pacote.fase.");
  }

  const origin = pkg.origem;
  if (!isObj(origin)) err("obrigatorio", "$.origem", "Bloco obrigatório ausente: origem.");
  else {
    unknown(origin, ALLOWED.origem, "$.origem");
    oneOf(origin, "tipo", ORIGIN_TYPES, "$.origem");
    if (required(origin, "diagnostico_id", "$.origem") && !CODE.diagnostic.test(origin.diagnostico_id)) err("codigo", "$.origem.diagnostico_id", "diagnostico_id precisa ser o id do Diagnóstico Enrico (diag-…).");
    if (required(origin, "backup_sha256", "$.origem") && !CODE.sha256.test(origin.backup_sha256)) err("tipo", "$.origem.backup_sha256", "backup_sha256 precisa ter 64 caracteres hexadecimais minúsculos.");
    if (required(origin, "contexto_assinatura", "$.origem") && !CODE.sha256.test(origin.contexto_assinatura)) err("tipo", "$.origem.contexto_assinatura", "contexto_assinatura precisa ter 64 caracteres hexadecimais minúsculos.");
    if (origin.tipo === "fechamento-fase") {
      if (oneOf(origin, "fase_fechada", STAGES, "$.origem") && meta?.fase && stageNumber(meta.fase) < stageNumber(origin.fase_fechada)) err("integridade", "$.pacote.fase", "A fase do pacote não pode ser anterior à fase fechada que ele analisa.");
    } else if (origin.fase_fechada != null) {
      warn("campo_desconhecido", "$.origem.fase_fechada", "fase_fechada só se usa quando origem.tipo é fechamento-fase.");
    }
  }

  if (!isObj(pkg.estabelecimento)) err("obrigatorio", "$.estabelecimento", "Bloco obrigatório ausente: estabelecimento.");
  else { unknown(pkg.estabelecimento, ALLOWED.estabelecimento, "$.estabelecimento"); required(pkg.estabelecimento, "nome", "$.estabelecimento"); }

  // 3. Itens e códigos -----------------------------------------------------------
  /** Todos os códigos definidos neste pacote → caminho onde foram definidos. */
  const defined = new Map();
  const define = (id, pattern, path, label) => {
    if (!isStr(id)) { err("obrigatorio", `${path}.id`, `Código obrigatório ausente (${label}).`); return false; }
    if (!pattern.test(id)) { err("codigo", `${path}.id`, `Código "${id}" fora do padrão de ${label}.`); return false; }
    if (defined.has(id)) { err("codigo_repetido", `${path}.id`, `Código "${id}" aparece mais de uma vez no pacote (primeiro em ${defined.get(id)}).`); return false; }
    defined.set(id, path);
    return true;
  };
  const criteria = (list, path, owner, ownerPattern) => {
    if (!Array.isArray(list)) return;
    list.forEach((c, i) => {
      const p = `${path}[${i}]`;
      if (!isObj(c)) { err("tipo", p, "Critério precisa ser um objeto."); return; }
      unknown(c, ALLOWED.criterio, p);
      if (define(c.id, ownerPattern, p, "critério") && !c.id.startsWith(`${owner}-C`)) err("codigo", `${p}.id`, `O critério "${c.id}" precisa começar pelo código do dono (${owner}-C…).`);
      required(c, "texto", p);
      if (c.exige_evidencia !== undefined && typeof c.exige_evidencia !== "boolean") err("tipo", `${p}.exige_evidencia`, "exige_evidencia precisa ser true ou false.");
    });
  };

  const diag = pkg.diagnostico;
  const findings = [];
  if (!isObj(diag)) err("obrigatorio", "$.diagnostico", "Bloco obrigatório ausente: diagnostico.");
  else {
    unknown(diag, ALLOWED.diagnostico, "$.diagnostico");
    required(diag, "resumo", "$.diagnostico");
    array(diag, "problemas", "$.diagnostico").forEach((f, i) => {
      const p = `$.diagnostico.problemas[${i}]`;
      if (!isObj(f)) { err("tipo", p, "Problema precisa ser um objeto."); return; }
      unknown(f, ALLOWED.problema, p);
      define(f.id, CODE.finding, p, "problema (PRB-000)");
      required(f, "titulo", p); required(f, "descricao", p);
      oneOf(f, "topico", TOPICS, p); oneOf(f, "gravidade", SEVERITY, p); oneOf(f, "confirmacao", CONFIRMATION, p);
      if (f.base !== undefined && !(Array.isArray(f.base) && f.base.every(isStr))) err("tipo", `${p}.base`, "base precisa ser uma lista de referências (ex.: e10-p02).");
      findings.push({ item: f, path: p });
    });
  }

  const controls = [];
  array(pkg, "controles", "$").forEach((c, i) => {
    const p = `$.controles[${i}]`;
    if (!isObj(c)) { err("tipo", p, "Controle precisa ser um objeto."); return; }
    unknown(c, ALLOWED.controle, p);
    define(c.id, CODE.control, p, "controle (CTL-NOME)");
    required(c, "nome", p); oneOf(c, "topico", TOPICS, p);
    oneOf(c, "nivel_observado", MATURITY, p); oneOf(c, "nivel_alvo", MATURITY, p); oneOf(c, "etapa_prevista", STAGES, p);
    required(c, "criterio_maturidade", p);
    if (c.pre_requisitos !== undefined && !(Array.isArray(c.pre_requisitos) && c.pre_requisitos.every(isStr))) err("tipo", `${p}.pre_requisitos`, "pre_requisitos precisa ser uma lista de códigos.");
    controls.push({ item: c, path: p });
  });

  const stages = [];
  const tasks = [];
  const seenStages = new Set();
  array(pkg, "etapas", "$", true).forEach((s, i) => {
    const p = `$.etapas[${i}]`;
    if (!isObj(s)) { err("tipo", p, "Etapa precisa ser um objeto."); return; }
    unknown(s, ALLOWED.etapa, p);
    if (!STAGES.includes(s.id)) { err("etapa_inexistente", `${p}.id`, `Etapa "${s.id}" não existe. O contrato tem apenas as etapas E1 a E6; o pacote não cria etapas.`); return; }
    if (seenStages.has(s.id)) err("codigo_repetido", `${p}.id`, `A etapa ${s.id} aparece mais de uma vez.`);
    seenStages.add(s.id);
    if (s.objetivo_recomendado !== undefined && !isStr(s.objetivo_recomendado)) err("tipo", `${p}.objetivo_recomendado`, "objetivo_recomendado precisa ser texto.");
    criteria(array(s, "criterios_etapa", p), `${p}.criterios_etapa`, s.id, CODE.stageCriterion);
    stages.push({ item: s, path: p });
    array(s, "tarefas", p).forEach((t, j) => {
      const tp = `${p}.tarefas[${j}]`;
      if (!isObj(t)) { err("tipo", tp, "Tarefa precisa ser um objeto."); return; }
      unknown(t, ALLOWED.tarefa, tp);
      if (define(t.id, CODE.task, tp, "tarefa (T-E1-000)") && stageNumber(t.id) !== stageNumber(s.id)) err("codigo", `${tp}.id`, `A tarefa "${t.id}" está dentro da etapa ${s.id}, mas o código indica outra etapa. Tarefa que muda de etapa precisa de código novo.`);
      required(t, "titulo", tp); required(t, "justificativa", tp);
      if (t.descricao !== undefined && !isStr(t.descricao)) err("tipo", `${tp}.descricao`, "descricao precisa ser texto.");
      oneOf(t, "prioridade_recomendada", PRIORITY, tp);
      if (t.prazo_recomendado != null && !(CODE.date.test(t.prazo_recomendado) && !Number.isNaN(Date.parse(t.prazo_recomendado)))) err("tipo", `${tp}.prazo_recomendado`, "prazo_recomendado precisa ser uma data AAAA-MM-DD ou null.");
      if (t.depende_de !== undefined && !(Array.isArray(t.depende_de) && t.depende_de.every(isStr))) err("tipo", `${tp}.depende_de`, "depende_de precisa ser uma lista de códigos.");
      if (t.orientacoes !== undefined && !(Array.isArray(t.orientacoes) && t.orientacoes.every(isStr))) err("tipo", `${tp}.orientacoes`, "orientacoes precisa ser uma lista de códigos ORI.");
      const crit = array(t, "criterios", tp);
      if (!crit.length) err("sem_criterio", `${tp}.criterios`, `A tarefa ${t.id} não tem critério de conclusão. Toda tarefa precisa de pelo menos um critério verificável.`);
      criteria(crit, `${tp}.criterios`, t.id, CODE.taskCriterion);
      tasks.push({ item: t, path: tp, stage: s.id });
    });
  });

  array(pkg, "orientacoes", "$").forEach((g, i) => {
    const p = `$.orientacoes[${i}]`;
    if (!isObj(g)) { err("tipo", p, "Orientação precisa ser um objeto."); return; }
    unknown(g, ALLOWED.orientacao, p);
    define(g.id, CODE.guidance, p, "orientação (ORI-000)");
    required(g, "titulo", p); required(g, "texto", p); required(g, "publico", p);
  });

  const indicators = [];
  array(pkg, "indicadores", "$").forEach((d, i) => {
    const p = `$.indicadores[${i}]`;
    if (!isObj(d)) { err("tipo", p, "Indicador precisa ser um objeto."); return; }
    unknown(d, ALLOWED.indicador, p);
    define(d.id, CODE.indicator, p, "indicador (IND-NOME)");
    required(d, "nome", p); required(d, "definicao", p); required(d, "unidade", p);
    oneOf(d, "sentido", DIRECTION, p); oneOf(d, "frequencia", FREQUENCY, p); oneOf(d, "etapa_inicio", STAGES, p);
    for (const key of ["linha_de_base", "meta"]) if (d[key] != null && !(typeof d[key] === "number" && Number.isFinite(d[key]))) err("tipo", `${p}.${key}`, `${key} precisa ser número ou null.`);
    if (d.linha_de_base != null && !isStr(d.fonte_linha_de_base)) err("linha_de_base_sem_fonte", `${p}.fonte_linha_de_base`, "Linha de base informada sem fonte. Cite a fonte ou deixe linha_de_base como null.");
    if (d.meta == null) warn("indicador_sem_meta", `${p}.meta`, `O indicador ${d.id} não tem meta.`);
    indicators.push({ item: d, path: p });
  });

  // 4. Referências -------------------------------------------------------------
  const ctx = isObj(context) ? context : null;
  const ctxItems = contextIndex(ctx);
  const exists = id => defined.has(id) || ctxItems.has(id);
  const kindOk = (id, pattern) => pattern.test(id) && exists(id);

  array(pkg, "prioridades", "$").forEach((pr, i) => {
    const p = `$.prioridades[${i}]`;
    if (!isObj(pr)) { err("tipo", p, "Prioridade precisa ser um objeto."); return; }
    unknown(pr, ALLOWED.prioridade, p);
    if (!(Number.isInteger(pr.ordem) && pr.ordem >= 1)) err("tipo", `${p}.ordem`, "ordem precisa ser um número inteiro a partir de 1.");
    if (!isStr(pr.problema) || !kindOk(pr.problema, CODE.finding)) err("referencia", `${p}.problema`, `Problema "${pr.problema}" não existe no pacote nem no sistema.`);
    required(pr, "motivo", p);
  });
  const orders = array(pkg, "prioridades", "$").map(pr => pr?.ordem).filter(Number.isInteger);
  if (new Set(orders).size !== orders.length) err("integridade", "$.prioridades", "Há duas prioridades com a mesma ordem.");

  /** Grafo de dependências: código → códigos de que depende. */
  const graph = new Map();
  const controlInfo = new Map(); // CTL → { etapa, alvo }
  for (const c of ctxItems.values()) if (c.kind === "control") controlInfo.set(c.id, { etapa: c.etapa_prevista, alvo: c.nivel_alvo, registrado: c.nivel });
  for (const { item: c } of controls) if (isStr(c.id)) controlInfo.set(c.id, { ...(controlInfo.get(c.id) ?? {}), etapa: c.etapa_prevista, alvo: c.nivel_alvo });

  const parseDep = dep => {
    const [code, lvl] = String(dep).split(":");
    return { code, lvl: lvl ?? null };
  };

  for (const { item: c, path } of controls) {
    if (!isStr(c.id)) continue;
    if (level(c.nivel_alvo) >= 0 && level(c.nivel_observado) >= 0) {
      if (level(c.nivel_alvo) < level(c.nivel_observado)) err("maturidade", `${path}.nivel_alvo`, `O nível-alvo de ${c.id} é menor que o nível observado.`);
      else if (level(c.nivel_alvo) === level(c.nivel_observado)) warn("maturidade", `${path}.nivel_alvo`, `${c.id} já está no nível-alvo; não há evolução planejada.`);
      if (c.nivel_alvo === "inexistente") err("maturidade", `${path}.nivel_alvo`, `O nível-alvo de ${c.id} não pode ser "inexistente".`);
    }
    const registered = ctxItems.get(c.id)?.nivel;
    if (registered && c.nivel_observado && registered !== c.nivel_observado) warn("maturidade_divergente", `${path}.nivel_observado`, `${c.id}: o pacote diz "${c.nivel_observado}", o sistema registra "${registered}". Vale o registrado no sistema.`);
    const deps = [];
    (Array.isArray(c.pre_requisitos) ? c.pre_requisitos : []).forEach((dep, k) => {
      const dp = `${path}.pre_requisitos[${k}]`;
      const { code, lvl } = parseDep(dep);
      if (!CODE.control.test(code)) { err("referencia", dp, `Pré-requisito de controle precisa ser outro controle (CTL-…), recebido "${dep}".`); return; }
      if (!exists(code)) { err("referencia", dp, `Controle "${code}" não existe no pacote nem no sistema.`); return; }
      if (code === c.id) { err("dependencia_circular", dp, `${c.id} depende de si mesmo.`); return; }
      const need = lvl ?? "implantado";
      if (lvl !== null && level(lvl) < 0) { err("valor_invalido", dp, `Nível "${lvl}" não existe. Use: ${MATURITY.join(", ")}.`); return; }
      const target = controlInfo.get(code);
      if (target?.alvo && level(need) > level(target.alvo)) err("maturidade", dp, `${c.id} exige ${code} no nível "${need}", mas o alvo de ${code} é "${target.alvo}".`);
      if (target?.etapa && c.etapa_prevista && stageNumber(target.etapa) > stageNumber(c.etapa_prevista)) err("maturidade", dp, `${c.id} está previsto para ${c.etapa_prevista}, antes do pré-requisito ${code} (${target.etapa}). Um controle não nasce antes do que ele precisa.`);
      deps.push(code);
    });
    graph.set(c.id, deps);
  }

  for (const { item: t, path, stage } of tasks) {
    if (!isStr(t.id)) continue;
    if (t.problema != null && !(isStr(t.problema) && kindOk(t.problema, CODE.finding))) err("referencia", `${path}.problema`, `Problema "${t.problema}" não existe no pacote nem no sistema.`);
    (Array.isArray(t.orientacoes) ? t.orientacoes : []).forEach((g, k) => { if (!kindOk(g, CODE.guidance)) err("referencia", `${path}.orientacoes[${k}]`, `Orientação "${g}" não existe no pacote nem no sistema.`); });
    if (t.controle != null) {
      if (!(isStr(t.controle) && kindOk(t.controle, CODE.control))) err("referencia", `${path}.controle`, `Controle "${t.controle}" não existe no pacote nem no sistema.`);
      else {
        const info = controlInfo.get(t.controle);
        if (info?.etapa && stageNumber(stage) < stageNumber(info.etapa)) err("maturidade", `${path}.controle`, `A tarefa ${t.id} (${stage}) trabalha o controle ${t.controle}, previsto para ${info.etapa}. O controle só pode ser criado no momento previsto.`);
      }
    }
    const deps = [];
    (Array.isArray(t.depende_de) ? t.depende_de : []).forEach((dep, k) => {
      const dp = `${path}.depende_de[${k}]`;
      const { code, lvl } = parseDep(dep);
      if (code === t.id) { err("dependencia_circular", dp, `${t.id} depende de si mesma.`); return; }
      if (CODE.task.test(code)) {
        if (lvl !== null) { err("tipo", dp, "Dependência de tarefa não leva nível."); return; }
        if (!exists(code)) { err("referencia", dp, `Tarefa "${code}" não existe no pacote nem no sistema.`); return; }
        if (ctxItems.get(code)?.cancelada) { err("referencia", dp, `A tarefa ${code} está cancelada e não pode ser pré-requisito.`); return; }
        if (stageNumber(code) > stageNumber(stage)) { err("dependencia_etapa", dp, `${t.id} (${stage}) depende de ${code}, que é de uma etapa posterior.`); return; }
        deps.push(code);
      } else if (CODE.taskCriterion.test(code) || CODE.stageCriterion.test(code)) {
        if (lvl !== null) { err("tipo", dp, "Dependência de critério não leva nível."); return; }
        if (!exists(code)) { err("referencia", dp, `Critério "${code}" não existe no pacote nem no sistema.`); return; }
        if (stageNumber(code) > stageNumber(stage)) { err("dependencia_etapa", dp, `${t.id} (${stage}) depende de ${code}, de uma etapa posterior.`); return; }
        const owner = code.replace(/-C\d{1,2}$/, "");
        if (owner === t.id) { err("dependencia_circular", dp, `${t.id} depende de um critério dela mesma.`); return; }
        if (CODE.task.test(owner)) deps.push(owner);
      } else if (CODE.control.test(code)) {
        if (lvl === null) { err("tipo", dp, `Dependência de controle precisa do nível: "${code}:implantado", por exemplo.`); return; }
        if (level(lvl) < 1) { err("valor_invalido", dp, `Nível "${lvl}" inválido para dependência. Use: ${MATURITY.slice(1).join(", ")}.`); return; }
        if (!exists(code)) { err("referencia", dp, `Controle "${code}" não existe no pacote nem no sistema.`); return; }
        const info = controlInfo.get(code);
        if (info?.alvo && level(lvl) > level(info.alvo)) err("maturidade", dp, `${t.id} exige ${code} no nível "${lvl}", mas o alvo planejado é "${info.alvo}".`);
        if (info?.etapa && stageNumber(info.etapa) > stageNumber(stage)) err("maturidade", dp, `${t.id} (${stage}) depende de ${code}, que só nasce em ${info.etapa}.`);
        deps.push(code);
      } else {
        err("referencia", dp, `Dependência "${dep}" não é código de tarefa, critério ou controle.`);
      }
    });
    graph.set(t.id, [...(graph.get(t.id) ?? []), ...deps]);
  }

  for (const { item: d, path } of indicators) {
    if (d.controle == null) continue;
    if (!(isStr(d.controle) && kindOk(d.controle, CODE.control))) { err("referencia", `${path}.controle`, `Controle "${d.controle}" não existe no pacote nem no sistema.`); continue; }
    const info = controlInfo.get(d.controle);
    if (info?.etapa && d.etapa_inicio && stageNumber(d.etapa_inicio) < stageNumber(info.etapa)) err("maturidade", `${path}.etapa_inicio`, `O indicador ${d.id} começa em ${d.etapa_inicio}, antes de existir o controle ${d.controle} (${info.etapa}).`);
    const observed = controls.find(c => c.item.id === d.controle)?.item.nivel_observado ?? ctxItems.get(d.controle)?.nivel;
    if (observed === "inexistente" && d.linha_de_base != null) err("maturidade", `${path}.linha_de_base`, `O indicador ${d.id} tem linha de base, mas o controle ${d.controle} ainda não existe. Sem controle não há medição: use null.`);
  }

  // Dependências que existem só no sistema entram no grafo para achar ciclos.
  for (const item of ctxItems.values()) if (!graph.has(item.id) && Array.isArray(item.depende_de)) graph.set(item.id, item.depende_de.map(d => parseDep(d).code.replace(/-C\d{1,2}$/, "")));
  for (const cycle of findCycles(graph)) err("dependencia_circular", "$", `Dependência circular: ${cycle.join(" → ")}.`);

  array(pkg, "sugestoes_de_status", "$").forEach((sg, i) => {
    const p = `$.sugestoes_de_status[${i}]`;
    if (!isObj(sg)) { err("tipo", p, "Sugestão precisa ser um objeto."); return; }
    unknown(sg, ALLOWED.sugestao, p);
    oneOf(sg, "tipo", SUGGESTION_TYPES, p); oneOf(sg, "sugestao", SUGGESTIONS, p); required(sg, "motivo", p);
    const pattern = { problema: CODE.finding, tarefa: CODE.task, controle: CODE.control }[sg.tipo];
    if (pattern && !(isStr(sg.id) && kindOk(sg.id, pattern))) err("referencia", `${p}.id`, `${sg.tipo} "${sg.id}" não existe no pacote nem no sistema.`);
    else if (pattern) warn("sugestao", `${p}`, `Sugestão de ${sg.sugestao} para ${sg.id}: só vale se você confirmar na tela.`);
  });

  array(pkg, "proximo_passo_recomendado", "$").forEach((code, i) => {
    const p = `$.proximo_passo_recomendado[${i}]`;
    if (!(isStr(code) && kindOk(code, CODE.task))) { err("referencia", p, `Próximo passo "${code}" precisa ser uma tarefa existente.`); return; }
    const own = tasks.find(t => t.item.id === code);
    const deps = graph.get(code) ?? [];
    const pending = deps.filter(d => !dependencySatisfied(d, ctxItems, (own?.item.depende_de ?? []).find(x => parseDep(x).code === d)));
    if (pending.length) warn("proximo_passo_bloqueado", p, `${code} ainda depende de ${pending.join(", ")}; o sistema só a mostrará como próximo passo quando estiver liberada.`);
  });

  // 5. Comparação com o sistema (contexto) ---------------------------------------
  let alreadyImported = false;
  /** @type {Plan | null} */ let plan = null;
  if (ctx) {
    if (ctx.formato !== CONTEXT_FORMAT) err("contexto", "contexto.formato", `O contexto informado não é "${CONTEXT_FORMAT}".`);
    if (contextSignatureOk === false) err("contexto", "contexto.assinatura", "O arquivo de contexto foi alterado depois de exportado.");
    if (origin && isStr(origin.contexto_assinatura) && ctx.contexto?.assinatura && origin.contexto_assinatura !== ctx.contexto.assinatura) err("contexto_desatualizado", "$.origem.contexto_assinatura", "O pacote foi gerado a partir de outro contexto. Exporte o contexto atual e gere o pacote de novo.");
    if (ctx.diagnostico_id && origin?.diagnostico_id && ctx.diagnostico_id !== origin.diagnostico_id) err("outro_diagnostico", "$.origem.diagnostico_id", `Este estabelecimento usa o diagnóstico ${ctx.diagnostico_id}; o pacote cita ${origin.diagnostico_id}.`);
    if (ctx.estabelecimento?.nome && pkg.estabelecimento?.nome && normalizeTitle(ctx.estabelecimento.nome) !== normalizeTitle(pkg.estabelecimento.nome)) err("outro_estabelecimento", "$.estabelecimento.nome", `O pacote é de "${pkg.estabelecimento.nome}", mas o sistema está em "${ctx.estabelecimento.nome}".`);

    const last = ctx.ultimo_fechamento ?? null;
    if (origin?.tipo === "fechamento-fase") {
      if (!last) err("origem", "$.origem.tipo", "O pacote diz analisar um fechamento de fase, mas nenhuma fase foi fechada no sistema.");
      else {
        if (origin.backup_sha256 !== last.sha256) err("origem", "$.origem.backup_sha256", "O pacote não foi gerado a partir do último backup de fechamento de fase.");
        if (origin.fase_fechada && origin.fase_fechada !== last.fase) err("origem", "$.origem.fase_fechada", `O último fechamento foi da fase ${last.fase}.`);
      }
    } else if (origin?.tipo === "diagnostico-enrico" && last) {
      err("origem", "$.origem.tipo", `Já existe fechamento da fase ${last.fase}. O próximo pacote precisa analisar esse backup (origem.tipo = fechamento-fase).`);
    }

    const imported = Array.isArray(ctx.pacotes_importados) ? ctx.pacotes_importados : [];
    const same = imported.find(p => p.id === meta?.id);
    if (same) {
      if (payloadSha256 && same.sha256 === payloadSha256) alreadyImported = true;
      else err("pacote_repetido", "$.pacote.id", `O pacote ${meta.id} já foi importado com outro conteúdo. Um pacote corrigido precisa de outro código e de substitui_pacote.`);
    }
    if (meta?.substitui_pacote && !imported.some(p => p.id === meta.substitui_pacote)) err("referencia", "$.pacote.substitui_pacote", `O pacote ${meta.substitui_pacote} não foi importado neste estabelecimento.`);
    const lastPhase = imported.reduce((max, p) => Math.max(max, stageNumber(p.fase)), 0);
    if (meta?.fase && lastPhase && stageNumber(meta.fase) < lastPhase) warn("fase_anterior", "$.pacote.fase", `Já há pacote da fase E${lastPhase}; este é de ${meta.fase}.`);

    const ctxStages = new Map((Array.isArray(ctx.etapas) ? ctx.etapas : []).map(s => [s.id, s]));
    for (const { item: t, path, stage } of tasks) {
      if (ctxStages.get(stage)?.status === "completed" && !ctxItems.has(t.id)) err("etapa_concluida", `${path}.id`, `A etapa ${stage} já foi concluída; o pacote não pode criar tarefa nova nela.`);
    }

    // Possíveis duplicatas: código novo com título muito parecido a um item existente do mesmo tipo.
    const titled = [
      ...tasks.map(t => ({ id: t.item.id, title: t.item.titulo, kind: "task", path: t.path })),
      ...findings.map(f => ({ id: f.item.id, title: f.item.titulo, kind: "finding", path: f.path })),
      ...controls.map(c => ({ id: c.item.id, title: c.item.nome, kind: "control", path: c.path })),
      ...indicators.map(d => ({ id: d.item.id, title: d.item.nome, kind: "indicator", path: d.path })),
    ];
    for (const n of titled) {
      if (!isStr(n.id) || ctxItems.has(n.id)) continue;
      for (const old of ctxItems.values()) {
        if (old.kind !== n.kind || !old.titulo) continue;
        const sim = titleSimilarity(n.title, old.titulo);
        if (normalizeTitle(n.title) === normalizeTitle(old.titulo) || sim >= 0.75) { warn("possivel_duplicata", `${n.path}.id`, `${n.id} ("${n.title}") parece repetir ${old.id} ("${old.titulo}"). Se for o mesmo item, use o código ${old.id}.`); break; }
      }
    }

    const create = [...defined.keys()].filter(id => !ctxItems.has(id));
    const update = [...defined.keys()].filter(id => ctxItems.has(id));
    const notCited = [...ctxItems.keys()].filter(id => !defined.has(id) && !/^E[1-6]$/.test(id));
    plan = { create, update, notCited };
  }

  return { ok: errors.length === 0, errors, warnings, alreadyImported, plan };
}

/**
 * Lê o texto do arquivo, calcula as assinaturas e valida.
 * @param {string} text
 * @param {{ context?: any }} [options]
 */
export async function checkPackageFile(text, options = {}) {
  let pkg;
  try { pkg = JSON.parse(text); }
  catch (e) { return { ok: false, errors: [{ code: "json", path: "$", message: `O arquivo não é um JSON válido: ${e instanceof Error ? e.message : e}` }], warnings: [], alreadyImported: false, plan: null, payloadSha256: null }; }
  const payloadSha256 = await sha256Hex(canonicalJSON(pkg));
  let contextSignatureOk;
  if (options.context) contextSignatureOk = options.context?.contexto?.assinatura === await contextSignature(options.context);
  return { ...validatePackage(pkg, { context: options.context ?? null, contextSignatureOk, payloadSha256 }), payloadSha256 };
}

/** Índice dos itens existentes no contexto: código → { id, kind, ... }. */
export function contextIndex(ctx) {
  const map = new Map();
  if (!isObj(ctx)) return map;
  const add = (kind, item, extra = {}) => { if (item && isStr(item.id)) map.set(item.id, { ...item, ...extra, kind }); };
  for (const s of ctx.etapas ?? []) {
    add("stage", s);
    for (const c of s.criterios ?? []) add("criterion", c);
  }
  for (const t of ctx.tarefas ?? []) {
    add("task", t, { cancelada: t.status_execucao === "cancelled" });
    for (const c of t.criterios ?? []) add("criterion", c, { cumprido: Boolean(c.cumprido) });
  }
  for (const f of ctx.problemas ?? []) add("finding", f);
  for (const c of ctx.controles ?? []) add("control", c, { titulo: c.nome });
  for (const g of ctx.orientacoes ?? []) add("guidance", g);
  for (const d of ctx.indicadores ?? []) add("indicator", d, { titulo: d.nome });
  return map;
}

function dependencySatisfied(code, ctxItems, raw) {
  const item = ctxItems.get(code);
  if (!item) return false;
  if (item.kind === "task") return item.status_execucao === "completed" && item.verificada !== false;
  if (item.kind === "criterion") return Boolean(item.cumprido);
  if (item.kind === "control") {
    const need = raw ? (String(raw).split(":")[1] ?? "implantado") : "implantado";
    return level(item.nivel) >= level(need);
  }
  return false;
}

/** Ciclos num grafo { nó → [dependências] }. Devolve cada ciclo uma vez. */
export function findCycles(graph) {
  const state = new Map(); // 1 = visitando, 2 = concluído
  const stack = [];
  const cycles = [];
  const seen = new Set();
  const visit = node => {
    state.set(node, 1); stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 1) {
        const cycle = [...stack.slice(stack.indexOf(next)), next];
        const key = [...cycle.slice(0, -1)].sort().join("|");
        if (!seen.has(key)) { seen.add(key); cycles.push(cycle); }
      } else if (!state.has(next)) visit(next);
    }
    stack.pop(); state.set(node, 2);
  };
  for (const node of [...graph.keys()].sort()) if (!state.has(node)) visit(node);
  return cycles;
}

/**
 * Situação de planejamento de cada tarefa e o próximo passo (seção 8 da proposta).
 * - planejada: a etapa da tarefa ainda não começou;
 * - aguardando_pre_requisito: falta tarefa, critério ou nível de controle de que ela depende;
 * - liberada: pode ser feita agora;
 * - concluida / cancelada: execução registrada pela equipe.
 * Atraso só existe para tarefa liberada, com prazo ACEITO (não o recomendado) e vencido.
 * Um controle inexistente nunca gera atraso por si só.
 *
 * @param {{ etapas: any[], tarefas: any[], controles?: any[] }} state
 * @param {string} today AAAA-MM-DD
 */
export function computePlanning(state, today) {
  const stages = new Map((state.etapas ?? []).map(s => [s.id, s]));
  const tasks = new Map((state.tarefas ?? []).map(t => [t.id, t]));
  const controls = new Map((state.controles ?? []).map(c => [c.id, c]));
  const criteria = new Map();
  for (const s of state.etapas ?? []) for (const c of s.criterios ?? []) criteria.set(c.id, c);
  for (const t of state.tarefas ?? []) for (const c of t.criterios ?? []) criteria.set(c.id, c);

  const done = t => t && t.status_execucao === "completed" && t.verificada !== false;
  const unmet = t => (t.depende_de ?? []).filter(dep => {
    const [code, lvl] = String(dep).split(":");
    if (tasks.has(code)) return !done(tasks.get(code));
    if (criteria.has(code)) return !criteria.get(code).cumprido;
    if (controls.has(code)) return level(controls.get(code).nivel ?? "inexistente") < level(lvl ?? "implantado");
    return true; // dependência desconhecida: não libera
  });

  const result = [];
  for (const t of state.tarefas ?? []) {
    const stage = stages.get(t.etapa);
    let estado;
    let pendentes = [];
    if (t.status_execucao === "cancelled") estado = "cancelada";
    else if (done(t)) estado = "concluida";
    else if (!stage || stage.status === "not_started") estado = "planejada";
    else {
      pendentes = unmet(t);
      estado = pendentes.length ? "aguardando_pre_requisito" : "liberada";
    }
    const atrasada = estado === "liberada" && Boolean(t.prazo_aceito) && t.prazo_aceito < today;
    result.push({ id: t.id, estado, pendentes, atrasada });
  }

  // Quantas tarefas cada tarefa destrava (direta ou indiretamente).
  const dependents = new Map();
  for (const t of state.tarefas ?? []) for (const dep of t.depende_de ?? []) {
    const owner = String(dep).split(":")[0].replace(/-C\d{1,2}$/, "");
    if (!dependents.has(owner)) dependents.set(owner, new Set());
    dependents.get(owner).add(t.id);
  }
  const unlocks = id => { const all = new Set(); const walk = x => { for (const d of dependents.get(x) ?? []) if (!all.has(d)) { all.add(d); walk(d); } }; walk(id); return all.size; };
  const rank = { alta: 0, high: 0, normal: 1, baixa: 2, low: 2 };
  const free = result.filter(r => r.estado === "liberada").map(r => ({ ...r, task: tasks.get(r.id) }));
  free.sort((a, b) => (Number(b.atrasada) - Number(a.atrasada))
    || ((rank[a.task.prioridade] ?? 1) - (rank[b.task.prioridade] ?? 1))
    || (unlocks(b.id) - unlocks(a.id))
    || a.id.localeCompare(b.id));
  const proximoPasso = free.map(r => ({ id: r.id, titulo: r.task.titulo, destrava: unlocks(r.id), atrasada: r.atrasada }));
  const travas = proximoPasso.length ? [] : result.filter(r => r.estado === "aguardando_pre_requisito").map(r => ({ id: r.id, pendentes: r.pendentes }));
  return { tarefas: result, proximoPasso, travas };
}
