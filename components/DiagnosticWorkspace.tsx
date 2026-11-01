"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Site = { id: string; organization_id: string; name: string };
type Visit = { id: string; created_at: string; details: Record<string, unknown> };
type Answer = { question_key: string; question: string; answer: string; evidence_status: string; updated_at: string };
type Evidence = { id: string; file_name: string; storage_path: string; media_type: string | null; created_at: string; question_key: string | null };
type Task = { id: string; title: string; description: string | null; status: string };

export const diagnosticQuestions = [
  ["management", "Como a gestão está organizada e quem decide sobre a operação?"],
  ["expectations", "Quais resultados a gestão espera alcançar com a implantação?"],
  ["difficulties", "Quais são hoje as maiores dificuldades da operação?"],
  ["structure", "Quais áreas e espaços compõem a operação?"],
  ["responsibles", "Quem são os responsáveis por cada área e processo?"],
  ["menu", "Quais categorias e itens fazem parte do cardápio atual?"],
  ["production", "Como a produção e o serviço funcionam em um dia típico?"],
  ["purchases", "Como as compras são solicitadas e aprovadas atualmente?"],
  ["receiving", "Como é feito o recebimento e a conferência das mercadorias?"],
  ["stock", "Como os itens são armazenados e como o estoque é acompanhado?"],
  ["systems", "Quais sistemas são utilizados na gestão e na operação?"],
  ["controls", "Quais controles já são realizados? Quem os atualiza?"],
  ["documents", "Quais documentos, relatórios ou registros estão disponíveis?"],
  ["team", "Como a equipe está distribuída por função e turno?"],
  ["visit", "Há alguma observação importante desta visita diagnóstica?"],
] as const;

