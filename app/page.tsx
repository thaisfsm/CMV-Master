"use client";

import { FormEvent, useCallback, useEffect, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { BrandLockup } from "@/components/BrandLockup";
import { TechnicalCenter } from "@/components/TechnicalCenter";
import { Visits } from "@/components/Visits";
import { Diagnostic } from "@/components/Diagnostic";
import { Tasks } from "@/components/Tasks";
import { Consultant } from "@/components/Consultant";
import { Reports } from "@/components/Reports";
import { ContextExport } from "@/components/ContextExport";
import { supabase, supabaseReady } from "@/lib/supabase";
import { friendlyError, formatDate, useWorkspace, type Site, type Workspace } from "@/lib/workspace";
import { diagnosticProgress } from "@/lib/diagnostic.mjs";

const nav = [
  { id: "home", label: "Visão geral", icon: "◫" },
  { id: "implementation", label: "Implantação", icon: "⌁" },
  { id: "visits", label: "Visitas", icon: "◷" },
  { id: "diagnostic", label: "Diagnóstico", icon: "◎" },
  { id: "tasks", label: "Tarefas", icon: "☑" },
  { id: "consultant", label: "Consultor CMV", icon: "✳" },
  { id: "technical", label: "Central técnica", icon: "⌗" },
  { id: "inventory", label: "Compras e estoque", icon: "▤" },
  { id: "losses", label: "Perdas", icon: "↘" },
  { id: "training", label: "Treinamentos", icon: "▱" },
  { id: "reports", label: "Relatórios", icon: "▧" },
];
const pages = new Set(nav.map(item => item.id));

const statusLabel: Record<string, string> = { not_started: "Não iniciado", in_progress: "Em andamento", awaiting_information: "Aguardando informação", awaiting_approval: "Aguardando aprovação", completed: "Concluído", blocked: "Bloqueado" };

function authMessage(message: string) {
  if (/Invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(message)) return "Confirme o e-mail antes de entrar. Verifique a caixa de entrada.";
  if (/User already registered/i.test(message)) return "Este e-mail já tem cadastro. Use Entrar ou recupere a senha.";
  if (/Password should be at least/i.test(message)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return friendlyError({ message });
}

function readPref(key: string) { try { return window.localStorage.getItem(key); } catch { return null; } }
function writePref(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* preferências são opcionais */ } }

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [active, setActive] = useState("home");
  const [visitId, setVisitIdState] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup" | "reset">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const theme = readPref("cmv-theme");
    setDark(theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
    const fromHash = window.location.hash.replace("#", "");
    if (pages.has(fromHash)) setActive(fromHash);
    const onHash = () => { const h = window.location.hash.replace("#", ""); if (pages.has(h)) setActive(h); };
    window.addEventListener("hashchange", onHash);
    if (!supabase) { setReady(true); return () => window.removeEventListener("hashchange", onHash); }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, current) => { setSession(current); if (event === "PASSWORD_RECOVERY") setRecovery(true); });
    return () => { data.subscription.unsubscribe(); window.removeEventListener("hashchange", onHash); };
  }, []);

  const loadSites = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("establishments").select("*").order("created_at");
    if (error) { setMessage(friendlyError(error)); setSites([]); return; }
    const list = (data ?? []) as Site[];
    setSites(list);
    const saved = readPref("cmv-site");
    const preferred = list.find(s => s.id === saved) ?? list.find(s => /enrico/i.test(s.name)) ?? list[0];
    setSiteId(preferred?.id ?? null);
  }, []);

  useEffect(() => { if (session) void loadSites(); else { setSites(null); setSiteId(null); } }, [session?.user.id, loadSites]);

  const site = sites?.find(s => s.id === siteId) ?? null;
  const ws = useWorkspace(site);

  useEffect(() => {
    if (!site) return;
    const saved = readPref(`cmv-visit-${site.id}`);
    if (ws.visits.length && (!visitId || !ws.visits.some(v => v.id === visitId))) {
      setVisitIdState(ws.visits.find(v => v.id === saved)?.id ?? ws.visits.find(v => v.status !== "completed")?.id ?? ws.visits[0].id);
    }
  }, [site, ws.visits, visitId]);

  function setVisitId(id: string | null) { setVisitIdState(id); if (site && id) writePref(`cmv-visit-${site.id}`, id); }
  function go(page: string) { setActive(page); window.history.replaceState(null, "", `#${page}`); window.scrollTo({ top: 0 }); }
  function toggleTheme() { setDark(!dark); writePref("cmv-theme", dark ? "light" : "dark"); }

  async function authenticate(event: FormEvent) {
    event.preventDefault(); if (!supabase) return;
    setLoading(true); setMessage("");
    if (authMode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setMessage(error ? authMessage(error.message) : "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
      setLoading(false); return;
    }
    const result = authMode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    if (result.error) setMessage(authMessage(result.error.message));
    else if (authMode === "signup" && !result.data.session) setMessage("Confira seu e-mail para confirmar o cadastro. Depois, entre com a senha criada.");
    setLoading(false);
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault(); if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error ? authMessage(error.message) : "Senha atualizada.");
    if (!error) setRecovery(false);
    setLoading(false);
  }

  async function startWorkspace() {
    if (!supabase) return;
    setLoading(true); setMessage("");
    const { error } = await supabase.rpc("start_initial_workspace", { owner_name: session?.user.email ?? "" });
    if (error) setMessage(friendlyError(error)); else await loadSites();
    setLoading(false);
  }

  async function logout() { if (supabase) await supabase.auth.signOut(); setSites(null); setSiteId(null); setVisitIdState(null); }

  if (!ready) return <div className="boot"><span className="loader" />Carregando CMV Mestre</div>;

  if (!supabaseReady) return <div className="setup-shell"><div className="setup-card"><BrandLockup variant="card" /><div className="eyebrow">CONFIGURAÇÃO NECESSÁRIA</div><h1>Conecte o banco de dados</h1><p>Configure um projeto Supabase e preencha as duas variáveis públicas de ambiente para habilitar login e persistência segura.</p><pre>NEXT_PUBLIC_SUPABASE_URL={"\n"}NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=</pre><p className="muted">O app não grava dados de operação no navegador.</p></div></div>;

  if (recovery && session) return <div className="auth-screen"><div className="auth-brand"><BrandLockup /></div><form className="auth-card" onSubmit={updatePassword}><span className="eyebrow">RECUPERAÇÃO DE ACESSO</span><h1>Crie uma nova senha</h1><label>Nova senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></label><button className="primary full" disabled={loading}>{loading ? "Aguarde…" : "Salvar nova senha"}</button>{message && <div className="notice">{message}</div>}</form></div>;

  if (!session) return <div className="auth-screen"><div className="auth-brand"><BrandLockup /></div><form className="auth-card" onSubmit={authenticate}><span className="eyebrow">ESPAÇO DE TRABALHO</span><h1>{authMode === "login" ? "Acesse sua conta" : authMode === "signup" ? "Crie seu acesso" : "Recuperar senha"}</h1><p className="muted">Dados protegidos por autenticação e isolamento por empresa. A sessão fica ativa neste dispositivo até você sair.</p><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>{authMode !== "reset" && <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete={authMode === "login" ? "current-password" : "new-password"} /></label>}<button className="primary full" disabled={loading}>{loading ? "Aguarde…" : authMode === "login" ? "Entrar" : authMode === "signup" ? "Criar conta" : "Enviar link"}</button>{authMode === "login" && <button className="text-button" type="button" onClick={() => { setAuthMode("reset"); setMessage(""); }}>Esqueci minha senha</button>}<button className="text-button" type="button" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setMessage(""); }}>{authMode === "login" ? "Primeiro acesso? Criar conta" : "Já tem acesso? Entrar"}</button>{message && <div className="notice" role="status">{message}</div>}</form></div>;

  if (sites === null) return <div className="boot"><span className="loader" />Carregando estabelecimentos</div>;

  if (!site) return <div className="setup-shell"><div className="setup-card"><BrandLockup variant="card" /><div className="eyebrow">PRIMEIRO ACESSO</div><h1>Prepare o espaço de trabalho</h1><p>Será criado o cadastro inicial da Pizzaria Enrico com os dados do contrato e as seis etapas da implantação. Informações operacionais serão coletadas no diagnóstico.</p><p className="muted">Se você foi convidada para um espaço que já existe, peça à responsável para incluir seu e-mail antes de continuar.</p><button className="primary" disabled={loading} onClick={startWorkspace}>{loading ? "Configurando…" : "Criar projeto Enrico"}</button><button className="text-button" onClick={logout}>Sair</button>{message && <div className="notice">{message}</div>}</div></div>;

  const activeNav = nav.find(item => item.id === active);
  const progress = diagnosticProgress(ws.responses);
  const notify = (text: string) => setMessage(text);

  return <main className={dark ? "app dark" : "app light"} data-theme={dark ? "dark" : "light"}>
    <aside className="sidebar no-print"><BrandLockup variant="compact" />
      <div className="workspace-label">ESPAÇO DE TRABALHO</div>
      <label className="site-picker"><span className="site-avatar">{site.name.slice(0, 1)}</span><span><b>{site.name}</b><small>{site.segment}</small></span>
        {sites.length > 1 ? <select className="site-select" aria-label="Selecionar estabelecimento" value={site.id} onChange={event => { setSiteId(event.target.value); writePref("cmv-site", event.target.value); setVisitIdState(null); }}>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <span className="chevron">⌄</span>}
      </label>
      <div className="nav-title">ACOMPANHAMENTO</div>
      <nav>{nav.map(item => <button key={item.id} className={`nav-item ${active === item.id ? "selected" : ""}`} onClick={() => go(item.id)} title={item.label}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}{item.id === "diagnostic" && progress.answered < progress.total && <i className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><button className="consultant-chip" onClick={() => go("consultant")}><span className="spark">✳</span><span><b>Consultor CMV Mestre</b><small>Orientações por metodologia</small></span></button><button className="profile" onClick={() => { if (window.confirm("Sair do CMV Mestre neste dispositivo?")) void logout(); }} title="Sair"><span className="profile-avatar">{(session.user.email?.[0] ?? "C").toUpperCase()}</span><span><b>{session.user.email}</b><small>Sair</small></span><span className="more">⎋</span></button></div>
    </aside>
    <section className="main-area">
      <header className="topbar no-print"><div className="breadcrumbs">CMV MESTRE <span>/</span> {activeNav?.label.toUpperCase()}</div><div className="top-actions"><span className="sync-state"><i className={ws.loading ? "syncing" : ""} /> {ws.loading ? "Sincronizando…" : "Dados sincronizados"}</span><button className="icon-button" aria-label="Alternar tema" onClick={toggleTheme}>{dark ? "☼" : "◐"}</button><span className="top-avatar">{(session.user.email?.[0] ?? "C").toUpperCase()}</span></div></header>
      <div className="content">
        {message && <div className="toast" role="status" onClick={() => setMessage("")}>{message}<button aria-label="Fechar">×</button></div>}
        {ws.schemaOutdated && <div className="notice">O banco de dados ainda não recebeu a atualização deste sprint (visitas, classificação e responsáveis). Os dados existentes estão preservados; essas funções ficam disponíveis após a atualização.</div>}
        {ws.error && <div className="notice">{ws.error}</div>}
        {active === "home" && <Dashboard site={site} ws={ws} go={go} />}
        {active === "implementation" && <Implementation site={site} ws={ws} go={go} notify={notify} />}
        {active === "visits" && <Visits site={site} userId={session.user.id} ws={ws} visitId={visitId} setVisitId={setVisitId} notify={notify} go={go} />}
        {active === "diagnostic" && <Diagnostic site={site} userId={session.user.id} ws={ws} visitId={visitId} setVisitId={setVisitId} notify={notify} go={go} />}
        {active === "tasks" && <Tasks site={site} userId={session.user.id} ws={ws} visitId={visitId} notify={notify} />}
        {active === "consultant" && <Consultant ws={ws} go={go} />}
        {active === "technical" && <TechnicalCenter site={site} notify={notify} />}
        {active === "reports" && <Reports site={site} ws={ws} visitId={visitId} setVisitId={setVisitId} notify={notify} go={go} />}
        {active === "inventory" && <PendingModule title="Compras e estoque" icon="▤" ws={ws} go={go} facts={[["Compras registradas", ws.counts.purchases], ["Compras recebidas", ws.counts.receivedPurchases], ["Inventários fechados", ws.counts.closedInventories], ["Ingredientes", ws.counts.ingredients]]} text="O banco já tem compras, itens, recebimento atômico (receive_purchase), inventário com fechamento (close_inventory_count) e saldo de estoque. As telas de lançamento ainda não foram construídas. Na etapa diagnóstica, registre como as compras e o estoque funcionam hoje nos tópicos do diagnóstico." />}
        {active === "losses" && <PendingModule title="Perdas" icon="↘" ws={ws} go={go} facts={[["Casos registrados", ws.counts.losses]]} text="O banco já tem o registro de perdas com status (suspeita, diferença não investigada, comprovada), causa e ação corretiva. A tela de registro ainda não foi construída. O impacto financeiro só será calculado com quantidade e custo unitário conhecidos." />}
        {active === "training" && <PendingModule title="Treinamentos" icon="▱" ws={ws} go={go} facts={[["Treinamentos registrados", ws.counts.trainings]]} text="O banco já tem sessões de treinamento e participantes com presença e resultado prático. A tela ainda não foi construída. Treinamentos entram na fase TREINAR, depois da padronização." />}
        {ws.loading && <div className="loading-bar" />}
      </div>
    </section>
  </main>;
}

function Dashboard({ site, ws, go }: { site: Site; ws: Workspace; go: (page: string) => void }) {
  const progress = diagnosticProgress(ws.responses);
  const current = ws.stages.find(s => s.status !== "completed") ?? ws.stages[0];
  const open = ws.tasks.filter(t => t.status !== "completed");
  const lastVisit = ws.visits[0];
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
  return <>
    <div className="welcome-row"><div><div className="eyebrow">{today} <span className="live-pill"><i /> PROJETO ATIVO</span></div><h1>Visão geral</h1><p className="muted">{site.name}{site.contract_start ? ` · Contrato de ${formatDate(site.contract_start)} a ${formatDate(site.contract_end)}` : ""}</p></div><button className="secondary" onClick={() => go("diagnostic")}>Abrir diagnóstico <span>↗</span></button></div>
    <div className="hero-card"><div className="hero-copy"><span className="hero-kicker">ETAPA ATUAL · {String(current?.stage_number ?? 1).padStart(2, "0")} / {String(ws.stages.length || 6).padStart(2, "0")}</span><h2>{current?.title ?? "Diagnóstico geral e organização da base"}</h2><p>{current?.stage_number === 1 || !current ? "Conheça a operação, reúna as informações existentes e registre o que precisa de confirmação." : current.objective}</p><button className="hero-button" onClick={() => go(ws.visits.length ? "diagnostic" : "visits")}>{ws.visits.length ? "Continuar diagnóstico" : "Registrar primeira visita"} <span>→</span></button></div><div className="hero-progress"><div className="ring" style={{ "--progress": `${progress.percent}%` } as CSSProperties}><div><strong>{progress.percent}%</strong><small>diagnóstico</small></div></div><span>{progress.answered} de {progress.total} tópicos registrados</span></div><div className="hero-grid" /></div>
    <div className="section-heading"><div><h3>Resumo da implantação</h3><p className="muted">Indicadores baseados somente nos registros.</p></div><button className="subtle-button" onClick={() => go("implementation")}>Ver etapas <span>→</span></button></div>
    <div className="metric-grid">
      <Metric label="VISITAS" value={`${ws.visits.length}`} icon="◷" detail={lastVisit ? `Última em ${formatDate(lastVisit.visit_date)}` : "Nenhuma registrada"} />
      <Metric label="TAREFAS EM ABERTO" value={`${open.length}`} icon="☑" detail={`${open.filter(t => !t.assignee_name).length} sem responsável`} />
      <Metric label="RESPOSTAS DO DIAGNÓSTICO" value={`${progress.answered} / ${progress.total}`} icon="◎" detail={`${progress.confirmed} confirmadas por evidência`} />
      <Metric label="DADOS FINANCEIROS" value="—" icon="∅" detail="Sem base confiável na etapa diagnóstica" />
    </div>
    <div className="lower-grid"><div className="panel"><div className="panel-head"><div><h3>Próximas tarefas</h3><p className="muted">Prioridade alta e prazos mais próximos.</p></div><button className="subtle-button" onClick={() => go("tasks")}>{open.length} abertas →</button></div>{open.slice().sort((a, b) => (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1) || (a.due_on ?? "9").localeCompare(b.due_on ?? "9")).slice(0, 5).map((task, i) => <div className="task-row" key={task.id}><span className="task-index">0{i + 1}</span><div><b>{task.title}</b><small>{task.assignee_name ?? "Sem responsável"}{task.due_on ? ` · até ${formatDate(task.due_on)}` : ""}</small></div></div>)}{!open.length && <div className="empty-state">Nenhuma tarefa em aberto.</div>}</div>
      <div className="panel flow-panel"><div className="panel-head"><div><h3>Fluxo de implantação</h3><p className="muted">Uma metodologia em quatro movimentos.</p></div><span className="flow-glyph">↗</span></div><div className="flow-track">{["LEVANTAR", "PADRONIZAR", "TREINAR", "ACOMPANHAR"].map((name, i) => <div className={`flow-step ${i === 0 ? "current" : ""}`} key={name}><span>{String(i + 1).padStart(2, "0")}</span><b>{name}</b>{i < 3 && <i />}</div>)}</div><div className="flow-note"><span className="note-icon">i</span><p>A primeira visita é exclusivamente diagnóstica. Pesagem, custos e padronização vêm depois. A frequência das visitas não é fixa.</p></div></div></div>
    <div className="footer-note">CMV Mestre <span>•</span> {site.name} <span>•</span> Cronograma sujeito a ajustes conforme dependências e necessidades da implantação.</div>
  </>;
}

function Implementation({ site, ws, go, notify }: { site: Site; ws: Workspace; go: (page: string) => void; notify: (m: string) => void }) {
  const progress = diagnosticProgress(ws.responses);
  return <><PageTitle eyebrow="METODOLOGIA · LEVANTAR → PADRONIZAR → TREINAR → ACOMPANHAR" title="Implantação guiada" subtitle="As etapas avançam com evidências e critérios, não apenas com o calendário." />
    <div className="stage-list">{ws.stages.map(stage => {
      const stageTasks = ws.tasks.filter(t => t.stage_id === stage.id);
      const done = stageTasks.filter(t => t.status === "completed").length;
      return <article className={`stage-card ${stage.stage_number === 1 ? "stage-current" : ""}`} key={stage.id}><div className="stage-number">{String(stage.stage_number).padStart(2, "0")}</div><div className="stage-body"><div className="stage-meta">ETAPA {stage.stage_number} <span>·</span> {new Date(`${stage.target_start}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div><h3>{stage.title}</h3><p>{stage.objective}</p><div className="stage-status"><span className={`status-dot ${stage.status}`} />{statusLabel[stage.status] ?? stage.status}{stageTasks.length > 0 && <span className="muted"> · {done}/{stageTasks.length} tarefas</span>}</div>{stage.stage_number === 1 && <button className="inline-link" onClick={() => go("diagnostic")}>Ver roteiro de diagnóstico <span>→</span></button>}</div><div className="stage-side"><span>{stage.stage_number === 1 ? `${progress.answered}/${progress.total} tópicos` : "Aguardando etapa anterior"}</span><div className="mini-bar"><i style={{ width: stage.stage_number === 1 ? `${progress.percent}%` : "0%" }} /></div></div></article>;
    })}</div>
    {ws.stages.length === 0 && <div className="panel empty-state">Nenhuma etapa encontrada para este estabelecimento.</div>}
    <ContextExport site={site} ws={ws} notify={notify} />
  </>;
}

function PendingModule({ title, icon, text, facts, go }: { title: string; icon: string; text: string; facts: [string, number][]; ws: Workspace; go: (page: string) => void }) {
  return <><PageTitle eyebrow="MÓDULO DO CMV MESTRE · AINDA NÃO OPERACIONAL" title={title} subtitle="Estrutura pronta no banco de dados; tela de lançamento pendente. Nenhum dado de demonstração é exibido." />
    <div className="panel module-empty"><div className="empty-orbit">{icon}</div><h2>Este módulo ainda não está ativo</h2><p>{text}</p><div className="facts">{facts.map(([label, value]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div><button className="secondary" onClick={() => go("home")}>Voltar à visão geral</button></div></>;
}

function Metric({ label, value, icon, detail }: { label: string; value: string; icon: string; detail: string }) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{detail}</small></div>; }
function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="muted">{subtitle}</p></div>; }
