import type { Question as DbQuestion } from "@/lib/queries/questions";
import type { Question } from "@/types";

export function mapDbQuestionToQuestion(
  dbQuestion: DbQuestion,
  votes: { left: number; right: number },
  isAnonymous: boolean,
  creatorUsername?: string | null,
  userVote?: "left" | "right",
  currentUserId?: string,
): Question {
  const isOwnQuestion = currentUserId === dbQuestion.user_id;

  return {
    id: dbQuestion.id,
    visibleUserId: isAnonymous ? undefined : dbQuestion.user_id,
    title: dbQuestion.title,
    prompt: dbQuestion.prompt,
    promptImageUrl: dbQuestion.prompt_image_url ?? undefined,
    left: {
      id: "left",
      label: dbQuestion.left_choice_label,
      imageUrl: dbQuestion.left_choice_image_url ?? undefined,
    },
    right: {
      id: "right",
      label: dbQuestion.right_choice_label,
      imageUrl: dbQuestion.right_choice_image_url ?? undefined,
    },
    votes,
    meta: {
      category: dbQuestion.category ?? undefined,
      createdBy: isAnonymous ? "Anonymous" : (creatorUsername ?? undefined),
    },
    createdAt: dbQuestion.created_at,
    hasVoted: userVote !== undefined,
    userVote,
    isOwnQuestion,
  };
}
