import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

export function useRealtimeQuestions(
  supabase: SupabaseClient | null,
  onInsert: (question: any) => void,
  onUpdate: (question: any) => void,
  onDelete: (questionId: string) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("questions-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "questions",
        },
        (payload) => {
          onInsert(payload.new);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "questions",
        },
        (payload) => {
          onUpdate(payload.new);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "questions",
        },
        (payload) => {
          onDelete(payload.old.id);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase, onInsert, onUpdate, onDelete]);
}

export function useRealtimeVotes(
  supabase: SupabaseClient | null,
  questionIds: string[],
  onVoteChange: (questionId: string) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || questionIds.length === 0) return;

    const channel = supabase
      .channel("votes-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
          filter: `question_id=in.(${questionIds.join(",")})`,
        },
        (payload: any) => {
          const questionId =
            payload.new?.question_id || payload.old?.question_id;
          if (questionId) {
            onVoteChange(questionId);
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase, questionIds.join(","), onVoteChange]);
}

export function useRealtimeVoteCounts(
  supabase: SupabaseClient | null,
  questionIds: string[],
  onCountsChange: (questionId: string) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || questionIds.length === 0) return;

    const channel = supabase
      .channel("votes-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
        },
        (payload) => {
          const questionId =
            (payload.new as any)?.question_id ||
            (payload.old as any)?.question_id;
          if (questionId && questionIds.includes(questionId)) {
            onCountsChange(questionId);
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase, questionIds.join(","), onCountsChange]);
}

export function useRealtimeUserQuestionVotes(
  supabase: SupabaseClient | null,
  userQuestionIds: string[],
  onVoteReceived: (questionId: string, voteData: any) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || userQuestionIds.length === 0) return;

    const channel = supabase
      .channel("user-question-votes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
        },
        (payload) => {
          const questionId =
            (payload.new as any)?.question_id ||
            (payload.old as any)?.question_id;
          if (questionId && userQuestionIds.includes(questionId)) {
            onVoteReceived(questionId, payload);
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase, userQuestionIds.join(","), onVoteReceived]);
}

export function useRealtimeUserVotes(
  supabase: SupabaseClient | null,
  userId: string | null,
  onVoteCast: (voteData: any) => void,
  onVoteRemoved: (voteData: any) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`user-votes-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "votes",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onVoteCast(payload.new);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "votes",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onVoteRemoved(payload.old);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase, userId, onVoteCast, onVoteRemoved]);
}

export function useRealtimeUserQuestions(
  supabase: SupabaseClient | null,
  userId: string | null,
  onQuestionCreated: (questionData: any) => void,
  onQuestionDeleted: (questionId: string) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`user-questions-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "questions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onQuestionCreated(payload.new);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "questions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onQuestionDeleted((payload.old as any).id);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase, userId, onQuestionCreated, onQuestionDeleted]);
}

export function useRealtimeFollows(
  supabase: SupabaseClient | null,
  userId: string | null,
  onFollowerChange: (isNewFollower: boolean) => void,
  onFollowingChange: (isNewFollowing: boolean) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`follows-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "follows",
        },
        (payload) => {
          const newFollow = payload.new as any;
          if (newFollow.following_id === userId) {
            onFollowerChange(true);
          }
          if (newFollow.follower_id === userId) {
            onFollowingChange(true);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "follows",
        },
        (payload) => {
          const oldFollow = payload.old as any;
          if (oldFollow.following_id === userId) {
            onFollowerChange(false);
          }
          if (oldFollow.follower_id === userId) {
            onFollowingChange(false);
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase, userId, onFollowerChange, onFollowingChange]);
}
