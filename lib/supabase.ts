import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseReady = Boolean(url && publishableKey);

// Sessão persistida pelo próprio Supabase Auth (renovação automática do token).
// Nenhum dado operacional fica no navegador: tudo é lido do banco com RLS.
export const supabase = supabaseReady
  ? createClient(url!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true},
    })
  : null;

export const EVIDENCE_BUCKET = "cmv-evidence";
