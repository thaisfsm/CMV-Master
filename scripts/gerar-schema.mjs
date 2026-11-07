// Gera docs/pacote-analise/pacote-analise.schema.json a partir de lib/package-schema.mjs.
// Uso: node scripts/gerar-schema.mjs
import { writeFile } from "node:fs/promises";
import { buildSchema } from "../lib/package-schema.mjs";

await writeFile(new URL("../docs/pacote-analise/pacote-analise.schema.json", import.meta.url), JSON.stringify(buildSchema(), null, 2) + "\n");
console.log("esquema gerado");
