import "server-only";

function requireServerEnv(name: string, value: string | undefined): string {
  if (value) return value;
  throw new Error(
    `Missing ${name}. Set SUPABASE_URL/SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_* env vars.`
  );
}

export function getServerSupabaseEnv() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    url: requireServerEnv("SUPABASE_URL", url),
    anonKey: requireServerEnv("SUPABASE_ANON_KEY", anonKey),
  };
}
