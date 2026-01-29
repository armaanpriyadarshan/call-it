import { createClient } from '@supabase/supabase-js';
import 'expo-sqlite/localStorage/install';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env');
}

export function createClerkSupabaseClient(session: { getToken: () => Promise<string | null> } | null) {
  return createClient(
    supabaseUrl!,
    supabasePublishableKey!,
    {
      accessToken: async () => session ? await session.getToken() : null,
    }
  );
}