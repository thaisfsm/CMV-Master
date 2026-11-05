"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Site = { id: string; organization_id: string; name: string; segment: string | null; management_names: string[]; contract_start: string | null; contract_end: string | null; contract_monthly_value: number | null };
export type Stage = { id: string; stage_number: number; title: string; objective: string; status: string; target_start: string; target_end: string };
export type Task = { id: string; title: string; description: string | null; status: string; stage_id: string | null; assignee_name: string | null; due_on: string | null; priority: string; visit_id: string | null; completed_at: string | null; created_at: string; updated_at?: string };
export type Response = { id: string; question_key: string; question: string; answer: string; evidence_status: string; situation: string | null; notes: string | null; visit_id: string | null; updated_at: string };
export type Visit = { id: string; visit_date: string; visit_type: string; status: string; participants: string[]; objective: string | null; observations: string | null; next_steps: string | null; stage_id: string | null; created_at: string; completed_at: string | null };
export type Evidence = { id: string; file_name: string; storage_path: string; media_type: string | null; size_bytes: number | null; created_at: string; question_key: string | null; visit_id: string | null; description: string | null; consent_recorded: boolean };
export type Counts = { products: number; ingredients: number; ingredientsWithPrice: number; suppliers: number; recipes: number; recipesWithItems: number; trainings: number; losses: number; purchases: number; receivedPurchases: number; closedInventories: number; salesRecords: number };

export type Workspace = {
  stages: Stage[]; tasks: Task[]; responses: Response[]; visits: Visit[]; evidence: Evidence[]; counts: Counts;
  loading: boolean; error: string | null; schemaOutdated: boolean; refresh: () => Promise<void>;
};

const emptyCounts: Counts = { products: 0, ingredients: 0, ingredientsWithPrice: 0, suppliers: 0, recipes: 0, recipesWithItems: 0, trainings: 0, losses: 0, purchases: 0, receivedPurchases: 0, closedInventories: 0, salesRecords: 0 };

// Erros do PostgREST quando a tabela/coluna ainda não existe no banco.
export function isSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return ["PGRST205", "PGRST204", "42P01", "42703"].includes(error.code ?? "") || /does not exist|schema cache/i.test(error.message ?? "");
}

export function friendlyError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return "";
  if (isSchemaError(error)) return "O banco de dados ainda não recebeu a atualização deste sprint. Os dados existentes estão preservados.";
  const message = error.message ?? "";
  if (/row-level security|permission denied|violates row-level/i.test(message)) return "Seu usuário não tem permissão para esta ação neste estabelecimento.";
  if (/Failed to fetch|NetworkError|network/i.test(message)) return "Sem conexão com o servidor. Verifique a internet e tente novamente; nada foi salvo.";
  if (/mime type|invalid_mime_type/i.test(message)) return "Tipo de arquivo não aceito pelo armazenamento.";
  if (/exceeded the maximum allowed size|Payload too large/i.test(message)) return "Arquivo maior que o limite permitido.";
  if (/Diagnostic approval requires/i.test(message)) return "Para concluir a etapa 1 é preciso registrar os 15 tópicos e concluir todas as tarefas da etapa.";
  return message;
}

export function useWorkspace(site: Site | null): Workspace {
  const [state, setState] = useState<Omit<Workspace, "refresh">>({ stages: [], tasks: [], responses: [], visits: [], evidence: [], counts: emptyCounts, loading: true, error: null, schemaOutdated: false });

  const refresh = useCallback(async () => {
    if (!supabase || !site) return;
    setState(current => ({ ...current, loading: true }));
    const by = (table: string, columns = "*") => supabase!.from(table).select(columns).eq("establishment_id", site.id);
    const count = (table: string) => supabase!.from(table).select("id", { count: "exact", head: true }).eq("establishment_id", site.id);
    const [stages, tasks, responses, visits, evidence, products, ingredients, priced, suppliers, recipes, trainings, losses, purchases, received, inventories, sales, recipeItems] = await Promise.all([
      by("implementation_stages").order("stage_number"),
      by("tasks").order("created_at"),
      by("diagnostic_responses"),
      by("visits").order("visit_date", { ascending: false }).order("created_at", { ascending: false }),
      by("evidence_files").order("created_at", { ascending: false }),
      count("products"), count("ingredients"), count("ingredients").not("current_price", "is", null), count("suppliers"), count("recipes"),
      count("training_sessions"), count("loss_cases"), count("purchases"), count("purchases").eq("status", "received"), count("inventory_counts").eq("status", "closed"), count("sales_records"),
      supabase.from("recipe_items").select("recipe_id, recipes!inner(establishment_id)").eq("recipes.establishment_id", site.id),
    ]);
    const core = [stages, tasks, responses, visits, evidence];
    const schemaOutdated = core.some(result => isSchemaError(result.error));
    const failure = core.find(result => result.error && !isSchemaError(result.error));
    setState({
      stages: (stages.data ?? []) as unknown as Stage[],
      tasks: ((tasks.data ?? []) as unknown as Partial<Task>[]).map(task => ({ priority: "normal", assignee_name: null, visit_id: null, ...task }) as Task),
      responses: ((responses.data ?? []) as unknown as Partial<Response>[]).map(row => ({ situation: null, notes: null, visit_id: null, ...row }) as Response),
      visits: (visits.data ?? []) as unknown as Visit[],
      evidence: (evidence.data ?? []) as unknown as Evidence[],
      counts: {
        products: products.count ?? 0, ingredients: ingredients.count ?? 0, ingredientsWithPrice: priced.count ?? 0, suppliers: suppliers.count ?? 0, recipes: recipes.count ?? 0,
        recipesWithItems: new Set(((recipeItems.data ?? []) as { recipe_id: string }[]).map(row => row.recipe_id)).size,
        trainings: trainings.count ?? 0, losses: losses.count ?? 0, purchases: purchases.count ?? 0, receivedPurchases: received.count ?? 0, closedInventories: inventories.count ?? 0, salesRecords: sales.count ?? 0,
      },
      loading: false,
      error: failure?.error ? friendlyError(failure.error) : null,
      schemaOutdated,
    });
  }, [site]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { ...state, refresh };
}

export function localDate(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
