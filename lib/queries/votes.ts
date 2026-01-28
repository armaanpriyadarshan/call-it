import { SupabaseClient } from '@supabase/supabase-js';

export interface Vote {
  id: string;
  question_id: string;
  user_id: string;
  choice: 'left' | 'right';
  created_at: string;
}

export interface VoteCounts {
  question_id: string;
  left_votes: number;
  right_votes: number;
  total_votes: number;
}

export async function createVote(
  supabase: SupabaseClient,
  questionId: string,
  userId: string,
  choice: 'left' | 'right'
): Promise<Vote> {
  const { data, error } = await supabase
    .from('votes')
    .upsert({
      question_id: questionId,
      user_id: userId,
      choice,
    }, {
      onConflict: 'question_id,user_id',
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteVote(
  supabase: SupabaseClient,
  questionId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('votes')
    .delete()
    .eq('question_id', questionId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function getUserVote(
  supabase: SupabaseClient,
  questionId: string,
  userId: string
): Promise<Vote | null> {
  const { data, error } = await supabase
    .from('votes')
    .select('*')
    .eq('question_id', questionId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data;
}

export async function getVoteCounts(
  supabase: SupabaseClient,
  questionIds: string[]
): Promise<Map<string, { left: number; right: number }>> {
  const { data, error } = await supabase
    .from('vote_counts')
    .select('*')
    .in('question_id', questionIds);

  if (error) {
    throw error;
  }

  const counts = new Map<string, { left: number; right: number }>();
  for (const row of data || []) {
    counts.set(row.question_id, {
      left: row.left_votes || 0,
      right: row.right_votes || 0,
    });
  }

  return counts;
}

export async function getUserVotedQuestionIds(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('votes')
    .select('question_id')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return new Set((data || []).map((v) => v.question_id));
}
