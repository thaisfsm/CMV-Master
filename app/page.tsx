"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseReady } from "@/lib/supabase";
import { TechnicalCenter } from "@/components/TechnicalCenter";

type Stage = { id: string; stage_number: number; title: string; objective: string; status: string; target_start: string; target_end: string };
type Task = { id: string; title: string; description: string | null; status: string; stage_id: string | null };
type Response = { question_key: string; answer: string; evidence_status: string };
type Site = { id: string; organization_id: string; name: string; segment: string; management_names: string[]; contract_start: string; contract_end: string; contract_monthly_value: number };

const questions = [
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
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [answers, setAnswers] = useState<Response[]>([]);
  const [active, setActive] = useState("home");
  const [qIndex, setQIndex] = useState(0);
  const [answer, setAnswer] = useState("");
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
    const { data: sites, error } = await supabase.from("establishments").select("*").order("created_at").limit(1);
    if (error) { setMessage(error.message); setLoading(false); return; }
    const current = (sites?.[0] as Site | undefined) ?? null;
    setSite(current);
    if (current) {
      const [st, ts, ans] = await Promise.all([
        supabase.from("implementation_stages").select("*").eq("establishment_id", current.id).order("stage_number"),
        supabase.from("tasks").select("*").eq("establishment_id", current.id).order("created_at"),
        supabase.from("diagnostic_responses").select("question_key,answer,evidence_status").eq("establishment_id", current.id),
      ]);
      setStages((st.data ?? []) as Stage[]); setTasks((ts.data ?? []) as Task[]); setAnswers((ans.data ?? []) as Response[]);
    }
    setLoading(false);
  }

  useEffect(() => { if (session) void loadWorkspace(); }, [session]);

  const firstStage = stages[0];
  const firstTasks = tasks.filter(task => task.stage_id === firstStage?.id);
  const completeTasks = firstTasks.filter(task => task.status === "completed").length;
  const diagnosticProgress = Math.round((answers.length / questions.length) * 100);
  const answeredKeys = useMemo(() => new Set(answers.map(item => item.question_key)), [answers]);
  useEffect(() => {
    const saved = answers.find(item => item.question_key === questions[qIndex][0]);
    setAnswer(saved?.answer ?? "");
  }, [qIndex, answers]);

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

  async function saveAnswer(event: FormEvent) {
    event.preventDefault(); if (!supabase || !site || !firstStage || !answer.trim()) return;
    setLoading(true); setMessage("");
    const [key, question] = questions[qIndex];
    const { error } = await supabase.from("diagnostic_responses").upsert({
      organization_id: site.organization_id, establishment_id: site.id, question_key: key, question,
      answer: answer.trim(), evidence_status: "declared", updated_by: session?.user.id, updated_at: new Date().toISOString(),
    }, { onConflict: "establishment_id,question_key" });
    if (error) setMessage(error.message);
    else { setAnswer(""); await loadWorkspace(); if (qIndex < questions.length - 1) setQIndex(qIndex + 1); setMessage("Resposta salva como informação declarada."); }
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
      <div className="workspace-label">ESPAÇO DE TRABALHO</div><button className="site-picker"><span className="site-avatar">E</span><span><b>{site.name}</b><small>{site.segment}</small></span><span className="chevron">⌄</span></button>
      <div className="nav-title">ACOMPANHAMENTO</div><nav>{nav.map(item => <button key={item.id} className={`nav-item ${active === item.id ? "selected" : ""}`} onClick={() => setActive(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === "diagnostic" && answers.length < questions.length && <i className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="consultant-chip"><span className="spark">✳</span><span><b>Consultor CMV Mestre</b><small>Orientações por metodologia</small></span></div><button className="profile" onClick={logout}><span className="profile-avatar">{(session.user.email?.[0] ?? "C").toUpperCase()}</span><span><b>{session.user.email}</b><small>Responsável pela implantação</small></span><span className="more">⋯</span></button></div>
    </aside>
    <section className="main-area"><header className="topbar"><div className="breadcrumbs">CMV MESTRE <span>/</span> {activeNav?.label.toUpperCase()}</div><div className="top-actions"><span className="sync-state"><i/> Dados sincronizados</span><button className="icon-button" aria-label="Alternar tema" onClick={() => setDark(!dark)}>{dark ? "☼" : "◐"}</button><button className="icon-button" aria-label="Notificações">♧</button><span className="top-avatar">{(session.user.email?.[0] ?? "C").toUpperCase()}</span></div></header>
      <div className="content">{message && <div className="toast" onClick={() => setMessage("")}>{message}<button>×</button></div>}
      {active === "home" && <>
        <div className="welcome-row"><div><div className="eyebrow">SÁBADO, 31 DE OUTUBRO DE 2026 <span className="live-pill"><i/> PROJETO ATIVO</span></div><h1>Visão geral</h1><p className="muted">A implantação começa com um diagnóstico confiável da operação.</p></div><button className="secondary" onClick={() => setActive("diagnostic")}>Abrir diagnóstico <span>↗</span></button></div>
        <div className="hero-card"><div className="hero-copy"><span className="hero-kicker">ETAPA ATUAL · 01 / 06</span><h2>Diagnóstico geral<br/>e organização da base</h2><p>Conheça a operação, reúna as informações existentes e registre o que precisa de confirmação.</p><button className="hero-button" onClick={() => setActive("implementation")}>Continuar implantação <span>→</span></button></div><div className="hero-progress"><div className="ring" style={{"--progress": `${diagnosticProgress}%`} as CSSProperties}><div><strong>{diagnosticProgress}%</strong><small>diagnóstico</small></div></div><span>{answers.length} de {questions.length} tópicos registrados</span></div><div className="hero-grid"/></div>
        <div className="section-heading"><div><h3>Resumo da implantação</h3><p className="muted">Indicadores baseados nos registros disponíveis.</p></div><button className="subtle-button" onClick={() => setActive("implementation")}>Ver etapas <span>→</span></button></div>
        <div className="metric-grid"><Metric label="ETAPAS CONCLUÍDAS" value={`${stages.filter(stage => stage.status === "completed").length} / ${stages.length}`} icon="⌁" detail="Conclusão por critérios"/><Metric label="TAREFAS PENDENTES" value={`${firstTasks.length - completeTasks}`} icon="◷" detail="Na etapa de diagnóstico"/><Metric label="RESPOSTAS DO DIAGNÓSTICO" value={`${answers.length} / ${questions.length}`} icon="◎" detail="Informações declaradas"/><Metric label="DADOS FINANCEIROS" value="—" icon="∅" detail="Ainda não há base confiável"/></div>
        <div className="lower-grid"><div className="panel"><div className="panel-head"><div><h3>Próximas atividades</h3><p className="muted">Avance conforme as informações da operação.</p></div><span className="count-pill">{firstTasks.filter(t => t.status !== "completed").length} abertas</span></div>{firstTasks.slice(0,4).map((task,i)=><div className="task-row" key={task.id}><span className={`task-check ${task.status === "completed" ? "checked" : ""}`} onClick={()=>void updateTask(task)}>{task.status === "completed" ? "✓" : ""}</span><div><b>{task.title}</b><small>{task.description}</small></div><span className="task-index">0{i+1}</span></div>)}{!firstTasks.length&&<EmptyState text="As tarefas aparecem após a configuração do projeto."/>}</div>
          <div className="panel flow-panel"><div className="panel-head"><div><h3>Fluxo de implantação</h3><p className="muted">Uma metodologia em quatro movimentos.</p></div><span className="flow-glyph">↗</span></div><div className="flow-track">{["LEVANTAR","PADRONIZAR","TREINAR","ACOMPANHAR"].map((name,i)=><div className={`flow-step ${i===0?"current":""}`} key={name}><span>{String(i+1).padStart(2,"0")}</span><b>{name}</b>{i<3&&<i/>}</div>)}</div><div className="flow-note"><span className="note-icon">i</span><p>A primeira visita é exclusivamente diagnóstica. Pesagem, custos e padronização vêm depois.</p></div></div></div>
        <div className="footer-note">CMV Mestre <span>•</span> {site.name} <span>•</span> Cronograma sujeito a ajustes conforme dependências e necessidades da implantação.</div>
      </>}
      {active === "implementation" && <><PageTitle eyebrow="METODOLOGIA · LEVANTAR → PADRONIZAR → TREINAR → ACOMPANHAR" title="Implantação guiada" subtitle="As etapas avançam com evidências e critérios, não apenas com o calendário."/><div className="stage-list">{stages.map(stage=><article className={`stage-card ${stage.stage_number===1?"stage-current":""}`} key={stage.id}><div className="stage-number">{String(stage.stage_number).padStart(2,"0")}</div><div className="stage-body"><div className="stage-meta">ETAPA {stage.stage_number} <span>·</span> {new Date(`${stage.target_start}T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</div><h3>{stage.title}</h3><p>{stage.objective}</p><div className="stage-status"><span className={`status-dot ${stage.status}`}/>{statusLabel[stage.status] ?? stage.status}</div>{stage.stage_number===1&&<button className="inline-link" onClick={()=>setActive("diagnostic")}>Ver roteiro de diagnóstico <span>→</span></button>}</div><div className="stage-side"><span>{stage.stage_number===1?`${answers.length}/${questions.length} tópicos`:"Aguardando etapa anterior"}</span><div className="mini-bar"><i style={{width:stage.stage_number===1?`${diagnosticProgress}%`:"0%"}}/></div></div></article>)}</div></>}
      {active === "diagnostic" && <><PageTitle eyebrow="ETAPA 01 · VISITA DIAGNÓSTICA" title="Diagnóstico inicial" subtitle="Registre a realidade atual da operação. As respostas ficam marcadas como declaradas até que uma evidência as confirme."/><div className="diagnostic-layout"><div className="panel interview-panel"><div className="panel-head"><div><span className="step-label">ROTEIRO DE ENTREVISTA</span><h3>Pergunta {String(qIndex+1).padStart(2,"0")} <span className="muted">/ {questions.length}</span></h3></div><span className="count-pill">{answers.length} salvas</span></div><div className="question-card"><span className="question-mark">?</span><h2>{questions[qIndex][1]}</h2><p>Por que precisamos saber: entender como a rotina funciona hoje ajuda a organizar as próximas etapas sem presumir práticas que ainda não foram verificadas.</p></div><form onSubmit={saveAnswer}><label className="response-label">REGISTRO DA RESPOSTA<textarea value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Registre o que foi informado. Evite incluir dados pessoais desnecessários." rows={5}/></label><div className="response-foot"><span><i className="declared-dot"/> Será registrado como <b>declarado</b></span><button className="primary" disabled={loading||!answer.trim()}>{loading?"Salvando…":"Salvar e avançar →"}</button></div></form><div className="interview-controls"><button className="text-button" disabled={qIndex===0} onClick={()=>setQIndex(Math.max(0,qIndex-1))}>← Anterior</button><button className="text-button" onClick={()=>setQIndex(Math.min(questions.length-1,qIndex+1))}>Próxima pergunta →</button></div></div><aside className="panel checklist-panel"><span className="step-label">ROTEIRO DA VISITA</span><h3>O que investigar</h3><p className="muted">Sem pesagem, cálculo de custos ou padronização nesta fase.</p><div className="question-list">{questions.map(([key,text],i)=><button key={key} className={qIndex===i?"q-active":""} onClick={()=>setQIndex(i)}><span className={answeredKeys.has(key)?"q-done":"q-number"}>{answeredKeys.has(key)?"✓":String(i+1).padStart(2,"0")}</span>{text}<span>›</span></button>)}</div><div className="consent-note"><b>Registro de áudio</b><p>Antes de gravar, obtenha consentimento. Não registre clientes ou terceiros sem autorização. A transcrição automática não está habilitada.</p></div></aside></div></>}
      {active === "consultant" && <><PageTitle eyebrow="ORIENTAÇÃO BASEADA EM REGRAS" title="Consultor CMV Mestre" subtitle="Orientações determinísticas da metodologia. Nenhuma IA externa está conectada."/><div className="consult-grid"><div className="panel consult-main"><span className="spark large">✳</span><h2>Vamos começar pelo que é conhecido.</h2><p>O diagnóstico precisa descrever a operação como ela é relatada, separar fatos confirmados de declarações e apontar o que ainda precisa de evidência.</p><div className="advice-card"><span className="advice-tag">PRÓXIMA AÇÃO</span><b>{answers.length<questions.length?"Continue o roteiro da visita diagnóstica":"Revise as respostas e registre evidências disponíveis"}</b><p>{answers.length<questions.length?`${questions.length-answers.length} tópicos ainda não foram respondidos. Não solicite receitas, pesagens ou custos durante esta visita.`:"As respostas atuais permanecem como declaradas. Anexe documentos na etapa de evidências quando o armazenamento estiver configurado."}</p><button className="secondary" onClick={()=>setActive("diagnostic")}>Abrir diagnóstico →</button></div></div><div className="panel principles"><h3>Como as informações são tratadas</h3>{[["Confirmada","Verificada por evidência registrada."],["Declarada","Informada, ainda sem comprovação."],["Hipótese","Possibilidade a investigar."],["Pendente","Informação que ainda falta coletar."]].map(([name,desc])=><div className="principle-row" key={name}><span>{name}</span><p>{desc}</p></div>)}</div></div></>}
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
