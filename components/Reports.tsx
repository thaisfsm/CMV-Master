"use client";

import { useMemo } from "react";
import { formatDate, localDate, type Site, type Workspace } from "@/lib/workspace";
import { buildVisitReport, reportToText } from "@/lib/report.mjs";
import { buildAdvice } from "@/lib/consultant.mjs";
import { VISIT_TYPES } from "@/lib/diagnostic.mjs";

type Props = { site: Site; ws: Workspace; visitId: string | null; setVisitId: (id: string | null) => void; notify: (m: string) => void; go: (page: string) => void };

export function Reports({ site, ws, visitId, setVisitId, notify, go }: Props) {
  const visit = ws.visits.find(v => v.id === visitId) ?? null;
  const report = useMemo(() => {
    if (!visit) return null;
    const advice = buildAdvice({ responses: ws.responses, tasks: ws.tasks, stages: ws.stages, visits: ws.visits, evidenceCount: ws.evidence.length, today: localDate() });
    return buildVisitReport({ establishment: site, visit, responses: ws.responses, tasks: ws.tasks, evidence: ws.evidence, advice });
  }, [site, visit, ws]);

  async function copy() {
    if (!report) return;
    try { await navigator.clipboard.writeText(reportToText(report)); notify("Resumo copiado. Cole no e-mail ou mensagem."); }
    catch { notify("Não foi possível copiar automaticamente neste navegador."); }
  }

  return <>
    <div className="page-title no-print"><span className="eyebrow">RELATÓRIOS · GERADOS A PARTIR DOS REGISTROS</span><h1>Relatórios</h1><p className="muted">Relatório da visita com respostas, classificação, pendências, tarefas e próximos passos. Para PDF, use Imprimir e escolha “Salvar como PDF”.</p></div>
    <section className="panel visit-bar no-print">
      <label className="field">Visita
        <select value={visitId ?? ""} onChange={event => setVisitId(event.target.value || null)} data-testid="report-visit">
          <option value="">Selecione…</option>
          {ws.visits.map(v => <option key={v.id} value={v.id}>{formatDate(v.visit_date)} · {VISIT_TYPES[v.visit_type as keyof typeof VISIT_TYPES]}</option>)}
        </select>
      </label>
      <button className="secondary" disabled={!report} onClick={() => void copy()}>Copiar resumo</button>
      <button className="primary" disabled={!report} onClick={() => window.print()}>Imprimir / salvar PDF</button>
    </section>
    {!report ? <section className="panel empty-state">{ws.visits.length ? "Selecione uma visita para gerar o relatório." : <>Nenhuma visita registrada. <button className="text-button" onClick={() => go("visits")}>Registrar visita</button></>}</section> :
    <article className="panel report" data-testid="visit-report">
      <header className="report-head">
        <div><span className="eyebrow">CMV MESTRE · RELATÓRIO DA VISITA</span><h2>{report.establishment}</h2><p className="muted">{report.segment}{report.contract ? ` · Contrato ${report.contract}` : ""}</p></div>
        <div className="report-meta"><b>{report.visitDate}</b><span>{report.visitType} · {report.visitStatus}</span><span>{report.participants.join(", ") || "Participantes não informados"}</span></div>
      </header>
      <div className="report-summary">
        <div><strong>{report.summary.answered}/{report.summary.total}</strong><small>tópicos registrados</small></div>
        <div><strong>{report.summary.inThisVisit}</strong><small>nesta visita</small></div>
        <div><strong>{report.summary.confirmed}</strong><small>confirmados</small></div>
        <div><strong>{report.summary.attachments}</strong><small>arquivos</small></div>
        {Object.entries(report.summary.situations).map(([label, n]) => <div key={label}><strong>{n}</strong><small>{label.toLowerCase()}</small></div>)}
      </div>
      {report.objective && <><h3>Objetivo</h3><p>{report.objective}</p></>}
      {report.observations && <><h3>Observações</h3><p className="pre">{report.observations}</p></>}
      <h3>Diagnóstico por tópico</h3>
      <table className="report-table"><thead><tr><th>#</th><th>Tópico</th><th>Registro</th><th>Confirmação</th><th>Situação</th></tr></thead>
        <tbody>{report.topics.map(t => <tr key={t.key} className={t.answer ? "" : "missing"}><td>{t.number}</td><td><b>{t.question}</b><small>{t.area}</small></td><td>{t.answer ?? <i>Não registrado</i>}{t.notes && <small>Obs.: {t.notes}</small>}{t.attachments.length > 0 && <small>Anexos: {t.attachments.join(", ")}</small>}</td><td>{t.evidence}</td><td>{t.situation ?? "—"}</td></tr>)}</tbody>
      </table>
      <div className="report-cols">
        <section><h3>Pendências</h3>{report.pendingItems.length ? <ul>{report.pendingItems.map(p => <li key={p}>{p}</li>)}</ul> : <p className="muted">Nenhuma pendência de informação.</p>}</section>
        <section><h3>Próximos passos</h3>{report.nextSteps.length ? <ol>{report.nextSteps.map(s => <li key={s}>{s}</li>)}</ol> : <p className="muted">A definir. Registre na visita.</p>}</section>
      </div>
      <h3>Tarefas em aberto</h3>
      {report.openTasks.length ? <table className="report-table"><thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead><tbody>{report.openTasks.map(t => <tr key={t.title}><td>{t.title}</td><td>{t.assignee}</td><td>{t.due}</td><td>{t.status}</td></tr>)}</tbody></table> : <p className="muted">Nenhuma tarefa em aberto.</p>}
      {report.completedTasks.length > 0 && <p className="muted">Concluídas: {report.completedTasks.join(" · ")}</p>}
      {report.cautions.length > 0 && <><h3>Cuidados</h3><ul>{report.cautions.map(c => <li key={c}>{c}</li>)}</ul></>}
      <p className="report-disclaimer">{report.disclaimer}</p>
    </article>}
  </>;
}