function localDate() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function DiagnosticWorkspace({ site, userId, notify }: { site: Site; userId: string; notify: (message: string) => void }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [answerHistory, setAnswerHistory] = useState<Record<string, unknown>[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [visitId, setVisitId] = useState("");
  const [visitDate, setVisitDate] = useState(localDate());
  const [participants, setParticipants] = useState("");
  const [observations, setObservations] = useState("");
  const [followUps, setFollowUps] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!supabase) return;
    const [visitResult, answerResult, historyResult, evidenceResult, taskResult] = await Promise.all([
      supabase.from("audit_events").select("id,created_at,details").eq("establishment_id", site.id).eq("entity_type", "visit").order("created_at", { ascending: false }),
      supabase.from("diagnostic_responses").select("question_key,question,answer,evidence_status,updated_at").eq("establishment_id", site.id),
      supabase.from("audit_events").select("id,created_at,details").eq("establishment_id", site.id).eq("entity_type", "answer_revision").order("created_at", { ascending: false }).limit(100),
      supabase.from("evidence_files").select("id,file_name,storage_path,media_type,created_at,question_key").eq("establishment_id", site.id).order("created_at", { ascending: false }),
      supabase.from("tasks").select("id,title,description,status").eq("establishment_id", site.id).order("created_at"),
    ]);
    const failed = [visitResult, answerResult, historyResult, evidenceResult, taskResult].find(result => result.error);
    if (failed?.error) notify(`Falha ao atualizar o diagnóstico: ${failed.error.message}`);
    const nextVisits = (visitResult.data ?? []) as Visit[];
    setVisits(nextVisits);
    setAnswers((answerResult.data ?? []) as Answer[]);
    setAnswerHistory((historyResult.data ?? []).map(row => row.details as Record<string, unknown>));
    setEvidence((evidenceResult.data ?? []) as Evidence[]);
    setTasks((taskResult.data ?? []) as Task[]);
    if (!visitId && nextVisits[0]) setVisitId(nextVisits[0].id);
  }

  useEffect(() => { void refresh(); }, [site.id]);
  useEffect(() => {
    const [key] = diagnosticQuestions[questionIndex];
    setAnswer(answers.find(item => item.question_key === key)?.answer ?? "");
  }, [questionIndex, answers]);

  async function createVisit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !visitDate) return;
    setBusy(true);
    const id = crypto.randomUUID();
    const { error } = await supabase.from("audit_events").insert({
      id, organization_id: site.organization_id, establishment_id: site.id, actor_id: userId,
      action: "visit_recorded", entity_type: "visit", entity_id: id,
      details: { visit_date: visitDate, participants: participants.split(",").map(value => value.trim()).filter(Boolean), observations, follow_ups: followUps, stage_number: 1 },
    });
    if (error) notify(`Não foi possível registrar a visita: ${error.message}`);
    else { setVisitId(id); notify("Visita diagnóstica registrada."); await refresh(); }
    setBusy(false);
  }

  async function saveAnswer(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !visitId || !answer.trim()) return;
    setBusy(true);
    const [key, question] = diagnosticQuestions[questionIndex];
    const { error } = await supabase.from("diagnostic_responses").upsert({
      organization_id: site.organization_id, establishment_id: site.id, question_key: key, question,
      answer: answer.trim(), evidence_status: "declared", updated_by: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "establishment_id,question_key" });
    if (error) notify(`Não foi possível salvar a resposta: ${error.message}`);
    else {
      const history = await supabase.from("audit_events").insert({
        organization_id: site.organization_id, establishment_id: site.id, actor_id: userId,
        action: "answer_recorded", entity_type: "answer_revision", details: { visit_id: visitId, question_key: key, question, answer: answer.trim(), evidence_status: "declared" },
      });
      if (history.error) notify(`Resposta salva; o histórico da visita não foi registrado: ${history.error.message}`);
      else notify("Resposta salva como declarada e vinculada à visita.");
      await refresh();
      if (questionIndex < diagnosticQuestions.length - 1) setQuestionIndex(questionIndex + 1);
    }
    setBusy(false);
  }

  async function uploadEvidence(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!supabase || !file || !visitId) return;
    if (file.size > 20 * 1024 * 1024) { notify("O arquivo deve ter no máximo 20 MB."); event.target.value = ""; return; }
    setBusy(true);
    const [key] = diagnosticQuestions[questionIndex];
    const cleanName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${site.organization_id}/${site.id}/${visitId}/${key}/${crypto.randomUUID()}-${cleanName}`;
    const uploaded = await supabase.storage.from("cmv-evidence").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploaded.error) notify(`Falha no upload: ${uploaded.error.message}`);
    else {
      const saved = await supabase.from("evidence_files").insert({ organization_id: site.organization_id, establishment_id: site.id, bucket_id: "cmv-evidence", storage_path: path, file_name: file.name, media_type: file.type || null, size_bytes: file.size, uploaded_by: userId, consent_recorded: consent, question_key: key });
      if (saved.error) notify(`Arquivo enviado, mas o índice não foi salvo: ${saved.error.message}`);
      else notify("Evidência enviada e vinculada à pergunta e à visita.");
      await refresh();
    }
    event.target.value = "";
    setBusy(false);
  }

  async function openEvidence(file: Evidence) {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("cmv-evidence").createSignedUrl(file.storage_path, 60);
    if (error) notify(`Não foi possível abrir o arquivo: ${error.message}`);
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function toggleTask(task: Task) {
    if (!supabase) return;
    const status = task.status === "completed" ? "not_started" : "completed";
    const { error } = await supabase.from("tasks").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", task.id);
    if (error) notify(`Não foi possível atualizar a tarefa: ${error.message}`); else await refresh();
  }

  const [questionKey, questionText] = diagnosticQuestions[questionIndex];
  const answered = new Set(answers.map(item => item.question_key)).size;
  const activeVisit = visits.find(visit => visit.id === visitId);

  return <>
    <div className="page-title"><span className="eyebrow">ETAPA 01 · PRIMEIRA VISITA DIAGNÓSTICA</span><h1>Diagnóstico da Pizzaria Enrico</h1><p className="muted">Registre a operação observada e as informações declaradas. Esta etapa não inclui pesagem, custos nem padronização de receitas.</p></div>
    <div className="panel diagnostic-visit-panel no-print"><div className="panel-head"><div><h3>Visita e responsáveis</h3><p className="muted">O registro fica no histórico do estabelecimento.</p></div><span className="count-pill">{visits.length} visita(s)</span></div>
      <form className="visit-form" onSubmit={createVisit}><label>Data<input type="date" value={visitDate} onChange={event => setVisitDate(event.target.value)} required/></label><label>Participantes<input value={participants} onChange={event => setParticipants(event.target.value)} placeholder="Separe os nomes por vírgula" required/></label><label>Observações<textarea value={observations} onChange={event => setObservations(event.target.value)} rows={2} placeholder="Registre somente o que foi observado ou informado."/></label><label>Próximas ações<textarea value={followUps} onChange={event => setFollowUps(event.target.value)} rows={2} placeholder="Pendências e próximos passos acordados."/></label><button className="primary" disabled={busy || !participants.trim()}>{busy ? "Salvando…" : "Registrar visita"}</button></form>
      {visits.length > 0 && <div className="visit-history"><b>Histórico de visitas</b>{visits.map(visit => <button type="button" key={visit.id} className={visit.id === visitId ? "visit-item selected" : "visit-item"} onClick={() => setVisitId(visit.id)}><strong>{String(visit.details.visit_date ?? new Date(visit.created_at).toLocaleDateString("pt-BR"))}</strong><span>{Array.isArray(visit.details.participants) ? visit.details.participants.join(", ") : "Participantes não informados"}</span></button>)}</div>}
    </div>
    {!activeVisit ? <div className="panel empty-state">Registre a visita acima para começar a salvar respostas e evidências.</div> : <>
      <div className="panel diagnostic-work-panel"><div className="diagnostic-work-head"><div><span className="step-label">PERGUNTA {String(questionIndex + 1).padStart(2, "0")} / {diagnosticQuestions.length}</span><h2>{questionText}</h2><p className="muted">Por que perguntamos: entender a rotina relatada ajuda a organizar as próximas etapas sem presumir práticas não verificadas.</p></div><span className="count-pill">{answered}/{diagnosticQuestions.length} respondidas</span></div>
        <form onSubmit={saveAnswer}><label className="response-label">RESPOSTA DECLARADA<textarea value={answer} onChange={event => setAnswer(event.target.value)} rows={5} placeholder="Registre o que foi informado. Evite dados pessoais desnecessários."/></label><div className="diagnostic-controls"><button type="button" className="secondary" disabled={questionIndex === 0} onClick={() => setQuestionIndex(questionIndex - 1)}>Anterior</button><button className="primary" disabled={busy || !answer.trim()}>{busy ? "Salvando…" : "Salvar resposta e avançar"}</button><button type="button" className="secondary" disabled={questionIndex === diagnosticQuestions.length - 1} onClick={() => setQuestionIndex(questionIndex + 1)}>Próxima</button></div></form>
        <div className="question-index">{diagnosticQuestions.map(([key, text], index) => <button type="button" key={key} className={index === questionIndex ? "selected" : ""} onClick={() => setQuestionIndex(index)}><span>{answers.some(item => item.question_key === key) ? "✓" : String(index + 1).padStart(2, "0")}</span>{text}</button>)}</div>
        <div className="evidence-tools no-print"><label className="consent-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>Consentimento registrado quando o arquivo incluir imagem de pessoa identificável.</label><label className="secondary upload-button">Anexar foto ou documento<input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={uploadEvidence} disabled={busy}/></label><small>Arquivos privados no Supabase Storage. Máximo 20 MB por arquivo. Áudio e vídeo não são habilitados nesta versão.</small></div>
      </div>
      <div className="diagnostic-columns"><section className="panel"><div className="panel-head"><div><h3>Tarefas e pendências</h3><p className="muted">Avance conforme as informações disponíveis.</p></div></div>{tasks.map(task => <label className="diagnostic-task" key={task.id}><input type="checkbox" checked={task.status === "completed"} onChange={() => void toggleTask(task)}/><span><b>{task.title}</b><small>{task.description}</small></span></label>)}</section>
        <section className="panel"><div className="panel-head"><div><h3>Evidências anexadas</h3><p className="muted">Fotos e documentos desta visita.</p></div><span className="count-pill">{evidence.length}</span></div>{evidence.filter(file => file.storage_path.includes(`/${visitId}/`)).map(file => <button className="evidence-row" type="button" key={file.id} onClick={() => void openEvidence(file)}><span>↗</span><b>{file.file_name}</b><small>{file.question_key ?? "Diagnóstico"}</small></button>)}{evidence.filter(file => file.storage_path.includes(`/${visitId}/`)).length === 0 && <div className="empty-state">Nenhum arquivo anexado a esta visita.</div>}</section></div>
      <section className="panel answer-history"><div className="panel-head"><div><h3>Histórico das respostas</h3><p className="muted">Revisões anteriores ficam associadas à visita.</p></div><button type="button" className="secondary no-print" onClick={() => window.print()}>Exportar / imprimir relatório</button></div>{answerHistory.filter(item => item.visit_id === visitId).map((item,index) => <article key={`${String(item.question_key)}-${index}`}><b>{String(item.question)}</b><p>{String(item.answer)}</p><small>Declarada · {String(item.question_key)}</small></article>)}{answerHistory.filter(item => item.visit_id === visitId).length === 0 && <div className="empty-state">As respostas registradas para esta visita aparecerão aqui.</div>}</section>
    </>}
    <div className="panel consent-note"><b>Orientação para a visita</b><p>Esta visita é exclusivamente diagnóstica. Não solicite pesagem de ingredientes, custos, fichas técnicas ou padronização de receitas. Obtenha consentimento para registros com pessoas identificáveis e evite fotografar clientes ou terceiros sem autorização.</p></div>
  </>;
}
