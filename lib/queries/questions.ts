import { SupabaseClient } from "@supabase/supabase-js";

export interface Question {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  category: string | null;
  prompt_image_url: string | null;
  left_choice_label: string;
  left_choice_image_url: string | null;
  right_choice_label: string;
  right_choice_image_url: string | null;
  is_anonymous: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateQuestionData {
  user_id: string;
  title: string;
  prompt: string;
  left_choice_label: string;
  right_choice_label: string;
  category?: string | null;
  prompt_image_url?: string | null;
  left_choice_image_url?: string | null;
  right_choice_image_url?: string | null;
  is_anonymous?: boolean;
}

export async function createQuestion(
  supabase: SupabaseClient,
  data: CreateQuestionData,
): Promise<Question> {
  const { data: question, error } = await supabase
    .from("questions")
    .insert({
      user_id: data.user_id,
      title: data.title,
      prompt: data.prompt,
      left_choice_label: data.left_choice_label,
      right_choice_label: data.right_choice_label,
      category: data.category || null,
      prompt_image_url: data.prompt_image_url || null,
      left_choice_image_url: data.left_choice_image_url || null,
      right_choice_image_url: data.right_choice_image_url || null,
      is_anonymous: data.is_anonymous ?? false,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return question;
}

export async function getQuestion(
  supabase: SupabaseClient,
  questionId: string,
): Promise<Question | null> {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return data;
}

export async function getQuestions(
  supabase: SupabaseClient,
  options?: {
    limit?: number;
    offset?: number;
    category?: string;
    userId?: string;
  },
): Promise<Question[]> {
  let query = supabase
    .from("questions")
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.category) {
    query = query.eq("category", options.category);
  }

  if (options?.userId) {
    query = query.eq("user_id", options.userId);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit || 20) - 1,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function deleteQuestion(
  supabase: SupabaseClient,
  questionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId);

  if (error) {
    throw error;
  }
}

export interface UpdateQuestionData {
  title?: string;
  prompt?: string;
  category?: string | null;
  prompt_image_url?: string | null;
  left_choice_label?: string;
  left_choice_image_url?: string | null;
  right_choice_label?: string;
  right_choice_image_url?: string | null;
}

export async function updateQuestion(
  supabase: SupabaseClient,
  questionId: string,
  data: UpdateQuestionData,
): Promise<Question> {
  const { data: question, error } = await supabase
    .from("questions")
    .update(data)
    .eq("id", questionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return question;
}

// Extended question type with algorithm scores
export interface ScoredQuestion extends Question {
  total_votes: number;
  relevance_score?: number;
  hotness_score?: number;
  votes_24h?: number;
}

export async function getTrendingQuestions(
  supabase: SupabaseClient,
  userId: string,
  options?: { limit?: number }
): Promise<ScoredQuestion[]> {
  const { data, error } = await supabase.rpc('get_trending_questions', {
    p_user_id: userId,
    p_limit: options?.limit ?? 50,
  });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getForYouQuestions(
  supabase: SupabaseClient,
  userId: string,
  options?: { limit?: number }
): Promise<ScoredQuestion[]> {
  const { data, error } = await supabase.rpc('get_for_you_questions', {
    p_user_id: userId,
    p_limit: options?.limit ?? 50,
  });

  if (error) {
    throw error;
  }

  return data || [];
}

export interface CategoryPreference {
  category: string;
  vote_count: number;
  affinity_score: number;
}

export async function getUserCategoryPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<CategoryPreference[]> {
  const { data, error } = await supabase.rpc('get_user_category_preferences', {
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }

  return data || [];
}

export interface CategoryWithCount {
  category: string;
  count: number;
}

export async function getPopularCategories(
  supabase: SupabaseClient,
  options?: { limit?: number }
): Promise<CategoryWithCount[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("category")
    .not("category", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  // Count categories and sort by frequency
  const categoryCounts = new Map<string, number>();
  for (const row of data || []) {
    if (row.category) {
      categoryCounts.set(row.category, (categoryCounts.get(row.category) || 0) + 1);
    }
  }

  const sorted = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return sorted.slice(0, options?.limit ?? 10);
}
