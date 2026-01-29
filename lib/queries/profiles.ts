import { SupabaseClient } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProfileData {
  user_id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
}

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data;
}

export async function createProfile(
  supabase: SupabaseClient,
  profileData: CreateProfileData
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert(profileData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function ensureProfile(
  supabase: SupabaseClient,
  profileData: CreateProfileData
): Promise<Profile> {
  const existing = await getProfile(supabase, profileData.user_id);

  if (existing) {
    return existing;
  }

  return createProfile(supabase, profileData);
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<Omit<CreateProfileData, 'user_id'>>
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getProfilesByUserIds(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Profile[]> {
  if (userIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', userIds);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getProfileByUsername(
  supabase: SupabaseClient,
  username: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data;
}
