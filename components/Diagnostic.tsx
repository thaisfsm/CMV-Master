"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError, formatDate, type Site, type Workspace } from "@/lib/workspace";
import { DIAGNOSTIC_QUESTIONS, AREA_LABELS, EVIDENCE_STATUS, SITUATION, VISIT_TYPES, validateResponse, diagnosticProgress } from "@/lib/diagnostic.mjs";
import { EvidencePanel } from "@/components/EvidencePanel";

type Revision = { id: string; answer: string; evidence_status: string; situation: string | null; notes: string | null; revised_at: string; visit_id: string | null };
type Props = { site: Site; userId: string; ws: Workspace; visitId: string | null; setVisitId: (id: string | null) => void; notify: (m: string) => void; go: (page: string) => void };

export function Diagnostic({ site, userId, ws, visitId, setVisitId, notify, go }: Props) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evidenceStatus, setEvidenceStatus] = useState("declared");
  const [situation, setSituation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<Revision[]>([]);
  const question = DIAGNOSTIC_QUESTIONS[index];
  const saved = ws.responses.find(r => r.question_key === question.key);
  const progress = diagnosticProgress(ws.responses);
  const visit = ws.visits.find(v => v.id === visitId) ?? null;

  useEffect(() => {
    setAnswer(saved?.answer ?? ""); setEvidenceStatus(saved?.evidence_status ?? "declared"); setSituation(saved?.situation ?? ""); setNotes(saved?.notes ?? ""); setDirty(false);
  }, [question.key, saved?.answer, saved?.evidence_status, saved?.situation, saved?.notes]);

  useEffect(() => {
    if (!supabase || !saved) { setHistory([]); return; }
    void supabase.from("diagnostic_response_revisions").select("id,answer,evidence_status,situation,notes,revised_at,visit_id").eq("response_id", saved.id).order("revised_at", { ascending: false }).limit(10)
      .then(({ data }) => setHistory((data ?? []) as Revision[]));
  }, [saved?.id, saved?.updated_at]);

  function goTo(next: number) {
    if (dirty && !window.confirm("Há alterações não salvas nesta pergunta. Deseja sair sem salvar?")) return;
    setIndex(Math.max(0, Math.min(DIAGNOSTIC_QUESTIONS.length - 1, next)));
  }

  async function save(event: FormEvent, advance = true) {
    event.preventDefault();
    if (!supabase) return;
    if (!visitId) { notify("Selecione ou registre a visita antes de salvar respostas."); return; }
    let clean;
    try { clean = validateResponse({ answer, evidenceStatus, situation: situation || null, notes }); } catch (error) { notify((error as Error).message); return; }
    setBusy(true);
    const { error } = await supabase.from("diagnostic_responses").upsert({
      organization_id: site.organization_id, establishment_id: site.id, question_key: question.key, question: question.question,
      ...clean, visit_id: visitId, updated_by: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "establishment_id,question_key" });
    if (error) { notify(`Não foi possível salvar: ${friendlyError(error)}`); setBusy(false); return; }
    setDirty(false);
    notify(saved ? "Resposta atualizada. A versão anterior ficou no histórico." : "Resposta salva.");
    await ws.refresh();
    if (advance && index < DIAGNOSTIC_QUESTIONS.length - 1) setIndex(index + 1);
    setBusy(false);
  }

  const edit = (setter: (v: string) => void) => (event: { target: { value: string } }) => { setter(event.target.value); setDirty(true); };

  return <>
    <div className="page-title"><span className="eyebrow">ETAPA 01 · LEVANTAR · VISITA DIAGNÓSTICA</span><h1>Diagnóstico da {site.name}</h1><p className="muted">Registre a operação como ela é hoje. Esta etapa não exige pesagem, custos nem padronização.</p></div>

    <section className="panel visit-bar">
      <label className="field">Visita em registro
        <select value={visitId ?? ""} onChange={event => setVisitId(event.target.value || null)} data-testid="visit-select">
          <option value="">Selecione…</option>
          {ws.visits.map(v => <option key={v.id} value={v.id}>{formatDate(v.visit_date)} · {VISIT_TYPES[v.visit_type as keyof typeof VISIT_TYPES]}{v.status === "completed" ? " (concluída)" : ""}</option>)}
        </select>
      </label>
      <button className="secondary" onClick={() => go("visits")}>{ws.visits.length ? "Gerenciar visitas" : "Registrar primeira visita"}</button>
      <div className="progress-inline"><b>{progress.answered}/{progress.total}</b> tópicos · <b>{progress.classified}</b> classificados · <b>{progress.confirmed}</b> confirmados<div className="mini-bar"><i style={{ width: `${progress.percent}%` }} /></div></div>
    </section>

    {!visit && <div className="notice">Selecione uma visita para registrar respostas e anexar arquivos. As respostas já salvas continuam visíveis.</div>}

    <div className="diagnostic-grid">
      <section className="panel question-panel">
        <div className="panel-head"><div><span className="step-label">PERGUNTA {String(index + 1).padStart(2, "0")} / {DIAGNOSTIC_QUESTIONS.length} · {AREA_LABELS[question.area as keyof typeof AREA_LABELS].toUpperCase()}</span><h2 className="question-title">{question.question}</h2><p className="muted">Por que perguntamos: {question.why}</p></div>{saved && <span className="pill ok">Salva em {formatDate(saved.updated_at)}</span>}</div>
        <form onSubmit={event => void save(event)}>
          <label className="field">Resposta<textarea rows={6} value={answer} onChange={edit(setAnswer)} placeholder="Registre o que foi informado ou observado." data-testid="answer" /></label>
          <div className="choice-row">
            <fieldset><legend>Grau de confirmação</legend>{Object.entries(EVIDENCE_STATUS).map(([key, item]) => <label key={key} className={`chip ${evidenceStatus === key ? "active" : ""}`} title={item.description}><input type="radio" name="evidence" value={key} checked={evidenceStatus === key} onChange={edit(setEvidenceStatus)} />{item.label}</label>)}</fieldset>
            <fieldset><legend>Situação do tópico</legend>{Object.entries(SITUATION).map(([key, item]) => <label key={key} className={`chip sit-${key} ${situation === key ? "active" : ""}`} title={item.description}><input type="radio" name="situation" value={key} checked={situation === key} onChange={edit(setSituation)} />{item.label}</label>)}<label className={`chip ${situation === "" ? "active" : ""}`}><input type="radio" name="situation" value="" checked={situation === ""} onChange={edit(setSituation)} />Sem classificação</label></fieldset>
          </div>
          <label className="field">Observações da consultora (opcional)<input value={notes} onChange={edit(setNotes)} placeholder="Ex.: confirmar com a nota fiscal na próxima visita" /></label>
          <div className="form-actions">
            <button type="button" className="secondary" disabled={index === 0} onClick={() => goTo(index - 1)}>← Anterior</button>
            <button type="button" className="secondary" disabled={busy || !visit || !answer.trim()} onClick={event => void save(event as unknown as FormEvent, false)}>Salvar</button>
            <button className="primary" disabled={busy || !visit || !answer.trim()}>{busy ? "Salvando…" : "Salvar e avançar →"}</button>
            <button type="button" className="secondary" disabled={index === DIAGNOSTIC_QUESTIONS.length - 1} onClick={() => goTo(index + 1)}>Próxima →</button>
          </div>
        </form>
        {history.length > 1 && <details className="revisions"><summary>Histórico desta resposta ({history.length} versões)</summary>{history.map(rev => <div key={rev.id} className="revision"><small>{new Date(rev.revised_at).toLocaleString("pt-BR")} · {EVIDENCE_STATUS[rev.evidence_status as keyof typeof EVIDENCE_STATUS]?.label}{rev.situation ? ` · ${SITUATION[rev.situation as keyof typeof SITUATION]?.label}` : ""}</small><p>{rev.answer}</p></div>)}</details>}
      </section>

      <aside className="panel topic-index">
        <span className="step-label">ROTEIRO DA VISITA</span>
        <div className="question-list">{DIAGNOSTIC_QUESTIONS.map((q, i) => {
          const r = ws.responses.find(item => item.question_key === q.key);
          return <button key={q.key} className={i === index ? "q-active" : ""} onClick={() => goTo(i)}>
            <span className={r ? `q-done ${r.situation ? `sit-${r.situation}` : ""}` : "q-number"}>{r ? "✓" : String(i + 1).padStart(2, "0")}</span>
            <span className="q-text">{q.question}{r && <small>{EVIDENCE_STATUS[r.evidence_status as keyof typeof EVIDENCE_STATUS]?.label}{r.situation ? ` · ${SITUATION[r.situation as keyof typeof SITUATION]?.label}` : ""}</small>}</span>
          </button>;
        })}</div>
        <div className="consent-note"><b>Lembrete</b><p>Não solicite pesagem, custos ou fichas técnicas nesta etapa. Obtenha consentimento antes de fotografar pessoas.</p></div>
      </aside>
    </div>
    <EvidencePanel site={site} userId={userId} visitId={visitId} questionKey={question.key} evidence={ws.evidence} notify={notify} onChange={ws.refresh} title={`Arquivos deste tópico`} compact />
  </>;
}
