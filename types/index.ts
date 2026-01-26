export type Choice = {
  id: "left" | "right";
  label: string;
  imageUrl?: string;
};

export type Question = {
  id: string;
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
