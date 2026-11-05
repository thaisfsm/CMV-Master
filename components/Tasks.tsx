"use client";

import { FormEvent, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError, formatDate, localDate, type Site, type Task, type Workspace } from "@/lib/workspace";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/diagnostic.mjs";

type Props = { site: Site; userId: string; ws: Workspace; visitId: string | null; notify: (m: string) => void };
const blank = { title: "", description: "", assignee_name: "", due_on: "", priority: "normal", status: "not_started", stage_id: "", link_visit: true };

export function Tasks({ site, userId, ws, visitId, notify }: Props) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [filter, setFilter] = useState<"open" | "all" | "completed">("open");
  const [busy, setBusy] = useState(false);
  const today = localDate();

  const list = useMemo(() => ws.tasks
    .filter(t => filter === "all" ? true : filter === "open" ? t.status !== "completed" : t.status === "completed")
    .sort((a, b) => (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0) || ({ high: 0, normal: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, normal: 1, low: 2 }[b.priority] ?? 1) || (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999")), [ws.tasks, filter]);

  function startEdit(task: Task | null) {
    if (task) setForm({ title: task.title, description: task.description ?? "", assignee_name: task.assignee_name ?? "", due_on: task.due_on ?? "", priority: task.priority ?? "normal", status: task.status, stage_id: task.stage_id ?? "", link_visit: Boolean(task.visit_id) });
    else setForm({ ...blank, stage_id: (ws.stages.find(s => s.status !== "completed") ?? ws.stages[0])?.id ?? "" });
    setEditing(task ? task.id : "new");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !form.title.trim()) return;
    setBusy(true);
    const existing = ws.tasks.find(t => t.id === editing);
    const payload = {
      title: form.title.trim(), description: form.description.trim() || null, assignee_name: form.assignee_name.trim() || null,
      due_on: form.due_on || null, priority: form.priority, status: form.status, stage_id: form.stage_id || null,
      completed_at: form.status === "completed" ? (existing?.completed_at ?? new Date().toISOString()) : null,
      visit_id: editing === "new" ? (form.link_visit ? visitId : null) : (existing?.visit_id ?? null),
    };
    const result = editing === "new"
      ? await supabase.from("tasks").insert({ ...payload, organization_id: site.organization_id, establishment_id: site.id, created_by: userId })
      : await supabase.from("tasks").update(payload).eq("id", editing!);
    if (result.error) notify(`Não foi possível salvar a tarefa: ${friendlyError(result.error)}`);
    else { notify(editing === "new" ? "Tarefa criada." : "Tarefa atualizada."); setEditing(null); await ws.refresh(); }
    setBusy(false);
  }

  async function setStatus(task: Task, status: string) {
    if (!supabase) return;
    const { error } = await supabase.from("tasks").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", task.id);
    if (error) notify(friendlyError(error)); else { notify(status === "completed" ? "Tarefa concluída." : "Status atualizado."); await ws.refresh(); }
  }

  async function remove(task: Task) {
    if (!supabase || !window.confirm(`Excluir a tarefa “${task.title}”?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) notify(friendlyError(error)); else { notify("Tarefa excluída."); setEditing(null); await ws.refresh(); }
  }

  const set = (key: keyof typeof blank) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));
  const stageName = (id: string | null) => ws.stages.find(s => s.id === id)?.title;

  return <>
    <div className="page-title"><span className="eyebrow">ACOMPANHAMENTO · {site.name.toUpperCase()}</span><h1>Tarefas</h1><p className="muted">Pendências da implantação com responsável, prazo e status.</p></div>
    <div className="toolbar">
      <div className="segmented">{(["open", "all", "completed"] as const).map(f => <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{{ open: "Em aberto", all: "Todas", completed: "Concluídas" }[f]} <span>{ws.tasks.filter(t => f === "all" ? true : f === "open" ? t.status !== "completed" : t.status === "completed").length}</span></button>)}</div>
      <button className="primary" onClick={() => startEdit(null)}>Nova tarefa</button>
    </div>

    {editing && <form className="panel form-grid" onSubmit={save}>
      <div className="panel-head full"><div><h3>{editing === "new" ? "Nova tarefa" : "Editar tarefa"}</h3></div></div>
      <label className="field full">Título<input value={form.title} onChange={set("title")} required placeholder="Ex.: Enviar notas fiscais do último mês" /></label>
      <label className="field full">Descrição<textarea rows={3} value={form.description} onChange={set("description")} /></label>
      <label className="field">Responsável<input value={form.assignee_name} onChange={set("assignee_name")} placeholder="Nome de quem executa" list="people" /></label>
      <datalist id="people">{[...new Set([...(site.management_names ?? []), ...ws.visits.flatMap(v => v.participants), ...ws.tasks.map(t => t.assignee_name).filter(Boolean) as string[]])].map(name => <option key={name} value={name} />)}</datalist>
      <label className="field">Prazo<input type="date" value={form.due_on} onChange={set("due_on")} /></label>
      <label className="field">Prioridade<select value={form.priority} onChange={set("priority")}>{Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field">Status<select value={form.status} onChange={set("status")}>{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field full">Etapa<select value={form.stage_id} onChange={set("stage_id")}><option value="">Sem etapa</option>{ws.stages.map(s => <option key={s.id} value={s.id}>{String(s.stage_number).padStart(2, "0")} · {s.title}</option>)}</select></label>
      {editing === "new" && visitId && <label className="check-line full"><input type="checkbox" checked={form.link_visit} onChange={event => setForm(current => ({ ...current, link_visit: event.target.checked }))} />Vincular à visita selecionada</label>}
      <div className="form-actions full">{editing !== "new" && <button type="button" className="text-button danger" onClick={() => void remove(ws.tasks.find(t => t.id === editing)!)}>Excluir</button>}<button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar tarefa"}</button></div>
    </form>}

    <section className="panel task-table">
      {list.map(task => {
        const late = task.status !== "completed" && task.due_on && task.due_on < today;
        return <div className={`task-line ${task.status === "completed" ? "done" : ""}`} key={task.id}>
          <button className={`task-check ${task.status === "completed" ? "checked" : ""}`} aria-label={task.status === "completed" ? "Reabrir tarefa" : "Concluir tarefa"} onClick={() => void setStatus(task, task.status === "completed" ? "in_progress" : "completed")}>{task.status === "completed" ? "✓" : ""}</button>
          <div className="task-info"><b>{task.title}</b><small>{task.description}</small><small className="task-meta">{stageName(task.stage_id) ?? "Sem etapa"}{task.visit_id ? " · da visita" : ""}</small></div>
          <span className="task-assignee">{task.assignee_name ?? <i className="muted">Sem responsável</i>}</span>
          <span className={`task-due ${late ? "late" : ""}`}>{task.due_on ? formatDate(task.due_on) : "Sem prazo"}</span>
          <span className={`pill prio-${task.priority}`}>{TASK_PRIORITY[task.priority as keyof typeof TASK_PRIORITY]}</span>
          <select className="status-select" value={task.status} onChange={event => void setStatus(task, event.target.value)} aria-label="Status">{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="secondary small" onClick={() => startEdit(task)}>Editar</button>
        </div>;
      })}
      {list.length === 0 && <div className="empty-state">Nenhuma tarefa neste filtro.</div>}
    </section>
  </>;
}
