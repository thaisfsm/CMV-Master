"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseReady } from "@/lib/supabase";
import { TechnicalCenter } from "@/components/TechnicalCenter";
import { DiagnosticWorkspace, diagnosticQuestions } from "@/components/DiagnosticWorkspace";

type Stage = { id: string; stage_number: number; title: string; objective: string; status: string; target_start: string; target_end: string };
type Task = { id: string; title: string; description: string | null; status: string; stage_id: string | null };
type Response = { question_key: string; answer: string; evidence_status: string };
type Site = { id: string; organization_id: string; name: string; segment: string; management_names: string[]; contract_start: string; contract_end: string; contract_monthly_value: number };

const nav = [
  { id: "home", label: "Visão geral", icon: "◫" },
  { id: "implementation", label: "Implantação", icon: "⌁" },
  { id: "diagnostic", label: "Diagnóstico", icon: "◎" },
  { id: "consultant", label: "Consultor CMV", icon: "✳" },
  { id: "technical", label: "Central técnica", icon: "⌗" },
  { id: "inventory", label: "Compras e estoque", icon: "▤" },
  { id: "losses", label: "Perdas", icon: "↘" },
  { id: "training", label: "Treinamentos", icon: "▱" },
  { id: "reports", label: "Relatórios", icon: "▧" },
];

