// Esquema oficial (JSON Schema 2020-12) do pacote de análise, montado a partir das
// mesmas constantes do validador, para que os dois nunca divirjam.
// O arquivo publicado docs/pacote-analise/pacote-analise.schema.json é gerado por
// `node scripts/gerar-schema.mjs`; um teste confere que ele está atualizado.
//
// O esquema descreve a FORMA do pacote. Regras que dependem de mais de um campo
// (referências, ciclos, maturidade, comparação com o sistema) ficam em lib/package.mjs.

import { PACKAGE_FORMAT, SUPPORTED_VERSIONS, STAGES, TOPICS, SEVERITY, CONFIRMATION, PRIORITY, MATURITY, DIRECTION, FREQUENCY, ORIGIN_TYPES, SUGGESTION_TYPES, SUGGESTIONS, CODE } from "./package.mjs";

const text = { type: "string", minLength: 1 };
const re = r => r.source;
const codeList = pattern => ({ type: "array", items: { type: "string", pattern } });
const criterion = idPattern => ({
  type: "object",
  required: ["id", "texto"],
  properties: { id: { type: "string", pattern: idPattern }, texto: text, exige_evidencia: { type: "boolean" } },
  additionalProperties: false,
});
const dependency = `^(?:${re(CODE.task).slice(1, -1)}|${re(CODE.taskCriterion).slice(1, -1)}|${re(CODE.stageCriterion).slice(1, -1)}|${re(CODE.control).slice(1, -1)}:(?:${MATURITY.slice(1).join("|")}))$`;
const prerequisite = `^${re(CODE.control).slice(1, -1)}(?::(?:${MATURITY.slice(1).join("|")}))?$`;

