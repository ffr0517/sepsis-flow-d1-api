let supabaseClient = null;

export async function initSupabaseClient({ supabaseUrl, supabaseAnonKey }) {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (supabaseClient) return supabaseClient;

  const module = await import("https://esm.sh/@supabase/supabase-js@2");
  supabaseClient = module.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return supabaseClient;
}

export function getSupabaseClient() {
  return supabaseClient;
}
