import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vnbudeahnuysdbqxtzgk.supabase.co';
const supabaseAnonKey = 'sb_publishable_N6-EymL11gca5YTCAW9yAA_C0Hc-Az0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SyncUser {
  id: string;
  email: string;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  // If session is returned, user is auto-confirmed
  if (data.session) return data;
  // Otherwise, sign them in immediately
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return signInData;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<SyncUser | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email! };
}