const statusLabel: Record<string, string> = { not_started: "Não iniciado", in_progress: "Em andamento", awaiting_information: "Aguardando informação", awaiting_approval: "Aguardando aprovação", completed: "Concluído", blocked: "Bloqueado" };

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [site, setSite] = useState<Site | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [catalogCounts, setCatalogCounts] = useState({ products: null as number | null, ingredients: null as number | null, recipes: null as number | null, trainings: null as number | null });
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [answers, setAnswers] = useState<Response[]>([]);
  const [active, setActive] = useState("home");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(saved);
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, current) => setSession(current));
    return () => data.subscription.unsubscribe();
  }, []);

  async function loadWorkspace() {
    if (!supabase) return;
    setLoading(true);
    const { data: siteRows, error } = await supabase.from("establishments").select("*").order("created_at");
    if (error) { setMessage(error.message); setLoading(false); return; }
    const available = (siteRows ?? []) as Site[];
    setSites(available);
    const current = available.find(row => row.id === selectedSiteId) ?? available[0] ?? null;
    setSite(current);
    if (current) {
      const [st, ts, ans, products, ingredients, recipes, trainings] = await Promise.all([
        supabase.from("implementation_stages").select("*").eq("establishment_id", current.id).order("stage_number"),
        supabase.from("tasks").select("*").eq("establishment_id", current.id).order("created_at"),
        supabase.from("diagnostic_responses").select("question_key,answer,evidence_status").eq("establishment_id", current.id),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("establishment_id", current.id),
        supabase.from("ingredients").select("id", { count: "exact", head: true }).eq("establishment_id", current.id),
        supabase.from("recipes").select("id", { count: "exact", head: true }).eq("establishment_id", current.id),
        supabase.from("training_sessions").select("id", { count: "exact", head: true }).eq("establishment_id", current.id),
      ]);
      setStages((st.data ?? []) as Stage[]); setTasks((ts.data ?? []) as Task[]); setAnswers((ans.data ?? []) as Response[]);
      setCatalogCounts({ products: products.count, ingredients: ingredients.count, recipes: recipes.count, trainings: trainings.count });
    }
    setLoading(false);
  }

  useEffect(() => { if (session) void loadWorkspace(); }, [session, selectedSiteId]);

  const firstStage = stages[0];
  const firstTasks = tasks.filter(task => task.stage_id === firstStage?.id);
  const completeTasks = firstTasks.filter(task => task.status === "completed").length;
  const diagnosticProgress = Math.round((answers.length / diagnosticQuestions.length) * 100);
  async function authenticate(event: FormEvent) {
    event.preventDefault(); if (!supabase) return;
    setLoading(true); setMessage("");
    const result = authMode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session) setMessage("Confira seu e-mail para confirmar o cadastro. Depois, entre para configurar o espaço de trabalho.");
    setLoading(false);
  }

  async function startWorkspace() {
    if (!supabase) return;
    setLoading(true); setMessage("");
    const { error } = await supabase.rpc("start_initial_workspace", { owner_name: session?.user.email ?? "" });
    if (error) setMessage(error.message); else await loadWorkspace();
    setLoading(false);
  }

  async function updateTask(task: Task) {
    if (!supabase) return;
    const nextStatus = task.status === "completed" ? "not_started" : "completed";
    const { error } = await supabase.from("tasks").update({ status: nextStatus, completed_at: nextStatus === "completed" ? new Date().toISOString() : null }).eq("id", task.id);
    if (error) setMessage(error.message); else await loadWorkspace();
  }

  async function logout() { if (supabase) await supabase.auth.signOut(); setSite(null); setStages([]); setTasks([]); }
  const activeNav = nav.find(item => item.id === active);

  if (!ready) return <div className="boot"><span className="loader"/>Carregando CMV Mestre</div>;

  if (!supabaseReady) return <div className="setup-shell"><div className="setup-card"><BrandLockup variant="card"/><div className="eyebrow">CONFIGURAÇÃO NECESSÁRIA</div><h1>Conecte o banco de dados</h1><p>Configure um projeto Supabase e preencha as duas variáveis públicas de ambiente para habilitar login e persistência segura.</p><pre>NEXT_PUBLIC_SUPABASE_URL={"\n"}NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=</pre><p className="muted">O app não grava dados de operação no navegador.</p></div></div>;

  if (!session) return <div className="auth-screen"><div className="auth-brand"><BrandLockup/></div><form className="auth-card" onSubmit={authenticate}><span className="eyebrow">ESPAÇO DE TRABALHO</span><h1>{authMode === "login" ? "Acesse sua conta" : "Crie seu acesso"}</h1><p className="muted">Dados protegidos por autenticação e isolamento por empresa.</p><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/></label><label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete={authMode === "login" ? "current-password" : "new-password"}/></label><button className="primary full" disabled={loading}>{loading ? "Aguarde…" : authMode === "login" ? "Entrar" : "Criar conta"}</button><button className="text-button" type="button" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setMessage(""); }}>{authMode === "login" ? "Primeiro acesso? Criar conta" : "Já tem acesso? Entrar"}</button>{message && <div className="notice">{message}</div>}</form></div>;

  if (!site) return <div className="setup-shell"><div className="setup-card"><BrandLockup variant="card"/><div className="eyebrow">PRIMEIRO ACESSO</div><h1>Prepare o espaço de trabalho</h1><p>Será criado o cadastro inicial da Pizzaria Enrico com os dados informados no projeto e as seis etapas da implantação. Informações operacionais ainda serão coletadas no diagnóstico.</p><button className="primary" disabled={loading} onClick={startWorkspace}>{loading ? "Configurando…" : "Criar projeto Enrico"}</button><button className="text-button" onClick={logout}>Sair</button>{message && <div className="notice">{message}</div>}</div></div>;

  return <main className={dark ? "app dark" : "app light"}>
    <aside className="sidebar"><BrandLockup variant="compact"/>
      <div className="workspace-label">ESPAÇO DE TRABALHO</div><label className="site-picker"><span className="site-avatar">{site.name.slice(0,1)}</span><span><b>{site.name}</b><small>{site.segment}</small></span><select className="site-picker-select" aria-label="Selecionar estabelecimento" value={site.id} onChange={event => setSelectedSiteId(event.target.value)}>{sites.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="nav-title">ACOMPANHAMENTO</div><nav>{nav.map(item => <button key={item.id} className={`nav-item ${active === item.id ? "selected" : ""}`} onClick={() => setActive(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === "diagnostic" && answers.length < diagnosticQuestions.length && <i className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="consultant-chip"><span className="spark">✳</span><span><b>Consultor CMV Mestre</b><small>Orientações por metodologia</small></span></div><button className="profile" onClick={logout}><span className="profile-avatar">{(session.user.email?.[0] ?? "C").toUpperCase()}</span><span><b>{session.user.email}</b><small>Responsável pela implantação</small></span><span className="more">⋯</span></button></div>
    </aside>
    <section className="main-area"><header className="topbar"><div className="breadcrumbs">CMV MESTRE <span>/</span> {activeNav?.label.toUpperCase()}</div><div className="top-actions"><span className="sync-state"><i/> CMV Mestre</span><button className="icon-button" aria-label="Alternar tema" onClick={() => setDark(!dark)}>{dark ? "☼" : "◐"}</button><button className="icon-button" aria-label="Notificações">♧</button><span className="top-avatar">{(session.user.email?.[0] ?? "C").toUpperCase()}</span></div></header>
      <div className="content">{message && <div className="toast" onClick={() => setMessage("")}>{message}<button>×</button></div>}
      {active === "home" && <>
        <div className="welcome-row"><div><div className="eyebrow">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase()} <span className="live-pill"><i/> PROJETO ATIVO</span></div><h1>Visão geral</h1><p className="muted">A implantação começa com um diagnóstico confiável da operação.</p></div><button className="secondary" onClick={() => setActive("diagnostic")}>Abrir diagnóstico <span>↗</span></button></div>
        <div className="hero-card"><div className="hero-copy"><span className="hero-kicker">ETAPA ATUAL · 01 / 06</span><h2>Diagnóstico geral<br/>e organização da base</h2><p>Conheça a operação, reúna as informações existentes e registre o que precisa de confirmação.</p><button className="hero-button" onClick={() => setActive("implementation")}>Continuar implantação <span>→</span></button></div><div className="hero-progress"><div className="ring" style={{"--progress": `${diagnosticProgress}%`} as CSSProperties}><div><strong>{diagnosticProgress}%</strong><small>diagnóstico</small></div></div><span>{answers.length} de {diagnosticQuestions.length} tópicos registrados</span></div><div className="hero-grid"/></div>
        <div className="section-heading"><div><h3>Resumo da implantação</h3><p className="muted">Indicadores baseados nos registros disponíveis.</p></div><button className="subtle-button" onClick={() => setActive("implementation")}>Ver etapas <span>→</span></button></div>
        <div className="metric-grid"><Metric label="ETAPAS CONCLUÍDAS" value={`${stages.filter(stage => stage.status === "completed").length} / ${stages.length}`} icon="⌁" detail="Conclusão por critérios"/><Metric label="TAREFAS PENDENTES" value={`${firstTasks.length - completeTasks}`} icon="◷" detail="Na etapa de diagnóstico"/><Metric label="RESPOSTAS DO DIAGNÓSTICO" value={`${answers.length} / ${diagnosticQuestions.length}`} icon="◎" detail="Informações declaradas"/><Metric label="PRODUTOS" value={catalogCounts.products === null ? "—" : String(catalogCounts.products)} icon="◈" detail="Cadastros reais"/><Metric label="INGREDIENTES" value={catalogCounts.ingredients === null ? "—" : String(catalogCounts.ingredients)} icon="⌗" detail="Cadastros reais"/><Metric label="FICHAS TÉCNICAS" value={catalogCounts.recipes === null ? "—" : String(catalogCounts.recipes)} icon="▤" detail="Receitas cadastradas"/><Metric label="TREINAMENTOS" value={catalogCounts.trainings === null ? "—" : String(catalogCounts.trainings)} icon="▱" detail="Sessões cadastradas"/><Metric label="DADOS FINANCEIROS" value="—" icon="∅" detail="Sem base confiável ainda"/></div>
        <div className="lower-grid"><div className="panel"><div className="panel-head"><div><h3>Próximas atividades</h3><p className="muted">Avance conforme as informações da operação.</p></div><span className="count-pill">{firstTasks.filter(t => t.status !== "completed").length} abertas</span></div>{firstTasks.slice(0,4).map((task,i)=><div className="task-row" key={task.id}><span className={`task-check ${task.status === "completed" ? "checked" : ""}`} onClick={()=>void updateTask(task)}>{task.status === "completed" ? "✓" : ""}</span><div><b>{task.title}</b><small>{task.description}</small></div><span className="task-index">0{i+1}</span></div>)}{!firstTasks.length&&<EmptyState text="As tarefas aparecem após a configuração do projeto."/>}</div>
          <div className="panel flow-panel"><div className="panel-head"><div><h3>Fluxo de implantação</h3><p className="muted">Uma metodologia em quatro movimentos.</p></div><span className="flow-glyph">↗</span></div><div className="flow-track">{["LEVANTAR","PADRONIZAR","TREINAR","ACOMPANHAR"].map((name,i)=><div className={`flow-step ${i===0?"current":""}`} key={name}><span>{String(i+1).padStart(2,"0")}</span><b>{name}</b>{i<3&&<i/>}</div>)}</div><div className="flow-note"><span className="note-icon">i</span><p>A primeira visita é exclusivamente diagnóstica. Pesagem, custos e padronização vêm depois.</p></div></div></div>
        <div className="footer-note">CMV Mestre <span>•</span> {site.name} <span>•</span> Cronograma sujeito a ajustes conforme dependências e necessidades da implantação.</div>
      </>}
      {active === "implementation" && <><PageTitle eyebrow="METODOLOGIA · LEVANTAR → PADRONIZAR → TREINAR → ACOMPANHAR" title="Implantação guiada" subtitle="As etapas avançam com evidências e critérios, não apenas com o calendário."/><div className="stage-list">{stages.map(stage=><article className={`stage-card ${stage.stage_number===1?"stage-current":""}`} key={stage.id}><div className="stage-number">{String(stage.stage_number).padStart(2,"0")}</div><div className="stage-body"><div className="stage-meta">ETAPA {stage.stage_number} <span>·</span> {new Date(`${stage.target_start}T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</div><h3>{stage.title}</h3><p>{stage.objective}</p><div className="stage-status"><span className={`status-dot ${stage.status}`}/>{statusLabel[stage.status] ?? stage.status}</div>{stage.stage_number===1&&<button className="inline-link" onClick={()=>setActive("diagnostic")}>Ver roteiro de diagnóstico <span>→</span></button>}</div><div className="stage-side"><span>{stage.stage_number===1?`${answers.length}/${diagnosticQuestions.length} tópicos`:"Aguardando etapa anterior"}</span><div className="mini-bar"><i style={{width:stage.stage_number===1?`${diagnosticProgress}%`:"0%"}}/></div></div></article>)}</div></>}
      {active === "diagnostic" && <DiagnosticWorkspace site={site} userId={session.user.id} notify={setMessage}/>}
      {active === "consultant" && <><PageTitle eyebrow="ORIENTAÇÃO BASEADA EM REGRAS" title="Consultor CMV Mestre" subtitle="Orientações determinísticas da metodologia. Nenhuma IA externa está conectada."/><div className="consult-grid"><div className="panel consult-main"><span className="spark large">✳</span><h2>Vamos começar pelo que é conhecido.</h2><p>O diagnóstico precisa descrever a operação como ela é relatada, separar fatos confirmados de declarações e apontar o que ainda precisa de evidência.</p><div className="advice-card"><span className="advice-tag">PRÓXIMA AÇÃO</span><b>{answers.length<diagnosticQuestions.length?"Continue o roteiro da visita diagnóstica":"Revise as respostas e registre evidências disponíveis"}</b><p>{answers.length<diagnosticQuestions.length?`${diagnosticQuestions.length-answers.length} tópicos ainda não foram respondidos. Não solicite receitas, pesagens ou custos durante esta visita.`:"As respostas atuais permanecem como declaradas. Anexe documentos na etapa de evidências quando o armazenamento estiver configurado."}</p><button className="secondary" onClick={()=>setActive("diagnostic")}>Abrir diagnóstico →</button></div></div><div className="panel principles"><h3>Como as informações são tratadas</h3>{[["Confirmada","Verificada por evidência registrada."],["Declarada","Informada, ainda sem comprovação."],["Hipótese","Possibilidade a investigar."],["Pendente","Informação que ainda falta coletar."]].map(([name,desc])=><div className="principle-row" key={name}><span>{name}</span><p>{desc}</p></div>)}</div></div></>}
      {active === "technical" && <TechnicalCenter site={site} notify={setMessage}/>}
      {!["home","implementation","diagnostic","consultant","technical"].includes(active)&&<><PageTitle eyebrow="MÓDULO DO CMV MESTRE" title={activeNav?.label ?? "Módulo"} subtitle="A estrutura do módulo está planejada; esta área ainda não está conectada ao banco de dados."/><div className="panel module-empty"><div className="empty-orbit">{activeNav?.icon}</div><h2>Este módulo ainda não está ativo</h2><p>Não há registros exibidos nem dados de demonstração. O esquema inicial do banco já contempla organizações, produtos, fornecedores, ingredientes, receitas, tarefas e auditoria. As telas de gestão e armazenamento de evidências ainda precisam ser concluídas.</p><button className="secondary" onClick={()=>setActive("home")}>Voltar à visão geral</button></div></>}
      {loading&&<div className="loading-bar"/>}
      </div>
    </section>
  </main>;
}

function Metric({label,value,icon,detail}:{label:string;value:string;icon:string;detail:string}) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{detail}</small></div>; }
function PageTitle({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle:string}) { return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="muted">{subtitle}</p></div>; }
function EmptyState({text}:{text:string}) { return <div className="empty-state">{text}</div>; }
