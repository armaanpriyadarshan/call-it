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
            payload.new?.question_id || payload.old?.question_id;
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
