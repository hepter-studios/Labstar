import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/rest\/v1\/?$/, "");
const supabasePublicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? "";

const configured = supabaseUrl.startsWith("https://")
  && supabasePublicKey.length > 20
  && !supabasePublicKey.includes("SUA_CHAVE")
  && !supabasePublicKey.includes("cole_a_chave");

export const authClient: SupabaseClient | null = configured
  ? createClient(supabaseUrl, supabasePublicKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireAuthClient() {
  if (!authClient) throw new Error("supabase_not_configured");
  return authClient;
}
