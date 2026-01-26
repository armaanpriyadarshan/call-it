export const calculatePercentage = (votes: number, total: number) => (total > 0 ? (votes / total) * 100 : 0);

export const getNormalizedPercentages = (leftVotes: number, rightVotes: number, total: number) => {
  if (total === 0) return { left: 0, right: 0 };

  const left = calculatePercentage(leftVotes, total);
  const right = calculatePercentage(rightVotes, total);
  const leftRounded = Math.round(left);
  const rightRounded = Math.round(right);
  const sum = leftRounded + rightRounded;

  if (sum !== 100) {
    return leftRounded >= rightRounded
      ? { left: leftRounded + (100 - sum), right: rightRounded }
      : { left: leftRounded, right: rightRounded + (100 - sum) };
  }
  return { left: leftRounded, right: rightRounded };
};

export const calculateVoteData = (
  question: { votes?: { left: number; right: number } } | null,
  swipeProgress: number,
  swipeDirection: "left" | "right" | null
) => {
  if (!question) {
    return {
      leftPercentage: 0,
      rightPercentage: 0,
      leftVotes: 0,
      rightVotes: 0,
      leftHighlight: 0,
      rightHighlight: 0,
    };
  }

  const currentVotes = question.votes ?? { left: 0, right: 0 };
  const currentTotal = currentVotes.left + currentVotes.right;

  const previewVotes = {
    left: swipeDirection === "left" ? currentVotes.left + 1 : currentVotes.left,
    right: swipeDirection === "right" ? currentVotes.right + 1 : currentVotes.right,
  };
  const totalPreviewVotes = previewVotes.left + previewVotes.right;

  const percentages =
    swipeProgress > 0 && swipeDirection
      ? getNormalizedPercentages(previewVotes.left, previewVotes.right, totalPreviewVotes)
      : getNormalizedPercentages(currentVotes.left, currentVotes.right, currentTotal);

  return {
    leftPercentage: percentages.left,
    rightPercentage: percentages.right,
    leftVotes: swipeProgress > 0 && swipeDirection === "left" ? previewVotes.left : currentVotes.left,
    rightVotes: swipeProgress > 0 && swipeDirection === "right" ? previewVotes.right : currentVotes.right,
    leftHighlight: swipeDirection === "left" ? swipeProgress : 0,
    rightHighlight: swipeDirection === "right" ? swipeProgress : 0,
  };
};
