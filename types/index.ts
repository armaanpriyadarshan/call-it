export type Choice = {
  id: "left" | "right";
  label: string;
  imageUrl?: string;
};

export type Question = {
  id: string;
  visibleUserId?: string; // The creator's user ID (for checking if it's the user's own question)
  title: string;
  prompt: string;
  promptImageUrl?: string;
  left: Choice;
  right: Choice;
  votes?: {
    left: number;
    right: number;
  };
  meta?: {
    category?: string;
    createdBy?: string;
  };
  createdAt?: string;
  /** Whether the current user has already voted on this question */
  hasVoted?: boolean;
  /** The user's vote direction if they voted */
  userVote?: "left" | "right";
  /** Whether this is the current user's own question */
  isOwnQuestion?: boolean;
};

export type User = {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  questionsCount?: number;
  followersCount?: number;
  isFollowing?: boolean;
};

export type VoteHistoryItem = {
  questionIndex?: number;
  questionId?: string;
  questionTitle?: string;
  direction: "left" | "right";
  votedAt?: string;
};

export type ImageInfo = {
  uri: string;
  width?: number;
  height?: number;
};
