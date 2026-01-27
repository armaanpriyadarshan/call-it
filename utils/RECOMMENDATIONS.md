# Recommendation Algorithm Documentation

## Overview

The recommendation algorithm for Call It determines which questions should be shown to users based on multiple factors from the database schema.

## Algorithm Factors

The algorithm scores questions using the following weighted factors:

### 1. Questions from Followed Users (100 points)
- **Priority**: Highest
- **Logic**: If a question is created by a user that the current user follows, it gets a high score boost
- **Rationale**: Users are more likely to engage with content from people they follow

### 2. Category Match from Recent Searches (50 points)
- **Priority**: High
- **Logic**: If a question's category matches categories extracted from the user's recent searches, it gets a score boost
- **Rationale**: Users are actively searching for content in these categories

### 3. Category Similarity to Voted Questions (30 points)
- **Priority**: Medium-High
- **Logic**: If a question's category matches categories of questions the user has previously voted on, it gets a score boost
- **Rationale**: Users tend to engage with similar content to what they've already shown interest in

### 4. Recency Bonus (0-20 points)
- **Priority**: Medium
- **Logic**: Newer questions get a recency bonus that decays over time (max bonus for questions < 24 hours old)
- **Formula**: `max(0, 20 - hoursSinceCreation * 0.5)`
- **Rationale**: Fresh content keeps the feed engaging

### 5. Engagement Bonus (0-15 points)
- **Priority**: Medium-Low
- **Logic**: Questions with more votes get an engagement bonus
- **Formula**: `min(15, totalVotes * 0.5)`
- **Rationale**: Popular questions are likely to be interesting

### Exclusion Rules
- Questions the user has already voted on are excluded (score set to -1)

## Usage

### Basic Usage with Supabase

```typescript
import { getRecommendedQuestionsForUser } from "@/services/recommendations";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const userId = "user-uuid-here";

// Get recommended questions
const recommendedQuestions = await getRecommendedQuestionsForUser(
  supabase,
  userId,
  20 // limit
);
```

### Advanced Usage with Scores

```typescript
import { fetchRecommendedQuestions } from "@/services/recommendations";

const recommended = await fetchRecommendedQuestions(supabase, userId, 20);

recommended.forEach((item) => {
  console.log(`Question: ${item.question.title}`);
  console.log(`Score: ${item.score}`);
  console.log(`Reasons: ${item.reasons.join(", ")}`);
});
```

### Manual Scoring

```typescript
import { calculateQuestionScore, type RecommendationFactors } from "@/utils/recommendations";

const factors: RecommendationFactors = {
  followedUserIds: ["user-1", "user-2"],
  recentSearchCategories: ["style", "career"],
  votedQuestionIds: ["question-1", "question-2"],
  votedQuestionCategories: ["style", "food"],
  userId: "current-user-id",
};

const score = calculateQuestionScore(question, factors);
```

## Database Queries

The algorithm requires the following data:

1. **User's follows**: `SELECT following_id FROM follows WHERE follower_id = $userId`
2. **Recent searches**: `SELECT query FROM recent_searches WHERE user_id = $userId ORDER BY created_at DESC LIMIT 10`
3. **User's votes**: `SELECT question_id, questions.category FROM votes WHERE user_id = $userId`
4. **Questions**: `SELECT * FROM questions WHERE id NOT IN (voted_question_ids) ORDER BY created_at DESC LIMIT 100`
5. **Vote counts**: `SELECT question_id, COUNT(*) FROM votes WHERE question_id IN (question_ids) GROUP BY question_id`

## Customization

### Adjusting Weights

Edit `call-it/utils/recommendations.ts` to adjust the scoring weights:

```typescript
// Increase weight for followed users
if (question.user_id && factors.followedUserIds.includes(question.user_id)) {
  score += 150; // Increased from 100
}

// Decrease weight for category matches
if (question.category && factors.recentSearchCategories.includes(...)) {
  score += 30; // Decreased from 50
}
```

### Adding New Factors

To add a new recommendation factor:

1. Add the factor to `RecommendationFactors` type
2. Fetch the data in `fetchRecommendedQuestions`
3. Add scoring logic in `calculateQuestionScore`

Example: Add a factor for questions from users with similar voting patterns

```typescript
// In calculateQuestionScore
if (factors.similarUsers.includes(question.user_id)) {
  score += 40;
  reasons.push("From user with similar interests");
}
```

## Performance Considerations

- The algorithm fetches up to 100 questions and scores them in memory
- For large user bases, consider:
  - Caching recommendation results
  - Pre-computing scores in the database
  - Using database views or materialized views
  - Implementing pagination

## Future Enhancements

Potential improvements to the algorithm:

1. **Machine Learning**: Train a model on user engagement patterns
2. **Collaborative Filtering**: Recommend based on users with similar voting patterns
3. **Content-Based Filtering**: Analyze question text/prompts for similarity
4. **Time-Based Decay**: More sophisticated recency calculations
5. **A/B Testing**: Test different scoring weights to optimize engagement

