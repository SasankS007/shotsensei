function requireBrowserEnv(name: string, value: string | undefined): string {
  if (value) return value;
  throw new Error(
    `Missing ${name}. Copy .env.example to .env.local and set Supabase keys.`
  );
}

export const supabaseBrowserUrl = requireBrowserEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL
);

export const supabaseBrowserAnonKey = requireBrowserEnv(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
