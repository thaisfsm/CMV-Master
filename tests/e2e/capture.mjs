// Teste ponta a ponta + capturas reais com Playwright.
// Roda contra o app local (next start) ligado a um Supabase LOCAL e isolado.
//   E2E_BASE_URL=http://127.0.0.1:3000 E2E_SUPABASE_URL=http://127.0.0.1:54321 node tests/e2e/capture.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

// Playwright não é dependência do app (não pesa no build da Vercel). Instale à parte: npm i -g playwright
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const supabaseUrl = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
if (!/127\.0\.0\.1|localhost/.test(base + supabaseUrl)) throw new Error("E2E só roda localmente, com dados de teste isolados.");
const day = process.env.E2E_DATE ?? new Date().toISOString().slice(0, 10);
const outDir = path.resolve(`auditoria/capturas/${day}`);
fs.mkdirSync(outDir, { recursive: true });
const email = `consultora.teste+${Date.now().toString(36)}@local.test`;
const password = "teste-local-123";
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); console.log(`ok - ${name}`); }
  catch (error) { results.push({ name, ok: false, error: String(error.message ?? error) }); console.log(`not ok - ${name}\n  ${error.message}`); }
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark", locale: "pt-BR", timezoneId: "America/Sao_Paulo", acceptDownloads: true });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
context.setDefaultTimeout(10000);
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("dialog", d => d.accept());

const shot = async (n, name, p = page, full = true) => {
  await p.waitForTimeout(350);
  // Captura de página inteira: elementos fixos (menu lateral, barra superior) seriam repetidos no meio da imagem.
  if (full) await p.addStyleTag({ content: ".sidebar{position:absolute!important;bottom:auto!important;min-height:100%}.topbar{position:relative!important}.toast{display:none!important}" });
  const file = path.join(outDir, `${String(n).padStart(2, "0")}-${name}.png`);
  await p.screenshot({ path: file, fullPage: full });
  if (full) await p.evaluate(() => document.querySelectorAll("style").forEach(el => { if (el.textContent?.includes("position:absolute!important")) el.remove(); }));
  return file;
};
const nav = async label => { await page.getByRole("button", { name: label, exact: true }).first().click(); await page.waitForTimeout(400); };
const toast = async re => { await page.locator(".toast").filter({ hasText: re }).waitFor({ timeout: 8000 }); await page.locator(".toast").click(); };

await step("login: tela de acesso", async () => {
  await page.goto(base);
  await page.getByRole("heading", { name: "Acesse sua conta" }).waitFor();
  await shot(1, "login");
});

