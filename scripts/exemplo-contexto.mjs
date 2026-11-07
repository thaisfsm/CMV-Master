// Gera docs/pacote-analise/exemplo-contexto.json a partir do retrato da produção (tests/fixtures).
// Uso: node scripts/exemplo-contexto.mjs   (não acessa banco nem rede)
import { readFile, writeFile } from "node:fs/promises";
import { exportContext } from "../lib/context.mjs";

const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/producao-2026-11-07.json", import.meta.url), "utf8"));
const ctx = await exportContext({ ...fixture, diagnosticId: null, generatedAt: "2026-11-07T13:30:00.000Z" });
await writeFile(new URL("../docs/pacote-analise/exemplo-contexto.json", import.meta.url), JSON.stringify(ctx, null, 2) + "\n");
console.log(`assinatura ${ctx.contexto.assinatura}`);