export function buildSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://github.com/thaisfsm/CMV-Master/docs/pacote-analise/pacote-analise.schema.json",
    title: "Pacote de análise da consultoria · CMV Mestre",
    description: "O pacote recomenda; só a equipe executa. Não contém status de execução, valores medidos nem pedidos de exclusão.",
    type: "object",
    required: ["formato", "versao_formato", "pacote", "origem", "estabelecimento", "diagnostico", "etapas"],
    additionalProperties: false,
    properties: {
      formato: { const: PACKAGE_FORMAT },
      versao_formato: { enum: SUPPORTED_VERSIONS },
      pacote: {
        type: "object",
        required: ["id", "gerado_em", "gerado_por", "fase"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: re(CODE.package), description: "PKG-<CLIENTE>-<AAAAMMDD>-<fase>-<NN>. Nunca reutilizar." },
          substitui_pacote: { type: ["string", "null"], pattern: re(CODE.package) },
          gerado_em: { type: "string", format: "date-time" },
          gerado_por: text,
          fase: { enum: STAGES, description: "Fase da implantação que este pacote planeja." },
          observacao: { type: "string" },
        },
      },
      origem: {
        type: "object",
        required: ["tipo", "diagnostico_id", "backup_sha256", "contexto_assinatura"],
        additionalProperties: false,
        properties: {
          tipo: { enum: ORIGIN_TYPES, description: "diagnostico-enrico no primeiro pacote; fechamento-fase depois que uma fase for fechada." },
          diagnostico_id: { type: "string", pattern: re(CODE.diagnostic) },
          backup_arquivo: { type: "string" },
          backup_sha256: { type: "string", pattern: re(CODE.sha256) },
          fase_fechada: { enum: STAGES },
          contexto_assinatura: { type: "string", pattern: re(CODE.sha256), description: "Copiar de contexto.assinatura do arquivo de contexto exportado pelo CMV Mestre." },
        },
        if: { properties: { tipo: { const: "fechamento-fase" } } },
        then: { required: ["fase_fechada"] },
      },
      estabelecimento: { type: "object", required: ["nome"], additionalProperties: false, properties: { nome: text } },
      diagnostico: {
        type: "object",
        required: ["resumo"],
        additionalProperties: false,
        properties: {
          resumo: text,
          problemas: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "titulo", "descricao", "topico", "gravidade", "confirmacao"],
              additionalProperties: false,
              properties: {
                id: { type: "string", pattern: re(CODE.finding) },
                titulo: text, descricao: text,
                topico: { enum: TOPICS },
                gravidade: { enum: SEVERITY },
                confirmacao: { enum: CONFIRMATION },
                base: { type: "array", items: { type: "string" }, description: "Perguntas do backup que sustentam o problema (ex.: e10-p02)." },
              },
            },
          },
        },
      },
      prioridades: {
        type: "array",
        items: { type: "object", required: ["ordem", "problema", "motivo"], additionalProperties: false, properties: { ordem: { type: "integer", minimum: 1 }, problema: { type: "string", pattern: re(CODE.finding) }, motivo: text } },
      },
      controles: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "nome", "topico", "nivel_observado", "nivel_alvo", "etapa_prevista", "criterio_maturidade"],
          additionalProperties: false,
          properties: {
            id: { type: "string", pattern: re(CODE.control) },
            nome: text,
            topico: { enum: TOPICS },
            nivel_observado: { enum: MATURITY, description: "O que a análise viu no backup. O nível registrado no sistema prevalece." },
            nivel_alvo: { enum: MATURITY.slice(1) },
            etapa_prevista: { enum: STAGES, description: "Etapa em que o controle deve nascer. Não pode ser antes dos pré-requisitos." },
            pre_requisitos: { type: "array", items: { type: "string", pattern: prerequisite } },
            criterio_maturidade: text,
            justificativa: { type: "string" },
          },
        },
      },
      etapas: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: {
            id: { enum: STAGES, description: "Só as seis etapas do contrato." },
            objetivo_recomendado: text,
            criterios_etapa: { type: "array", items: criterion(re(CODE.stageCriterion)) },
            tarefas: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "titulo", "prioridade_recomendada", "justificativa"],
                additionalProperties: false,
                properties: {
                  id: { type: "string", pattern: re(CODE.task), description: "T-<etapa>-<NNN>; o número da etapa precisa ser o da etapa que contém a tarefa." },
                  titulo: text,
                  descricao: text,
                  problema: { type: "string", pattern: re(CODE.finding) },
                  controle: { type: "string", pattern: re(CODE.control), description: "Controle que esta tarefa cria ou evolui." },
                  prioridade_recomendada: { enum: PRIORITY },
                  prazo_recomendado: { type: ["string", "null"], format: "date", description: "Sugestão. Nunca gera atraso; o prazo real é aceito pela consultora." },
                  responsavel_recomendado: { type: "string", description: "Função, não nome de pessoa." },
                  justificativa: text,
                  depende_de: { type: "array", items: { type: "string", pattern: dependency }, description: "Tarefas, critérios ou controles em nível (CTL-X:implantado)." },
                  criterios: { type: "array", items: criterion(re(CODE.taskCriterion)) },
                  orientacoes: codeList(re(CODE.guidance)),
                },
              },
            },
          },
        },
      },
      orientacoes: {
        type: "array",
        items: { type: "object", required: ["id", "titulo", "texto", "publico"], additionalProperties: false, properties: { id: { type: "string", pattern: re(CODE.guidance) }, titulo: text, texto: text, publico: text } },
      },
      indicadores: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "nome", "definicao", "unidade", "sentido", "frequencia", "etapa_inicio"],
          additionalProperties: false,
          properties: {
            id: { type: "string", pattern: re(CODE.indicator) },
            nome: text, definicao: text, unidade: text,
            sentido: { enum: DIRECTION },
            linha_de_base: { type: ["number", "null"], description: "Só com fonte. Sem controle existente, null." },
            fonte_linha_de_base: { type: "string" },
            meta: { type: ["number", "null"] },
            frequencia: { enum: FREQUENCY },
            etapa_inicio: { enum: STAGES },
            controle: { type: "string", pattern: re(CODE.control) },
          },
          if: { properties: { linha_de_base: { type: "number" } }, required: ["linha_de_base"] },
          then: { required: ["fonte_linha_de_base"] },
        },
      },
      sugestoes_de_status: {
        type: "array",
        items: { type: "object", required: ["tipo", "id", "sugestao", "motivo"], additionalProperties: false, properties: { tipo: { enum: SUGGESTION_TYPES }, id: text, sugestao: { enum: SUGGESTIONS }, motivo: text } },
      },
      proximo_passo_recomendado: codeList(re(CODE.task)),
    },
  };
}
