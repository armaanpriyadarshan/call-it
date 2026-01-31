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

export async function getUserVotes(
  supabase: SupabaseClient,
  userId: string,
  questionIds?: string[]
): Promise<Map<string, 'left' | 'right'>> {
  let query = supabase
    .from('votes')
    .select('question_id, choice')
    .eq('user_id', userId);

  if (questionIds && questionIds.length > 0) {
    query = query.in('question_id', questionIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const votes = new Map<string, 'left' | 'right'>();
  for (const row of data || []) {
    votes.set(row.question_id, row.choice as 'left' | 'right');
  }

  return votes;
}

export interface VoteWithQuestion {
  id: string;
  question_id: string;
  user_id: string;
  choice: 'left' | 'right';
  created_at: string;
  question: {
    id: string;
    title: string;
    prompt: string;
    category: string | null;
    prompt_image_url: string | null;
    left_choice_label: string;
    left_choice_image_url: string | null;
    right_choice_label: string;
    right_choice_image_url: string | null;
    is_anonymous: boolean;
    user_id: string;
  };
}

export async function getUserVotingHistory(
  supabase: SupabaseClient,
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<VoteWithQuestion[]> {
  let query = supabase
    .from('votes')
    .select(`
      id,
      question_id,
      user_id,
      choice,
      created_at,
      question:questions (
        id,
        title,
        prompt,
        category,
        prompt_image_url,
        left_choice_label,
        left_choice_image_url,
        right_choice_label,
        right_choice_image_url,
        is_anonymous,
        user_id
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data || []) as unknown as VoteWithQuestion[];
}

export async function getUserVotesCastCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function getTotalVotesOnUserQuestions(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  // First get all question IDs for this user
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('id')
    .eq('user_id', userId);

  if (questionsError) {
    throw questionsError;
  }

  if (!questions || questions.length === 0) {
    return 0;
  }

  const questionIds = questions.map((q) => q.id);

  // Then count all votes on those questions
  const { count, error: votesError } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .in('question_id', questionIds);

  if (votesError) {
    throw votesError;
  }

  return count || 0;
}

export async function getQuestionIdsVotedByUsers(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }

  const { data, error } = await supabase
    .from('votes')
    .select('question_id')
    .in('user_id', userIds);

  if (error) {
    throw error;
  }

  return new Set((data || []).map((v) => v.question_id));
}
