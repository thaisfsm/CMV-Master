"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError, formatDate, localDate, type Site, type Visit, type Workspace } from "@/lib/workspace";
import { VISIT_TYPES } from "@/lib/diagnostic.mjs";
import { EvidencePanel } from "@/components/EvidencePanel";

type Props = { site: Site; userId: string; ws: Workspace; visitId: string | null; setVisitId: (id: string | null) => void; notify: (m: string) => void; go: (page: string) => void };

const blank = { visit_date: localDate(), visit_type: "diagnostic", participants: "", objective: "", observations: "", next_steps: "" };

export function Visits({ site, userId, ws, visitId, setVisitId, notify, go }: Props) {
  const [editing, setEditing] = useState<string | "new" | null>(ws.visits.length ? null : "new");
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const selected = ws.visits.find(v => v.id === visitId) ?? null;

  useEffect(() => {
    if (editing && editing !== "new") {
      const v = ws.visits.find(item => item.id === editing);
      if (v) setForm({ visit_date: v.visit_date, visit_type: v.visit_type, participants: v.participants.join(", "), objective: v.objective ?? "", observations: v.observations ?? "", next_steps: v.next_steps ?? "" });
    } else if (editing === "new") setForm({ ...blank, visit_date: localDate() });
  }, [editing, ws.visits]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const stage = ws.stages.find(s => s.status !== "completed") ?? ws.stages[0];
    const payload = {
      visit_date: form.visit_date, visit_type: form.visit_type,
      participants: form.participants.split(",").map(p => p.trim()).filter(Boolean),
      objective: form.objective.trim() || null, observations: form.observations.trim() || null, next_steps: form.next_steps.trim() || null,
    };
    const result = editing === "new"
      ? await supabase.from("visits").insert({ ...payload, organization_id: site.organization_id, establishment_id: site.id, stage_id: stage?.id ?? null, created_by: userId }).select("id").single()
      : await supabase.from("visits").update(payload).eq("id", editing!).select("id").single();
    if (result.error) notify(`Não foi possível salvar a visita: ${friendlyError(result.error)}`);
    else { notify(editing === "new" ? "Visita registrada." : "Visita atualizada."); setVisitId(result.data.id); setEditing(null); await ws.refresh(); }
    setBusy(false);
  }

  async function toggleComplete(visit: Visit) {
    if (!supabase) return;
    const completed = visit.status !== "completed";
    const { error } = await supabase.from("visits").update({ status: completed ? "completed" : "open", completed_at: completed ? new Date().toISOString() : null }).eq("id", visit.id);
    if (error) notify(friendlyError(error)); else { notify(completed ? "Visita concluída." : "Visita reaberta."); await ws.refresh(); }
  }

  const set = (key: keyof typeof blank) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));

  return <>
    <div className="page-title"><span className="eyebrow">REGISTRO DE CAMPO · {site.name.toUpperCase()}</span><h1>Visitas</h1><p className="muted">Cada visita reúne participantes, observações, respostas, arquivos, tarefas e próximos passos. A frequência não é fixa.</p></div>
    <div className="two-col">
      <section className="panel">
        <div className="panel-head"><div><h3>Histórico de visitas</h3><p className="muted">Da mais recente para a mais antiga.</p></div><button className="primary" onClick={() => setEditing("new")}>Nova visita</button></div>
        <div className="visit-list">
          {ws.visits.map(v => <button key={v.id} type="button" className={`visit-card ${v.id === visitId ? "selected" : ""}`} onClick={() => setVisitId(v.id)}>
            <span className="visit-date">{formatDate(v.visit_date)}</span>
            <span className="visit-main"><b>{VISIT_TYPES[v.visit_type as keyof typeof VISIT_TYPES] ?? v.visit_type}</b><small>{v.participants.length ? v.participants.join(", ") : "Participantes não informados"}</small></span>
            <span className={`pill ${v.status === "completed" ? "ok" : "open"}`}>{v.status === "completed" ? "Concluída" : "Em aberto"}</span>
          </button>)}
          {ws.visits.length === 0 && <div className="empty-state">Nenhuma visita registrada ainda.</div>}
        </div>
      </section>

      {editing ? <form className="panel form-grid" onSubmit={save}>
        <div className="panel-head full"><div><h3>{editing === "new" ? "Registrar visita" : "Editar visita"}</h3><p className="muted">Registre somente o que foi observado ou informado.</p></div></div>
        <label className="field">Data<input type="date" value={form.visit_date} onChange={set("visit_date")} required /></label>
        <label className="field">Tipo<select value={form.visit_type} onChange={set("visit_type")}>{Object.entries(VISIT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="field full">Participantes<input value={form.participants} onChange={set("participants")} placeholder="Separe os nomes por vírgula" /></label>
        <label className="field full">Objetivo da visita<input value={form.objective} onChange={set("objective")} placeholder="Ex.: conhecer a operação e a gestão" /></label>
        <label className="field full">Observações<textarea rows={4} value={form.observations} onChange={set("observations")} placeholder="O que foi visto ou relatado. Evite dados pessoais desnecessários." /></label>
        <label className="field full">Próximos passos (um por linha)<textarea rows={4} value={form.next_steps} onChange={set("next_steps")} placeholder={"Enviar cardápio atualizado\nAgendar visita no horário de produção"} /></label>
        <div className="form-actions full"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar visita"}</button></div>
      </form> : selected ? <section className="panel visit-detail">
        <div className="panel-head"><div><span className="eyebrow">{VISIT_TYPES[selected.visit_type as keyof typeof VISIT_TYPES]?.toUpperCase()}</span><h3>Visita de {formatDate(selected.visit_date)}</h3><p className="muted">{selected.participants.join(", ") || "Participantes não informados"}</p></div><span className={`pill ${selected.status === "completed" ? "ok" : "open"}`}>{selected.status === "completed" ? "Concluída" : "Em aberto"}</span></div>
        {selected.objective && <p><b>Objetivo:</b> {selected.objective}</p>}
        <p className="pre">{selected.observations || <span className="muted">Sem observações registradas.</span>}</p>
        <h4>Próximos passos</h4>
        <p className="pre">{selected.next_steps || <span className="muted">A definir.</span>}</p>
        <div className="form-actions">
          <button className="secondary" onClick={() => setEditing(selected.id)}>Editar</button>
          <button className="secondary" onClick={() => go("diagnostic")}>Abrir diagnóstico</button>
          <button className="secondary" onClick={() => go("reports")}>Gerar relatório</button>
          <button className="primary" onClick={() => void toggleComplete(selected)}>{selected.status === "completed" ? "Reabrir visita" : "Concluir visita"}</button>
        </div>
      </section> : <section className="panel empty-state">Selecione uma visita ou registre uma nova.</section>}
    </div>
    {selected && !editing && <EvidencePanel site={site} userId={userId} visitId={selected.id} evidence={ws.evidence} notify={notify} onChange={ws.refresh} title="Arquivos desta visita" />}
  </>;
}
