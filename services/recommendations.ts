/**
 * Recommendation Service
 * 
 * This service provides functions to fetch recommended questions from Supabase
 * using the recommendation algorithm.
 */

import type { Question } from "@/types";
import {
  getRecommendedQuestions,
  extractCategoriesFromSearches,
  type RecommendationFactors,
} from "@/utils/recommendations";

/**
 * Type for Supabase client (adapt this to your actual Supabase client type)
 */
type SupabaseClient = any;

/**
 * Fetch recommended questions for a user
 * 
 * @param supabase - Supabase client instance
 * @param userId - The user ID to get recommendations for
 * @param limit - Maximum number of questions to return (default: 20)
 * @returns Array of recommended questions with scores
 */
export async function fetchRecommendedQuestions(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 20
): Promise<Array<{ question: Question; score: number; reasons: string[] }>> {
  // Fetch user's followed users
  const { data: follows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  const followedUserIds = follows?.map((f) => f.following_id) || [];

  // Fetch user's recent searches
  const { data: recentSearches } = await supabase
    .from("recent_searches")
    .select("query")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const searchQueries = recentSearches?.map((s) => s.query) || [];
  const recentSearchCategories = extractCategoriesFromSearches(searchQueries);

  // Fetch user's votes to exclude and get categories
  const { data: votes } = await supabase
    .from("votes")
    .select("question_id, questions!inner(category)")
    .eq("user_id", userId);

  const votedQuestionIds = votes?.map((v) => v.question_id) || [];
  const votedQuestionCategories = Array.from(
    new Set(
      votes
        ?.map((v: any) => v.questions?.category)
        .filter((cat: string | null) => cat !== null)
        .map((cat: string) => cat.toLowerCase()) || []
    )
  );

  // Build recommendation factors
  const factors: RecommendationFactors = {
    followedUserIds,
    recentSearchCategories,
    votedQuestionIds,
    votedQuestionCategories,
    userId,
  };

  // Fetch questions (excluding already voted ones)
  // Prioritize questions from followed users and recent questions
  let questionsQuery = supabase
    .from("questions")
    .select(`
      id,
      user_id,
      title,
      prompt,
      category,
      prompt_image_url,
      left_choice_label,
      left_choice_image_url,
      right_choice_label,
      right_choice_image_url,
      is_anonymous,
      created_at,
      updated_at
    `)
    .order("created_at", { ascending: false })
    .limit(100); // Fetch more than needed to allow for scoring

  // Exclude already voted questions if any
  // Note: Supabase doesn't support NOT IN directly, so we filter in memory
  const { data: allQuestions, error } = await questionsQuery;

  // Filter out already voted questions
  const questions = allQuestions?.filter(
    (q) => !votedQuestionIds.includes(q.id)
  ) || [];

  if (error) {
    console.error("Error fetching questions:", error);
    return [];
  }

  // Get vote counts for each question
  const questionIds = questions?.map((q) => q.id) || [];
  const { data: voteCounts } = await supabase
    .from("votes")
    .select("question_id")
    .in("question_id", questionIds);

  // Count votes per question
  const voteCountMap = new Map<string, number>();
  voteCounts?.forEach((v) => {
    voteCountMap.set(v.question_id, (voteCountMap.get(v.question_id) || 0) + 1);
  });

  // Transform questions to include vote counts
  const questionsWithVotes = questions?.map((q) => ({
    ...q,
    total_votes: voteCountMap.get(q.id) || 0,
  })) || [];

  // Calculate recommendation scores
  const recommended = getRecommendedQuestions(questionsWithVotes, factors);

  // Transform to Question type format
  const recommendedQuestions = recommended.slice(0, limit).map((item) => {
    const q = item.question;
    return {
      question: {
        id: q.id,
        title: q.title,
        prompt: q.prompt,
        promptImageUrl: q.prompt_image_url || undefined,
        left: {
          id: "left" as const,
          label: q.left_choice_label,
          imageUrl: q.left_choice_image_url || undefined,
        },
        right: {
          id: "right" as const,
          label: q.right_choice_label,
          imageUrl: q.right_choice_image_url || undefined,
        },
        meta: {
          category: q.category || undefined,
          createdBy: q.is_anonymous ? "Anonymous" : undefined, // You'll need to join with profiles for username
        },
        createdAt: q.created_at,
      } as Question,
      score: item.score,
      reasons: item.reasons,
    };
  });

  return recommendedQuestions;
}

/**
 * Simplified version that returns just the questions (without scores)
 * Useful for direct integration into components
 */
export async function getRecommendedQuestionsForUser(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 20
): Promise<Question[]> {
  const recommended = await fetchRecommendedQuestions(supabase, userId, limit);
  return recommended.map((item) => item.question);
}

