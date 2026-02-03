import { SupabaseClient } from '@supabase/supabase-js';

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface UserStats {
  questions_count: number;
  followers_count: number;
  following_count: number;
}

export async function getUserStats(
  supabase: SupabaseClient,
  userId: string
): Promise<UserStats> {
  const { data, error } = await supabase.rpc('get_user_stats', {
    target_user_id: userId,
  });

  if (error) {
    throw error;
  }

  const stats = data?.[0] ?? {
    questions_count: 0,
    followers_count: 0,
    following_count: 0,
  };

  return {
    questions_count: Number(stats.questions_count) || 0,
    followers_count: Number(stats.followers_count) || 0,
    following_count: Number(stats.following_count) || 0,
  };
}

export async function checkFollowStatus(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_follow_status', {
    follower_clerk_id: followerId,
    following_clerk_id: followingId,
  });

  if (error) {
    throw error;
  }

  return data === true;
}

export async function followUser(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<Follow> {
  const { data, error } = await supabase
    .from('follows')
    .insert({
      follower_id: followerId,
      following_id: followingId,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function unfollowUser(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (error) {
    throw error;
  }
}

export async function getFollowers(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('following_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => row.follower_id);
}

export async function getFollowing(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => row.following_id);
}

export interface FollowerWithProfile {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export async function getFollowersWithProfiles(
  supabase: SupabaseClient,
  userId: string
): Promise<FollowerWithProfile[]> {
  const followerIds = await getFollowers(supabase, userId);

  if (followerIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, first_name, last_name, avatar_url')
    .in('user_id', followerIds);

  if (error) {
    throw error;
  }

  const profileMap = new Map(
    (data || []).map((p) => [p.user_id, p])
  );

  return followerIds.map((id) => {
    const profile = profileMap.get(id);
    return {
      id,
      username: profile?.username || null,
      firstName: profile?.first_name || null,
      lastName: profile?.last_name || null,
      avatarUrl: profile?.avatar_url || null,
    };
  });
}

export async function getFollowingWithProfiles(
  supabase: SupabaseClient,
  userId: string
): Promise<FollowerWithProfile[]> {
  const followingIds = await getFollowing(supabase, userId);

  if (followingIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, first_name, last_name, avatar_url')
    .in('user_id', followingIds);

  if (error) {
    throw error;
  }

  const profileMap = new Map(
    (data || []).map((p) => [p.user_id, p])
  );

  return followingIds.map((id) => {
    const profile = profileMap.get(id);
    return {
      id,
      username: profile?.username || null,
      firstName: profile?.first_name || null,
      lastName: profile?.last_name || null,
      avatarUrl: profile?.avatar_url || null,
    };
  });
}
