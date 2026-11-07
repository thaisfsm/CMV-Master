// Valida um pacote de análise no computador, sem banco e sem rede.
// Uso: npm run validar-pacote -- <pacote.json> [--contexto <contexto.json>]
import { readFile } from "node:fs/promises";
import { checkPackageFile } from "../lib/package.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--contexto");
const ci = args.indexOf("--contexto");
if (!file) { console.error("Uso: npm run validar-pacote -- <pacote.json> [--contexto <contexto.json>]"); process.exit(2); }
const context = ci >= 0 ? JSON.parse(await readFile(args[ci + 1], "utf8")) : null;
const result = await checkPackageFile(await readFile(file, "utf8"), { context });
for (const e of result.errors) console.log(`ERRO   ${e.path}: ${e.message}`);
for (const w of result.warnings) console.log(`AVISO  ${w.path}: ${w.message}`);
if (result.alreadyImported) console.log("Este pacote já foi importado com o mesmo conteúdo; nada mudaria.");
if (result.plan) console.log(`Criar: ${result.plan.create.length} · Atualizar: ${result.plan.update.length} · Não citados (ficam como estão): ${result.plan.notCited.length}`);
console.log(result.ok ? `VÁLIDO · sha256 ${result.payloadSha256}` : `INVÁLIDO · ${result.errors.length} erro(s)`);
process.exit(result.ok ? 0 : 1);