await step("autenticação: senha errada mostra mensagem em português", async () => {
  await page.getByLabel("E-mail").fill("ninguem@local.test");
  await page.getByLabel("Senha").fill("senha-errada-1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("E-mail ou senha incorretos.").waitFor();
});

await step("autenticação: criar conta de teste e preparar a Pizzaria Enrico", async () => {
  await page.getByRole("button", { name: "Primeiro acesso? Criar conta" }).click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Criar projeto Enrico" }).click();
  await page.getByRole("heading", { name: "Visão geral" }).waitFor();
  assert.ok(await page.getByText("Pizzaria Enrico").first().isVisible());
  assert.ok(await page.getByText("Contrato de 19/10/2026 a 18/04/2027").isVisible());
});

await step("sessão persiste após recarregar a página", async () => {
  await page.reload();
  await page.getByRole("heading", { name: "Visão geral" }).waitFor({ timeout: 10000 });
});

await step("visitas: registrar visita diagnóstica", async () => {
  await nav("Visitas");
  await page.getByLabel("Data").fill("2026-11-05");
  await page.getByLabel("Participantes").fill("Consultora (teste), Gestão (teste)");
  await page.getByLabel("Objetivo da visita").fill("Primeira visita diagnóstica — dados de teste");
  await page.getByLabel("Observações").fill("Registro de teste para validar o fluxo. Não representa a operação real.");
  await page.getByLabel(/Próximos passos/).fill("Solicitar cardápio vigente\nAgendar observação no horário de produção");
  await page.getByRole("button", { name: "Salvar visita" }).click();
  await toast(/Visita registrada/);
  await page.getByRole("heading", { name: /Visita de 05\/11\/2026/ }).waitFor();
});

await step("diagnóstico: salvar, classificar, editar e manter histórico", async () => {
  await nav("Diagnóstico");
  await page.getByTestId("answer").fill("[Teste] Gestão relatada como compartilhada entre os sócios.");
  await page.locator("label.chip", { hasText: "Adequado" }).click();
  await page.getByRole("button", { name: "Salvar e avançar →" }).click();
  await toast(/Resposta salva/);
  await page.getByText("PERGUNTA 02 / 15").waitFor();
  await page.getByTestId("answer").fill("[Teste] Expectativa declarada: ter controle de custos.");
  await page.getByRole("button", { name: "Salvar e avançar →" }).click();
  await toast(/Resposta salva/);
  await page.getByTestId("answer").fill("[Teste] Dificuldade relatada: variação nas compras.");
  await page.locator("label.chip", { hasText: "Atenção" }).click();
  await page.locator("label.chip", { hasText: "Hipótese" }).click();
  await page.getByRole("button", { name: "Salvar e avançar →" }).click();
  await toast(/Resposta salva/);
  // Pergunta de compras: crítica e declarada
  await page.locator(".topic-index button", { hasText: "Como as compras são solicitadas" }).click();
  await page.getByTestId("answer").fill("[Teste] Compras feitas sem pedido formal, segundo relato.");
  await page.locator("label.chip", { hasText: "Crítico" }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await toast(/Resposta salva/);
  // Edição
  await page.getByTestId("answer").fill("[Teste] Compras feitas sem pedido formal; notas guardadas no escritório, segundo relato.");
  await page.getByLabel(/Observações da consultora/).fill("Confirmar com notas fiscais");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await toast(/Resposta atualizada/);
  await page.getByText("Histórico desta resposta (2 versões)").waitFor();
});

await step("evidências: upload de foto com armazenamento privado e abertura por link assinado", async () => {
  await page.getByTestId("evidence-input").setInputFiles(path.resolve("public/logo-cmv-mestre.png"));
  await toast(/Arquivo enviado/);
  await page.locator(".evidence-item", { hasText: "logo-cmv-mestre.png" }).waitFor();
  const [popup] = await Promise.all([context.waitForEvent("page"), page.locator(".evidence-item").getByRole("button", { name: "Abrir" }).first().click()]);
  await popup.waitForURL(/\/storage\/v1\/object\/sign\/cmv-evidence\//, { timeout: 10000 });
  await popup.close();
  await page.locator(".evidence-item").scrollIntoViewIfNeeded();
  await shot(4, "diagnostico");
});

await step("persistência: respostas continuam após recarregar", async () => {
  await page.reload();
  await nav("Diagnóstico");
  await page.getByText("4/15").first().waitFor();
  await page.locator(".topic-index button", { hasText: "Como as compras são solicitadas" }).click();
  await page.getByText(/PERGUNTA 08 \/ 15/).waitFor();
  assert.match(await page.getByTestId("answer").inputValue(), /notas guardadas no escritório/);
  await page.getByText("4/15").first().waitFor();
});

await step("tarefas: criar com responsável, editar e concluir", async () => {
  await nav("Tarefas");
  await page.getByRole("button", { name: "Nova tarefa" }).click();
  await page.getByLabel("Título").fill("[Teste] Separar notas fiscais do último mês");
  await page.getByLabel("Responsável").fill("Gestão (teste)");
  await page.getByLabel("Prazo").fill("2026-11-12");
  await page.getByLabel("Prioridade").selectOption("high");
  await page.getByRole("button", { name: "Salvar tarefa" }).click();
  await toast(/Tarefa criada/);
  const line = page.locator(".task-line", { hasText: "Separar notas fiscais" });
  await line.getByRole("button", { name: "Editar" }).click();
  await page.locator("form").getByLabel("Status").selectOption("in_progress");
  await page.getByRole("button", { name: "Salvar tarefa" }).click();
  await toast(/Tarefa atualizada/);
  const first = page.locator(".task-line", { hasText: "Entrevistar a gestão" });
  await first.getByRole("button", { name: "Concluir tarefa" }).click();
  await toast(/Tarefa concluída/);
  await page.getByRole("button", { name: /Concluídas/ }).click();
  await page.locator(".task-line.done", { hasText: "Entrevistar a gestão" }).waitFor();
  await page.getByRole("button", { name: /Em aberto/ }).click();
  await shot(11, "tarefas");
});

await step("dashboard reflete os registros", async () => {
  await nav("Visão geral");
  await page.getByText("4 de 15 tópicos registrados").waitFor();
  await shot(2, "dashboard");
});

await step("implantação guiada", async () => { await nav("Implantação"); await page.getByRole("heading", { name: "Implantação guiada" }).waitFor(); await shot(3, "implantacao"); });

await step("consultor: orientação baseada nos dados, sem cálculo sem base", async () => {
  await nav("Consultor CMV");
  await page.getByText(/Crítico: Compras e recebimento/).waitFor();
  await page.getByText(/não confirmada; trate como relato/).first().waitFor();
  await page.getByText("CMV real do período").waitFor();
  assert.ok(await page.getByText("Indisponível").first().isVisible());
  await shot(5, "consultor-cmv");
});

await step("central técnica", async () => { await nav("Central técnica"); await page.getByRole("heading", { name: "Central técnica" }).waitFor(); await shot(6, "central-tecnica"); });
await step("compras e estoque (pendente, sem dados fictícios)", async () => { await nav("Compras e estoque"); await page.getByText("Este módulo ainda não está ativo").waitFor(); await shot(7, "compras-estoque-pendente"); });
await step("perdas (pendente)", async () => { await nav("Perdas"); await page.getByText("Este módulo ainda não está ativo").waitFor(); await shot(8, "perdas-pendente"); });
await step("treinamentos (pendente)", async () => { await nav("Treinamentos"); await page.getByText("Este módulo ainda não está ativo").waitFor(); await shot(9, "treinamentos-pendente"); });

await step("relatório da visita com pendências e próximos passos", async () => {
  await nav("Relatórios");
  const report = page.getByTestId("visit-report");
  await report.waitFor();
  await report.getByText("Solicitar cardápio vigente").waitFor();
  await report.getByText(/Tópico não registrado/).first().waitFor();
  await report.getByText("[Teste] Separar notas fiscais do último mês").waitFor();
  await report.getByText("logo-cmv-mestre.png", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Copiar resumo" }).click();
  await toast(/Resumo copiado/);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /Próximos passos:\n- Solicitar cardápio vigente/);
  await shot(10, "relatorios");
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: path.join(outDir, "relatorio-visita.pdf"), format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });
});

await step("visitas: histórico e concluir visita", async () => {
  await nav("Visitas");
  await page.getByRole("button", { name: "Concluir visita" }).click();
  await toast(/Visita concluída/);
  await shot(12, "visitas");
});

await step("tema claro", async () => {
  await nav("Visão geral");
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await shot(13, "dashboard-tema-claro", page, false);
  await nav("Diagnóstico");
  await shot(14, "diagnostico-tema-claro", page, false);
  await page.reload();
  await page.locator("main.app.light").waitFor();
  await page.getByRole("button", { name: "Alternar tema" }).click();
});

await step("responsivo: celular", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark", locale: "pt-BR" });
  const m = await phone.newPage();
  m.on("pageerror", e => errors.push(e.message));
  await m.goto(base);
  await m.getByLabel("E-mail").fill(email);
  await m.getByLabel("Senha").fill(password);
  await m.getByRole("button", { name: "Entrar" }).click();
  await m.getByRole("heading", { name: "Visão geral" }).waitFor();
  const overflow = async () => m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  for (const [id, label] of [["home", "dashboard"], ["diagnostic", "diagnostico"], ["tasks", "tarefas"], ["reports", "relatorios"], ["visits", "visitas"]]) {
    await m.evaluate(h => { window.location.hash = h; }, id);
    await m.waitForTimeout(500);
    const extra = await overflow();
    assert.ok(extra <= 1, `rolagem horizontal de ${extra}px em ${id}`);
    await shot(`m${["home", "diagnostic", "tasks", "reports", "visits"].indexOf(id) + 1}`, `celular-${label}`, m, false);
  }
  await phone.close();
});

await step("tablet", async () => {
  const tab = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, colorScheme: "dark", locale: "pt-BR" });
  const t = await tab.newPage();
  await t.goto(base);
  await t.getByLabel("E-mail").fill(email);
  await t.getByLabel("Senha").fill(password);
  await t.getByRole("button", { name: "Entrar" }).click();
  await t.getByRole("heading", { name: "Visão geral" }).waitFor();
  await t.evaluate(() => { window.location.hash = "diagnostic"; });
  await t.waitForTimeout(500);
  assert.ok(await t.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1);
  await shot("t1", "tablet-diagnostico", t, false);
  await tab.close();
});

await step("sair encerra a sessão", async () => {
  await page.locator("button.profile").click();
  await page.getByRole("heading", { name: "Acesse sua conta" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Acesse sua conta" }).waitFor();
});

await step("sem erros de JavaScript na página", async () => { assert.deepEqual(errors, []); });

await browser.close();
fs.writeFileSync(path.join(outDir, "resultado-e2e.json"), JSON.stringify({ date: day, base, results }, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\n# pass ${results.length - failed.length}\n# fail ${failed.length}`);
process.exit(failed.length ? 1 : 0);
