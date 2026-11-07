"use client";

import { useState } from "react";
import type { Site, Workspace } from "@/lib/workspace";
import { exportContext, contextFileName } from "@/lib/context.mjs";

type Props = { site: Site; ws: Workspace; notify: (m: string) => void };

// Exporta o estado atual da implantação para a análise técnica no ChatGPT.
// Só leitura: usa os dados já carregados e baixa um arquivo JSON. Não grava nada no banco.
export function ContextExport({ site, ws, notify }: Props) {
  const [includeNames, setIncludeNames] = useState(false);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const generatedAt = new Date().toISOString();
      const context = await exportContext({
        establishment: site, stages: ws.stages, tasks: ws.tasks, responses: ws.responses,
        visits: ws.visits, evidence: ws.evidence, generatedAt, includeNames,
      });
      const blob = new Blob([JSON.stringify(context, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = contextFileName(site.name, generatedAt);
      link.click();
      URL.revokeObjectURL(link.href);
      notify("Contexto exportado. Envie o arquivo ao ChatGPT junto com o backup da fase e as instruções fixas.");
    } catch (error) {
      notify(`Não foi possível exportar o contexto: ${error instanceof Error ? error.message : String(error)}`);
    }
    setBusy(false);
  }

  return <section className="panel no-print" data-testid="context-export">
    <div className="panel-head"><div><h3>Contexto para análise técnica</h3><p className="muted">Baixa um arquivo JSON com etapas, tarefas, códigos e situação atual, para o ChatGPT reaproveitar os códigos ao montar o pacote. Nada é alterado no sistema.</p></div></div>
    <label className="check-line"><input type="checkbox" checked={includeNames} onChange={event => setIncludeNames(event.target.checked)} />Incluir nomes dos responsáveis (por padrão o arquivo diz apenas se há responsável)</label>
    <div className="form-actions"><button className="secondary" disabled={busy || ws.loading || ws.stages.length === 0} onClick={() => void download()}>{busy ? "Exportando…" : "Exportar contexto para análise"}</button></div>
  </section>;
}
