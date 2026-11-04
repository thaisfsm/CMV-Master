"use client";

import { useMemo } from "react";
import { localDate, type Workspace } from "@/lib/workspace";
import { buildAdvice } from "@/lib/consultant.mjs";
import { DIAGNOSTIC_QUESTIONS, EVIDENCE_STATUS } from "@/lib/diagnostic.mjs";

const priorityLabel = { alta: "PRIORIDADE ALTA", media: "PRIORIDADE MÉDIA", baixa: "PRIORIDADE BAIXA" } as const;

export function Consultant({ ws, go }: { ws: Workspace; go: (page: string) => void }) {
  const advice = useMemo(() => buildAdvice({
    responses: ws.responses, tasks: ws.tasks, stages: ws.stages, visits: ws.visits, evidenceCount: ws.evidence.length, trainingCount: ws.counts.trainings, today: localDate(),
    calc: { ingredientsWithPrice: ws.counts.ingredientsWithPrice, recipesWithItems: ws.counts.recipesWithItems, closedInventories: ws.counts.closedInventories, receivedPurchases: ws.counts.receivedPurchases, salesRecords: ws.counts.salesRecords },
  }), [ws]);
  const questionText = (key: string) => DIAGNOSTIC_QUESTIONS.find(q => q.key === key)?.question ?? key;

  return <>
    <div className="page-title"><span className="eyebrow">ORIENTAÇÃO POR REGRAS · BASEADA NOS REGISTROS</span><h1>Consultor CMV Mestre</h1><p className="muted">As orientações saem das respostas, classificações, evidências e tarefas registradas. Nenhuma IA externa está conectada e nenhum valor é estimado.</p></div>
    <div className="flow-track methodology">{advice.methodology.map((name, i) => <div className={`flow-step ${name === advice.phase ? "current" : ""}`} key={name}><span>{String(i + 1).padStart(2, "0")}</span><b>{name}</b>{i < 3 && <i />}</div>)}</div>
    <div className="consult-grid">
      <section className="panel consult-main">
        <span className="spark large">✳</span>
        <h2>{advice.headline}</h2>
        <p className="muted">Base: {advice.basisCount} resposta(s) registradas, {ws.evidence.length} arquivo(s), {ws.tasks.filter(t => t.status !== "completed").length} tarefa(s) em aberto. Fase atual: <b>{advice.phase}</b>.</p>
        {advice.actions.map((action, i) => <div className={`advice-card prio-${action.priority}`} key={i}>
          <span className="advice-tag">{priorityLabel[action.priority]}</span>
          <b>{action.title}</b>
          <p>{action.detail}</p>
          {action.basis.length > 0 && action.basis.length <= 3 && <small className="muted">Baseado em: {action.basis.map(questionText).join(" · ")}</small>}
        </div>)}
        {advice.actions.length === 0 && <div className="advice-card"><b>Sem ações pendentes.</b><p>Os registros atuais não indicam pendências.</p></div>}
        <div className="form-actions"><button className="secondary" onClick={() => go("diagnostic")}>Abrir diagnóstico →</button><button className="secondary" onClick={() => go("tasks")}>Ver tarefas →</button></div>
      </section>
      <aside className="consult-side">
        <section className="panel">
          <h3>Cuidados</h3>
          {advice.cautions.map((c, i) => <div className="caution" key={i}>{c}</div>)}
        </section>
        <section className="panel">
          <h3>Cálculos financeiros</h3>
          <p className="muted">Feitos por fórmulas fixas, somente quando houver dados registrados.</p>
          {advice.calculations.map(c => <div className="principle-row" key={c.name}><span className={c.ready ? "ok-text" : ""}>{c.ready ? "Disponível" : "Indisponível"}</span><p><b>{c.name}</b>{!c.ready && <><br />Falta: {c.missing.join(", ")}.</>}</p></div>)}
        </section>
        <section className="panel principles">
          <h3>Como as informações são tratadas</h3>
          {Object.values(EVIDENCE_STATUS).map(item => <div className="principle-row" key={item.label}><span>{item.label}</span><p>{item.description}</p></div>)}
        </section>
      </aside>
    </div>
  </>;
}
