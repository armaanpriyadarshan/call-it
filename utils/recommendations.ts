/**
 * Recommendation Algorithm for Call It
 * 
 * This algorithm scores questions based on multiple factors:
 * 1. Questions from followed users (highest priority)
 * 2. Questions in categories from recent searches
 * 3. Questions similar to ones the user has voted on
 * 4. Popular/recent questions (recency + engagement)
 * 5. Excludes questions the user has already voted on
 */

export type QuestionScore = {
  questionId: string;
  score: number;
  reasons: string[];
};

export type RecommendationFactors = {
  // User's followed user IDs
  followedUserIds: string[];
  // User's recent search categories (extracted from recent_searches)
  recentSearchCategories: string[];
  // User's voted question IDs (to exclude)
  votedQuestionIds: string[];
  // User's voted question categories (for similarity)
  votedQuestionCategories: string[];
  // User's ID
  userId: string;
};

/**
 * Main recommendation algorithm
 * 
 * Scoring breakdown:
 * - Followed user question: +100 points
 * - Category match from recent searches: +50 points
 * - Category match from voted questions: +30 points
 * - Recency bonus (newer questions): +0 to +20 points
 * - Engagement bonus (more votes): +0 to +15 points
 * 
 * Total possible score: ~215 points
 */
export function calculateQuestionScore(
  question: {
    id: string;
    user_id: string | null;
    category: string | null;
    created_at: string;
    total_votes?: number;
  },
  factors: RecommendationFactors
): QuestionScore {
  const reasons: string[] = [];
  let score = 0;

  // Factor 1: Questions from followed users (highest priority)
  if (question.user_id && factors.followedUserIds.includes(question.user_id)) {
    score += 100;
    reasons.push("From someone you follow");
  }

  // Factor 2: Category match from recent searches
  if (
    question.category &&
    factors.recentSearchCategories.includes(question.category.toLowerCase())
  ) {
    score += 50;
    reasons.push(`Matches your recent search: ${question.category}`);
  }

  // Factor 3: Category match from voted questions (similarity)
  if (
    question.category &&
    factors.votedQuestionCategories.includes(question.category.toLowerCase())
  ) {
    score += 30;
    reasons.push(`Similar to questions you've voted on`);
  }

  // Factor 4: Recency bonus (questions from last 24 hours get max bonus)
  const questionAge = Date.now() - new Date(question.created_at).getTime();
  const hoursSinceCreation = questionAge / (1000 * 60 * 60);
  const recencyBonus = Math.max(0, 20 - hoursSinceCreation * 0.5);
  score += recencyBonus;
  if (recencyBonus > 15) {
    reasons.push("Recently posted");
  }

  // Factor 5: Engagement bonus (more votes = more interesting)
  const engagementBonus = Math.min(15, (question.total_votes || 0) * 0.5);
  score += engagementBonus;
  if (engagementBonus > 10) {
    reasons.push("Popular question");
  }

  // Ensure we don't recommend questions the user has already voted on
  if (factors.votedQuestionIds.includes(question.id)) {
    score = -1; // Negative score to filter out
    reasons.push("Already voted");
  }

  return {
    questionId: question.id,
    score,
    reasons,
  };
}

/**
 * Get recommended questions with scores
 * 
 * This function should be called with a list of questions from the database
 * and will return them sorted by recommendation score (highest first)
 */
export function getRecommendedQuestions(
  questions: Array<{
    id: string;
    user_id: string | null;
    category: string | null;
    created_at: string;
    total_votes?: number;
  }>,
  factors: RecommendationFactors
): Array<{
  question: typeof questions[0];
  score: number;
  reasons: string[];
}> {
  const scoredQuestions = questions
    .map((question) => ({
      question,
      ...calculateQuestionScore(question, factors),
    }))
    .filter((item) => item.score >= 0) // Filter out already voted questions
    .sort((a, b) => b.score - a.score); // Sort by score descending

  return scoredQuestions;
}

/**
 * Helper function to extract categories from search queries
 * This is a simple implementation - you may want to enhance this
 * with NLP or a category mapping system
 */
export function extractCategoriesFromSearches(
  searchQueries: string[]
): string[] {
  const categories: string[] = [];
  
  // Common category keywords
  const categoryKeywords: Record<string, string[]> = {
    style: ["fashion", "outfit", "clothing", "style", "dress", "wear"],
    career: ["job", "career", "work", "promotion", "interview", "resume"],
    food: ["food", "restaurant", "cooking", "recipe", "meal", "dining"],
    social: ["friend", "dating", "relationship", "text", "message", "social"],
    travel: ["travel", "vacation", "trip", "destination", "hotel"],
    health: ["fitness", "exercise", "workout", "health", "diet"],
    tech: ["technology", "tech", "app", "software", "device"],
  };

  searchQueries.forEach((query) => {
    const lowerQuery = query.toLowerCase();
    Object.entries(categoryKeywords).forEach(([category, keywords]: [string, string[]]) => {
      if (keywords.some((keyword: string) => lowerQuery.includes(keyword))) {
        if (!categories.includes(category)) {
          categories.push(category);
        }
      }
    });
  });

  return categories;
}

/**
 * SQL query helper - generates the base query for recommended questions
 * This is meant to be used with Supabase or similar SQL databases
 * 
 * Note: You'll need to adapt this to your actual database client
 */
export const RECOMMENDATION_QUERY = `
  WITH user_votes AS (
    SELECT DISTINCT question_id, category
    FROM votes v
    JOIN questions q ON v.question_id = q.id
    WHERE v.user_id = $1
  ),
  user_follows AS (
    SELECT following_id
    FROM follows
    WHERE follower_id = $1
  ),
  recent_searches AS (
    SELECT DISTINCT query
    FROM recent_searches
    WHERE user_id = $1
    AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 10
  ),
  question_stats AS (
    SELECT 
      q.id,
      q.user_id,
      q.category,
      q.created_at,
      COUNT(v.id) as total_votes
    FROM questions q
    LEFT JOIN votes v ON q.id = v.question_id
    WHERE q.id NOT IN (SELECT question_id FROM user_votes)
    GROUP BY q.id, q.user_id, q.category, q.created_at
  )
  SELECT 
    qs.*,
    CASE WHEN uf.following_id IS NOT NULL THEN true ELSE false END as is_from_followed_user
  FROM question_stats qs
  LEFT JOIN user_follows uf ON qs.user_id = uf.following_id
  ORDER BY 
    is_from_followed_user DESC,
    qs.created_at DESC
  LIMIT 50
`;

/**
 * TypeScript types for the recommendation query result
 */
export type RecommendationQueryResult = {
  id: string;
  user_id: string | null;
  category: string | null;
  created_at: string;
  total_votes: number;
  is_from_followed_user: boolean;
};

