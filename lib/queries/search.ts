import { SupabaseClient } from "@supabase/supabase-js";
import { Question } from "./questions";
import { Profile } from "./profiles";

export interface SearchQuestionsResult {
  questions: Question[];
  total: number;
  hasMore: boolean;
}

export interface SearchProfilesResult {
  profiles: Profile[];
  total: number;
  hasMore: boolean;
}

export interface SearchAllResult {
  questions: SearchQuestionsResult;
  profiles: SearchProfilesResult;
}

export async function searchQuestions(
  supabase: SupabaseClient,
  query: string,
  options?: { limit?: number; offset?: number }
): Promise<SearchQuestionsResult> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const pattern = `%${query}%`;

  // Get total count first
  const { count, error: countError } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .or(
      `title.ilike.${pattern},prompt.ilike.${pattern},category.ilike.${pattern},left_choice_label.ilike.${pattern},right_choice_label.ilike.${pattern}`
    );

  if (countError) {
    throw countError;
  }

  // Get paginated results
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .or(
      `title.ilike.${pattern},prompt.ilike.${pattern},category.ilike.${pattern},left_choice_label.ilike.${pattern},right_choice_label.ilike.${pattern}`
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  const total = count ?? 0;
  const hasMore = offset + limit < total;

  return {
    questions: data || [],
    total,
    hasMore,
  };
}

export async function searchProfiles(
  supabase: SupabaseClient,
  query: string,
  options?: { limit?: number; offset?: number }
): Promise<SearchProfilesResult> {
  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;
  const pattern = `%${query}%`;

  // Get total count first
  const { count, error: countError } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .or(
      `username.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`
    );

  if (countError) {
    throw countError;
  }

  // Get paginated results
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .or(
      `username.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  const total = count ?? 0;
  const hasMore = offset + limit < total;

  return {
    profiles: data || [],
    total,
    hasMore,
  };
}

export async function searchAll(
  supabase: SupabaseClient,
  query: string,
  options?: { questionsLimit?: number; profilesLimit?: number }
): Promise<SearchAllResult> {
  const [questions, profiles] = await Promise.all([
    searchQuestions(supabase, query, { limit: options?.questionsLimit ?? 20 }),
    searchProfiles(supabase, query, { limit: options?.profilesLimit ?? 10 }),
  ]);

  return { questions, profiles };
}

export type AutocompleteSuggestion = {
  type: "question" | "user";
  id: string;
  label: string;
  sublabel?: string;
};

export async function autocompleteSearch(
  supabase: SupabaseClient,
  query: string,
  options?: { questionsLimit?: number; profilesLimit?: number }
): Promise<AutocompleteSuggestion[]> {
  const questionsLimit = options?.questionsLimit ?? 5;
  const profilesLimit = options?.profilesLimit ?? 3;
  const pattern = `%${query}%`;

  const [questionsResult, profilesResult] = await Promise.all([
    supabase
      .from("questions")
      .select("id, title")
      .or(`title.ilike.${pattern},category.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(questionsLimit),
    supabase
      .from("profiles")
      .select("user_id, username, first_name, last_name")
      .or(
        `username.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`
      )
      .order("created_at", { ascending: false })
      .limit(profilesLimit),
  ]);

  const suggestions: AutocompleteSuggestion[] = [];

  if (questionsResult.data) {
    for (const q of questionsResult.data) {
      suggestions.push({
        type: "question",
        id: q.id,
        label: q.title,
      });
    }
  }

  if (profilesResult.data) {
    for (const p of profilesResult.data) {
      const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");
      suggestions.push({
        type: "user",
        id: p.user_id,
        label: p.username || "Unknown",
        sublabel: fullName || undefined,
      });
    }
  }

  return suggestions;
}
