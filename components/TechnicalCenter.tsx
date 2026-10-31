"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Site = { id: string; organization_id: string };
type Tab = "products" | "ingredients" | "suppliers" | "recipes";
const tabs: { id: Tab; label: string; title: string }[] = [
  { id: "products", label: "Produtos", title: "Produto" },
  { id: "ingredients", label: "Ingredientes", title: "Ingrediente" },
  { id: "suppliers", label: "Fornecedores", title: "Fornecedor" },
  { id: "recipes", label: "Receitas", title: "Preparação ou receita" },
];

export function TechnicalCenter({ site, notify }: { site: Site; notify: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>("products");
  const [rows, setRows] = useState<Record<Tab, Record<string, unknown>[]>>({ products: [], ingredients: [], suppliers: [], recipes: [] });
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [usageUnit, setUsageUnit] = useState("");
  const [price, setPrice] = useState("");
  const [contact, setContact] = useState("");

  async function refresh() {
    if (!supabase) return;
    const [products, ingredients, suppliers, recipes] = await Promise.all([
      supabase.from("products").select("id,name,category,status,created_at").eq("establishment_id", site.id).order("name"),
      supabase.from("ingredients").select("id,name,purchase_unit,usage_unit,current_price,price_updated_at").eq("establishment_id", site.id).order("name"),
      supabase.from("suppliers").select("id,name,contact,created_at").eq("establishment_id", site.id).order("name"),
      supabase.from("recipes").select("id,name,yield_quantity,yield_unit,approval_status,version").eq("establishment_id", site.id).order("name"),
    ]);
    const error = products.error ?? ingredients.error ?? suppliers.error ?? recipes.error;
    if (error) notify(error.message);
    setRows({ products: products.data ?? [], ingredients: ingredients.data ?? [], suppliers: suppliers.data ?? [], recipes: recipes.data ?? [] });
  }

  useEffect(() => { void refresh(); }, [site.id]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!supabase || !name.trim()) return;
    setBusy(true);
    let payload: Record<string, unknown> = { organization_id: site.organization_id, establishment_id: site.id, name: name.trim() };
    if (tab === "products") payload = { ...payload, category: category.trim() || null };
    if (tab === "ingredients") payload = { ...payload, purchase_unit: unit.trim() || null, usage_unit: usageUnit.trim() || null, current_price: price === "" ? null : Number(price), price_updated_at: price === "" ? null : new Date().toISOString().slice(0, 10) };
    if (tab === "suppliers") payload = { ...payload, contact: contact.trim() || null };
    if (tab === "recipes") payload = { ...payload, preparation: category.trim() || null };
    const { error } = await supabase.from(tab).insert(payload);
    if (error) notify(error.message);
    else { notify(`${tabs.find(item => item.id === tab)?.title} salvo.`); setName(""); setCategory(""); setUnit(""); setUsageUnit(""); setPrice(""); setContact(""); await refresh(); }
    setBusy(false);
  }

  const headings: Record<Tab, string[]> = { products: ["Produto", "Categoria", "Status"], ingredients: ["Ingrediente", "Unidade de compra", "Unidade de uso", "Preço informado"], suppliers: ["Fornecedor", "Contato"], recipes: ["Preparação", "Rendimento", "Versão", "Aprovação"] };
  const keys: Record<Tab, string[]> = { products: ["name", "category", "status"], ingredients: ["name", "purchase_unit", "usage_unit", "current_price"], suppliers: ["name", "contact"], recipes: ["name", "yield_quantity", "version", "approval_status"] };
  const display = (key: string, value: unknown) => value === null || value === undefined || value === "" ? "—" : typeof value === "number" && tab === "ingredients" && key === "current_price" ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : String(value);

  return <>
    <div className="page-title"><span className="eyebrow">CADASTROS TÉCNICOS · DADOS DO ESTABELECIMENTO</span><h1>Central técnica</h1><p className="muted">Registre apenas dados observados ou informados. Conversões e preços não são presumidos.</p></div>
    <div className="panel technical-panel">
      <div className="technical-tabs">{tabs.map(item => <button key={item.id} className={tab === item.id ? "technical-tab active" : "technical-tab"} onClick={() => setTab(item.id)}>{item.label}<span>{rows[item.id].length}</span></button>)}</div>
      <form className="technical-form" onSubmit={save}>
        <label>Nome<input value={name} onChange={event => setName(event.target.value)} required placeholder={`Nome do ${tabs.find(item => item.id === tab)?.title.toLowerCase()}`}/></label>
        {tab === "products" && <label>Categoria<input value={category} onChange={event => setCategory(event.target.value)} placeholder="Categoria, se informada"/></label>}
        {tab === "ingredients" && <><label>Unidade de compra<input value={unit} onChange={event => setUnit(event.target.value)} placeholder="Ex.: kg, L, caixa"/></label><label>Unidade de uso<input value={usageUnit} onChange={event => setUsageUnit(event.target.value)} placeholder="Ex.: g, ml, unidade"/></label><label>Preço informado (R$)<input type="number" min="0" step="0.0001" value={price} onChange={event => setPrice(event.target.value)} placeholder="Opcional"/></label></>}
        {tab === "suppliers" && <label>Contato<input value={contact} onChange={event => setContact(event.target.value)} placeholder="Telefone ou e-mail, se informado"/></label>}
        {tab === "recipes" && <label>Modo de preparo<input value={category} onChange={event => setCategory(event.target.value)} placeholder="Descrição inicial opcional"/></label>}
        <button className="primary" disabled={busy || !name.trim()}>{busy ? "Salvando…" : `Cadastrar ${tabs.find(item => item.id === tab)?.title.toLowerCase()}`}</button>
      </form>
      <div className="technical-table-wrap"><table className="technical-table"><thead><tr>{headings[tab].map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>{rows[tab].map((row,index)=><tr key={String(row.id ?? index)}>{keys[tab].map(key=><td key={key}>{display(key, row[key])}</td>)}</tr>)}</tbody></table>{rows[tab].length === 0 && <div className="empty-state">Nenhum registro cadastrado. Adicione somente informações coletadas para {site.id ? "este estabelecimento" : "o projeto"}.</div>}</div>
    </div>
  </>;
}
