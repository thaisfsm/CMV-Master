"use client";

import { ChangeEvent, useState } from "react";
import { supabase, EVIDENCE_BUCKET } from "@/lib/supabase";
import { friendlyError, formatDate, type Evidence, type Site } from "@/lib/workspace";
import { evidencePath, validateEvidenceFile, ALLOWED_EVIDENCE_TYPES, DIAGNOSTIC_QUESTIONS } from "@/lib/diagnostic.mjs";

type Props = {
  site: Site; userId: string; visitId: string | null; questionKey?: string | null;
  evidence: Evidence[]; notify: (message: string) => void; onChange: () => Promise<void>; title?: string; compact?: boolean;
};

const questionLabel = (key: string | null) => DIAGNOSTIC_QUESTIONS.find(q => q.key === key)?.question ?? "Visita (geral)";

export function EvidencePanel({ site, userId, visitId, questionKey = null, evidence, notify, onChange, title = "Fotos e documentos", compact = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [description, setDescription] = useState("");

  const files = evidence.filter(file => (visitId ? file.visit_id === visitId : true) && (questionKey === undefined || questionKey === null ? true : file.question_key === questionKey));

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!supabase || !file) return;
    if (!visitId) { notify("Selecione ou registre uma visita antes de anexar arquivos."); return; }
    try { validateEvidenceFile({ size: file.size, type: file.type }); } catch (error) { notify((error as Error).message); return; }
    setBusy(true);
    const id = crypto.randomUUID();
    const path = evidencePath({ organizationId: site.organization_id, establishmentId: site.id, visitId, fileName: file.name, id });
    const uploaded = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) { notify(`Falha no envio: ${friendlyError(uploaded.error)}`); setBusy(false); return; }
    const saved = await supabase.from("evidence_files").insert({
      id, organization_id: site.organization_id, establishment_id: site.id, bucket_id: EVIDENCE_BUCKET, storage_path: path,
      file_name: file.name, media_type: file.type, size_bytes: file.size, uploaded_by: userId, consent_recorded: consent,
      question_key: questionKey, visit_id: visitId, description: description.trim() || null,
    });
    if (saved.error) {
      await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
      notify(`O arquivo não foi registrado: ${friendlyError(saved.error)}`);
    } else {
      notify("Arquivo enviado com armazenamento privado.");
      setDescription(""); setConsent(false);
      await onChange();
    }
    setBusy(false);
  }

  async function open(file: Evidence) {
    if (!supabase) return;
    const tab = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(file.storage_path, 120);
    if (error || !data) { tab?.close(); notify(`Não foi possível abrir: ${friendlyError(error)}`); return; }
    if (tab) tab.location.href = data.signedUrl; else window.location.assign(data.signedUrl);
  }

  async function remove(file: Evidence) {
    if (!supabase || !window.confirm(`Excluir o arquivo “${file.file_name}”?`)) return;
    setBusy(true);
    const removed = await supabase.storage.from(EVIDENCE_BUCKET).remove([file.storage_path]);
    if (removed.error) { notify(friendlyError(removed.error)); setBusy(false); return; }
    const { error } = await supabase.from("evidence_files").delete().eq("id", file.id);
    if (error) notify(friendlyError(error)); else { notify("Arquivo excluído."); await onChange(); }
    setBusy(false);
  }

  return <section className={`panel evidence-panel ${compact ? "compact" : ""}`}>
    <div className="panel-head"><div><h3>{title}</h3><p className="muted">Armazenamento privado. Links de visualização expiram em 2 minutos.</p></div><span className="count-pill">{files.length}</span></div>
    <div className="evidence-upload no-print">
      <label className="field">Descrição (opcional)<input value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: câmara fria, nota fiscal, cardápio" /></label>
      <label className="check-line"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Há pessoa identificável e o consentimento foi obtido</label>
      <label className={`primary upload-button ${busy || !visitId ? "disabled" : ""}`} aria-disabled={busy || !visitId}>
        {busy ? "Enviando…" : "Anexar foto ou documento"}
        <input type="file" accept={ALLOWED_EVIDENCE_TYPES.join(",")} onChange={upload} disabled={busy || !visitId} data-testid="evidence-input" />
      </label>
      <small className="muted">Foto (JPG, PNG, WEBP, HEIC), PDF, Word, Excel, CSV ou texto · até 20 MB.</small>
    </div>
    <div className="evidence-list">
      {files.map(file => <div className="evidence-item" key={file.id}>
        <span className="evidence-icon">{file.media_type?.startsWith("image/") ? "▣" : "▤"}</span>
        <div><b>{file.file_name}</b><small>{formatDate(file.created_at)} · {questionLabel(file.question_key)}{file.description ? ` · ${file.description}` : ""}{file.consent_recorded ? " · consentimento registrado" : ""}</small></div>
        <button type="button" className="secondary small" onClick={() => void open(file)}>Abrir</button>
        <button type="button" className="text-button danger no-print" disabled={busy} onClick={() => void remove(file)} aria-label={`Excluir ${file.file_name}`}>Excluir</button>
      </div>)}
      {files.length === 0 && <div className="empty-state">Nenhum arquivo anexado{visitId ? " nesta visita" : ""}.</div>}
    </div>
  </section>;
}
