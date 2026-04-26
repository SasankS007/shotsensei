import { createBrowserClient } from "@supabase/ssr";
import {
  supabaseBrowserAnonKey,
  supabaseBrowserUrl,
} from "@/lib/supabase-browser-env";

export function createClient() {
  return createBrowserClient(supabaseBrowserUrl, supabaseBrowserAnonKey);
}

/** Singleton browser client for use outside React (stores, utils). */
export const supabase = createClient();
